
import path from 'path';
import https from 'https';
import dns from 'dns';
import { createWriteStream, Dirent, WriteStream } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { LookupFunction } from 'net';

import fetch, { Response } from 'node-fetch';
import _chunk from 'lodash.chunk';

import { EBOOKS_DATA_DIR_PATH, SCRAPED_EBOOKS_DIR_PATH, SCRAPED_EBOOKS_FILE_NAME } from '../../constants';
import { checkDir, checkFile, mkdirIfNotExistRecursive } from '../../util/files';
import { gutenbergScrapeMain, ScrapedBook } from '../gutenberg-scrape/gutenberg-scrape';
import { Timer } from '../../util/timer';
import { getIntuitiveTimeString } from '../../util/print-util';
import { sleep } from '../../util/sleep';
import { fetchRetry } from '../../util/fetch-retry';
import { zipShuffle } from '../../util/shuffle';

type ScrapedBookWithFile = {
  fileName: string;
  filePath: string;
} & ScrapedBook;

const TXT_SCRAPE_COMMAND = 'scrape';

const MAX_CONCURRENT_DOWNLOADS = 75;
const MAX_TOTAL_SOCKETS = 75;

const getMemoizedLookup: () => LookupFunction = () => {
  let _lookup: LookupFunction;
  let hostIpMap: Record<string, string>;
  hostIpMap = {};
  _lookup = (hostname, opts, cb) => {
    if(hostIpMap[hostname] !== undefined) {
      process.nextTick(() => {
        cb(undefined, hostIpMap[hostname], 4);
      });
      return;
    }
    dns.resolve4(hostname, (err, addresses) => {
      let address: string;
      if(err) {
        cb(err, undefined, undefined);
        return;
      }
      address = addresses?.[0];
      // console.log(`\nresolved: '${hostname}' to: ${address}\n`);
      if(address !== undefined) {
        hostIpMap[hostname] = address;
      }
      cb(err, addresses?.[0], 4);
    });
  };
  return _lookup;
};

const getHttpsAgent = () => new https.Agent({
  family: 4,
  keepAlive: false,
  maxTotalSockets: MAX_TOTAL_SOCKETS,
  lookup: getMemoizedLookup(),
});

const httpsAgent = getHttpsAgent();

export async function txt2Main(argv: string[]) {
  let cliArgs: string[], cmdArg: string;
  cliArgs = argv.slice(2);
  cmdArg = cliArgs[0];
  if(cmdArg === TXT_SCRAPE_COMMAND) {
    await gutenbergScrapeMain();
  } else {
    await initBooks();
  }
}

async function initBooks() {
  let scrapedBooks: ScrapedBookWithFile[];
  console.log(`MAX_CONCURRENT_DOWNLOADS: ${MAX_CONCURRENT_DOWNLOADS}`);
  console.log(`MAX_TOTAL_SOCKETS: ${MAX_TOTAL_SOCKETS}`);
  await mkdirIfNotExistRecursive(EBOOKS_DATA_DIR_PATH);
  scrapedBooks = await loadScrapedBooksMeta();
  scrapedBooks.sort((a, b) => {
    return a.fileName.localeCompare(b.fileName);
  });
  // scrapedBooks = scrapedBooks.slice(0, Math.round(scrapedBooks.length / 2));
  scrapedBooks = zipShuffle(scrapedBooks);
  await downloadBooks(scrapedBooks);
}

async function downloadBooks(scrapedBooks: ScrapedBookWithFile[]) {
  let downloadBooksTimer: Timer, downloadBooksMs: number;
  let doneBookCount: number, donePercent: number,
    donePrintMod: number, donePercentPrintMod: number;
  let scrapedBooksToDownload: ScrapedBookWithFile[];
  let runningDownloads: number;
  runningDownloads = 0;
  doneBookCount = 0;
  scrapedBooksToDownload = [];
  for(let i = 0; i < scrapedBooks.length; ++i) {
    let scrapedBook: ScrapedBookWithFile, fileExists: boolean;
    scrapedBook = scrapedBooks[i];
    fileExists = await checkFile(scrapedBook.filePath);
    if(!fileExists) {
      scrapedBooksToDownload.push(scrapedBook);
    }
  }
  console.log(`scrapedBooksToDownload: ${scrapedBooksToDownload.length.toLocaleString()}`);
  console.log('');

  donePrintMod = Math.ceil(scrapedBooksToDownload.length / 120);
  donePercentPrintMod = Math.ceil(scrapedBooksToDownload.length / 13);
  console.log(`donePrintMod: ${donePrintMod}`);
  console.log(`donePercentPrintMod: ${donePercentPrintMod}`);

  downloadBooksTimer = Timer.start();
  for(let i = 0; i < scrapedBooksToDownload.length; ++i) {
    let scrapedBook: ScrapedBookWithFile;
    while(runningDownloads >= MAX_CONCURRENT_DOWNLOADS) {
      await sleep(10);
    }
    scrapedBook = scrapedBooksToDownload[i];
    runningDownloads++;
    (async () => {
      await downloadBook(scrapedBook);
      runningDownloads--;
      doneBookCount++;
      donePercent = doneBookCount / scrapedBooksToDownload.length;
      if((doneBookCount % donePercentPrintMod) === 0) {
        // process.stdout.write(`${(donePercent * 100).toFixed(1)}%`);
        process.stdout.write(`${Math.round(donePercent * 100)}%`);
      } else if((doneBookCount % donePrintMod) === 0) {
        process.stdout.write('.');
      }
      // console.log(`Downloaded ${scrapedBook.title}`);
      // console.log(`${doneBookCount}/${scrapedBooks.length}`);
      // console.log(`${(donePercent * 100).toFixed(1)}%, ${getIntuitiveTimeString(downloadBooksTimer.currentMs())}`);
    })();
  }
  while(runningDownloads > 0) {
    await sleep(10);
  }
  console.log('');
  downloadBooksMs = downloadBooksTimer.stop();
  console.log(`Downloaded ${doneBookCount.toLocaleString()} books in ${getIntuitiveTimeString(downloadBooksMs)}`);
}

