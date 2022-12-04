
import { createReadStream, Dirent, ReadStream } from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';
import * as readline from 'readline';
import { isPromise } from 'util/types';
import { EBOOKS_DATA_DIR_PATH } from '../../constants';
import { getIntuitiveTimeString } from '../../util/print-util';
import { Timer } from '../../util/timer';

import { gutenbergScrapeMain } from '../gutenberg-scrape/gutenberg-scrape';
import { getTxtBookMeta } from './books/book-meta-service';
import { ScrapedBookWithFile } from './books/books-service';
import { fetchBooks } from './books/fetch-books';

enum TXT2_ARGS {
  SCRAPE = 'SCRAPE',
  PARSE = 'PARSE',
}

const TXT2_ARG_MAP: Record<TXT2_ARGS, string> = {
  [TXT2_ARGS.SCRAPE]: 'scrape',
  [TXT2_ARGS.PARSE]: 'parse',
};

// const ALT_HIGH_WATERMARK = 16 * 1024;
const ALT_HIGH_WATERMARK = 8 * 1024;

export async function txt2Main(argv: string[]) {
  let cliArgs: string[], cmdArg: string;
  cliArgs = argv.slice(2);
  cmdArg = cliArgs[0];
  switch(cmdArg) {
    case TXT2_ARG_MAP.SCRAPE:
      await gutenbergScrapeMain();
      break;
    case TXT2_ARG_MAP.PARSE:
      await parseBooksMain();
      break;
    default:
      await fetchBooks();
  }
}

async function parseBooksMain() {
  let booksMeta: ScrapedBookWithFile[];
  let booksToParse: ScrapedBookWithFile[];
  let doneBookCount: number, totalLineCount: number;
  let parseBooksTimer: Timer, parseBooksMs: number;
  console.log('parse ~');
  booksMeta = await getTxtBookMeta();
  console.log(booksMeta.length);
  const testBookFilter = (bookMeta: ScrapedBookWithFile) => {
    return (
      bookMeta.fileName.includes('the-art-of-war-by-active-th-century-bc-sunzi')
      || bookMeta.fileName.includes('art-of-war')
      || true
    );
  };
  const matchingTestBooks = booksMeta.filter(testBookFilter);
  booksToParse = matchingTestBooks.slice();
  doneBookCount = 0;
  totalLineCount = 0;
  const doneBookPrintMod = Math.ceil(booksToParse.length / 70);

  console.log('');

  parseBooksTimer = Timer.start();

  for(let i = 0; i < booksToParse.length; ++i) {
    let currBook: ScrapedBookWithFile, currBookPath: string;
    let lineCount: number;
    currBook = booksToParse[i];
    currBookPath = await getBookPath(currBook);
    lineCount = 0;
    const lineCb = (line: string) => {
      lineCount++;
    };
    await readFileStream(currBookPath, {
      lineCb,
    });
    doneBookCount++;
    totalLineCount += lineCount;
    if((doneBookCount % doneBookPrintMod) === 0) {
      process.stdout.write('.');
    }
  }

  parseBooksMs = parseBooksTimer.stop();

  console.log('');

  console.log(`total lines: ${totalLineCount.toLocaleString()}`);
  console.log(`Parsed ${booksToParse.length.toLocaleString()} books in ${getIntuitiveTimeString(parseBooksMs)}`);

}

const getBookPath = (() => {
  let dirents: Dirent[];
  return async function getBookPath(book: ScrapedBookWithFile): Promise<string> {
    let foundDirent: Dirent;
    let bookPath: string;
    if(dirents === undefined) {
      dirents = await readdir(EBOOKS_DATA_DIR_PATH, {
        withFileTypes: true,
      });
    }
    foundDirent = dirents.find(dirent => {
      return dirent.name.includes(book.fileName);
    });
    if(!foundDirent) {
      return;
    }
    bookPath = [
      EBOOKS_DATA_DIR_PATH,
      foundDirent.name,
    ].join(path.sep);
    return bookPath;
  };
})();

type StreamFileOpts = {
  lineCb?: (line: string) => void | Promise<void>;
  chunkCb?: (chunk: string | Buffer) => void | Promise<void>;
};

async function readFileStream(filePath: string, opts: StreamFileOpts) {
  let lineCb: StreamFileOpts['lineCb'], chunkCb: StreamFileOpts['chunkCb'];
  let rs: ReadStream;
  let readPromise: Promise<void>, rl: readline.Interface;
  let highWaterMark: number;

  // highWaterMark = ALT_HIGH_WATERMARK;

  lineCb = opts.lineCb;
  chunkCb = opts.chunkCb;

  readPromise = new Promise<void>((resolve, reject) => {
    rs = createReadStream(filePath, {
      highWaterMark,
    });

    rs.on('error', err => {
      reject(err);
    });
    rs.on('close', () => {
      resolve();
    });
    if(chunkCb !== undefined) {
      rs.on('data', chunk => {
        let chunkCbResult: void | Promise<void>;
        chunkCbResult = chunkCb?.(chunk);
        if(isPromise(chunkCbResult)) {
          rs.pause();
          chunkCbResult
            .then(() => {
              rs.resume();
            })
            .catch(err => {
              reject(err);
            });
        }
      });
    }
    if(lineCb !== undefined) {
      rl = readline.createInterface({
        input: rs,
        crlfDelay: Infinity,
      });
      rl.on('line', line => {
        let lineCbResult: void | Promise<void>;
        lineCbResult = lineCb?.(line);
        if(isPromise(lineCbResult)) {
          rl.pause();
          lineCbResult
            .then(() => {
              rl.resume();
            })
            .catch(err => {
              reject(err);
            })
          ;
        }
      });
    }
  });

  await readPromise;
}
