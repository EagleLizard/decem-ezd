
import { createReadStream, ReadStream } from 'fs';
import * as readline from 'readline';
import { isPromise } from 'util/types';

import { gutenbergScrapeMain } from '../gutenberg-scrape/gutenberg-scrape';
import { fetchBooks } from './books/fetch-books';

enum TXT2_ARGS {
  SCRAPE = 'SCRAPE',
  PARSE = 'PARSE',
}

const TXT2_ARG_MAP: Record<TXT2_ARGS, string> = {
  [TXT2_ARGS.SCRAPE]: 'scrape',
  [TXT2_ARGS.PARSE]: 'parse',
};

const ALT_HIGH_WATERMARK = 16 * 1024;

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
  console.log('parse ~');
}

type StreamFileOpts = {
  lineCb?: (line: string) => void | Promise<void>;
  chunkCb?: (chunk: string | Buffer) => void | Promise<void>;
};

async function streamFile(filePath: string, opts: StreamFileOpts) {
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
  if(highWaterMark !== undefined) {
    console.log(`highWaterMark: ${highWaterMark}`);
  }

}
