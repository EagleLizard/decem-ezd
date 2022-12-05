
import { createReadStream, ReadStream } from 'fs';
import * as readline from 'readline';
import { isPromise } from 'util/types';

// const ALT_HIGH_WATERMARK = 16 * 1024;
const ALT_HIGH_WATERMARK = 8 * 1024;
// const ALT_HIGH_WATERMARK = 256;

export type StreamFileOpts = {
  lineCb?: (line?: string) => void | Promise<void>;
  chunkCb?: (chunk?: string | Buffer) => void | Promise<void>;
};

export async function readFileStream(filePath: string, opts: StreamFileOpts) {
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
