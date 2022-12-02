
import https from 'https';
import dns from 'dns';
import { LookupFunction } from 'net';
import { createWriteStream, WriteStream } from 'fs';

import { Response } from 'node-fetch';

import { fetchRetry } from '../../../util/fetch-retry';
import { checkFile } from '../../../util/files';
import { Timer } from '../../../util/timer';
import { ScrapedBook } from '../../gutenberg-scrape/gutenberg-scrape';
import { getIntuitiveTimeString } from '../../../util/print-util';
import { sleep } from '../../../util/sleep';

export const MAX_CONCURRENT_DOWNLOADS = 75;
export const MAX_TOTAL_SOCKETS = 75;

export type ScrapedBookWithFile = {
  fileName: string;
  filePath: string;
} & ScrapedBook;

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

const httpsAgent = new https.Agent({
  family: 4,
  keepAlive: false,
  maxTotalSockets: MAX_TOTAL_SOCKETS,
  lookup: getMemoizedLookup(),
});

export async function downloadBooks(
  scrapedBooks: ScrapedBookWithFile[],
  progressCb?: (doneBookCount: number, totalBooks: number) => void,
) {
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

  ws = createWriteStream(filePath);
  return new Promise<void>((resolve, reject) => {
    ws.on('close', () => {
      resolve();
    });
    ws.on('error', err => {
      reject(err);
    });
    resp.body.pipe(ws);
  });
}