async function downloadBook(scrapedBook: ScrapedBookWithFile) {
  let filePath: string;
  let resp: Response, ws: WriteStream;

  filePath = scrapedBook.filePath;

  const doRetry = (err: any) => {
    if(
      (err?.code === 'ECONNRESET')
      || (err?.code === 'ETIMEDOUT')
      || (err?.code === 'ETIMEOUT')
      || (err?.code === 'ENOTFOUND')
      || (err?.code === 'EREFUSED')
    ) {
      return true;
    }
  };
  const retryDelay = (attempt: number, err: any) => {
    switch(err?.code) {
      case 'ECONNRESET':
        process.stdout.write(`R${attempt}x`);
        break;
      case 'ETIMEDOUT':
        process.stdout.write(`TD${attempt}x`);
        break;
      case 'ETIMEOUT':
        process.stdout.write(`T${attempt}x`);
        break;
      case 'ENOTFOUND':
        process.stdout.write(`NF${attempt}x`);
        break;
      case 'EREFUSED':
        process.stdout.write(`RF${attempt}x`);
        break;
    }
    // console.log(err?.message);
    // console.log(`attempt: ${attempt}`);
    return (attempt * 100);
  };
  try {
    resp = await fetchRetry(scrapedBook.plaintextUrl, {
      agent: httpsAgent,
      doRetry,
      retryDelay,
      retries: 5,
    });
  } catch(e) {
    console.error(e);
    console.error(e.code);
    throw e;
  }

  // try {
  //   resp = await fetch(scrapedBook.plaintextUrl, {
  //     agent: httpsAgent,
  //   });
  // } catch(e) {
  //   // console.log(resp.status);
  //   console.log(e);
  //   console.log(e.code);
  //   throw e;
  // }
  ws = createWriteStream(filePath);
  return new Promise<void>((resolve, reject) => {
    // resp.body.on('end', () => {
    //   resolve();
    // });
    ws.on('close', () => {
      resolve();
    });
    ws.on('error', err => {
      reject(err);
    });
    resp.body.pipe(ws);
  });
}

async function loadScrapedBooksMeta(): Promise<ScrapedBookWithFile[]> {
  let scrapedDirExists: boolean, scrapedMetaDirents: Dirent[];
  let scrapedBookMetaPaths: string[], scrapedBooksMeta: ScrapedBookWithFile[];
  let scrapedBooksWithFileNames: ScrapedBookWithFile[];
  scrapedDirExists = await checkDir(SCRAPED_EBOOKS_DIR_PATH);
  if(!scrapedDirExists) {
    throw new Error(`Directory doesn't exist, expected: ${SCRAPED_EBOOKS_DIR_PATH}`);
  }
  scrapedMetaDirents = await readdir(SCRAPED_EBOOKS_DIR_PATH, {
    withFileTypes: true,
  });
  scrapedBookMetaPaths = scrapedMetaDirents.reduce((acc, curr) => {
    if(
      curr.name.includes(SCRAPED_EBOOKS_FILE_NAME)
      && curr.isFile()
    ) {
      acc.push([
        SCRAPED_EBOOKS_DIR_PATH,
        curr.name,
      ].join(path.sep));
    }
    return acc;
  }, [] as string[]);
  
  scrapedBooksMeta = [];

  for(let i = 0; i < scrapedBookMetaPaths.length; ++i) {
    let currScrapedBookMetaPath: string;
    let currBooksMeta: ScrapedBook[], metaFileData: Buffer;
    currScrapedBookMetaPath = scrapedBookMetaPaths[i];
    metaFileData = await readFile(currScrapedBookMetaPath);
    currBooksMeta = JSON.parse(metaFileData.toString());
    console.log(`${currScrapedBookMetaPath}: ${currBooksMeta.length}`);
    for(let k = 0; k < currBooksMeta.length; ++k) {
      let currBookMeta: ScrapedBookWithFile;
      let foundBooksMetaIdx: number;
      currBookMeta = getScrapedBookWithFileName(currBooksMeta[k]);
      foundBooksMetaIdx = scrapedBooksMeta.findIndex(scrapedBookMeta => {
        return scrapedBookMeta.fileName === currBookMeta.fileName;
      });
      if(foundBooksMetaIdx === -1) {
        scrapedBooksMeta.push(currBookMeta);
      }
    }
  }
  console.log(scrapedBooksMeta.length);
  return scrapedBooksMeta;
}

function getScrapedBookWithFileName(scrapedBook: ScrapedBook): ScrapedBookWithFile {
  let withFileName: ScrapedBookWithFile;
  let titleNoPunct: string, titleKebabCase: string;
  titleKebabCase = getScrapedBookKebabTitle(scrapedBook.title);
  withFileName = {
    ...scrapedBook,
    fileName: titleKebabCase,
    filePath: [
      EBOOKS_DATA_DIR_PATH,
      `${titleKebabCase}.txt`,
    ].join(path.sep)
  };
  return withFileName;
}

function getScrapedBookKebabTitle(title: string) {
  let titleNoPunct: string, titleKebabCase: string;
  titleNoPunct = title.replace(/[^\p{L} ]/gu, '');
  titleKebabCase = titleNoPunct
    .toLowerCase()
    .split(' ')
    .filter(word => word.length > 0)
    .join('-')
  ;
  return titleKebabCase;
}
