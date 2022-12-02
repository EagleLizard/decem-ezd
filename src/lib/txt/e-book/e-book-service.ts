
import {
  createReadStream,
  createWriteStream,
  ReadStream,
  WriteStream,
} from 'fs';
import * as readline from 'readline';
import { isPromise } from 'util/types';

import fetch, { Response } from 'node-fetch';

import { checkFile } from '../../../util/files';
import { EBookTxtFile } from '../txt-constants';
import { Timer } from '../../../util/timer';

const ALT_HIGH_WATERMARK = 16 * 1024;

export type ReadEBookOpts = {
  lineCb?: (line: string) => void | Promise<void>;
  chunkCb?: (chunk: string | Buffer) => void | Promise<void>;
};

export async function downloadEBook(eBookMeta: EBookTxtFile): Promise<EBookTxtFile> {
  let filePath: string, fileExists: boolean;
  let resp: Response, ws: WriteStream;
  filePath = eBookMeta.filePath;
  fileExists = await checkFile(filePath);
  if(fileExists) {
    return eBookMeta;
  }
  resp = await fetch(eBookMeta.uri);
  ws = createWriteStream(filePath);
  return new Promise<EBookTxtFile>((resolve, reject) => {
    ws.on('close', () => {
      resolve(eBookMeta);
    });
    ws.on('error', (err) => {
      reject(err);
    });
    resp.body.pipe(ws);
  });
}

export async function readEBook(
  eBookMeta: EBookTxtFile,
  opts: ReadEBookOpts,
): Promise<void> {
  let lineCb: ReadEBookOpts['lineCb'], chunkCb: ReadEBookOpts['chunkCb'];
  let rs: ReadStream;
  let eBookReadPromise: Promise<void>, rl: readline.Interface;
  let timer: Timer, deltaMs: number;

  let highWaterMark: number;

  // highWaterMark = ALT_HIGH_WATERMARK;
  lineCb = opts.lineCb;
  chunkCb = opts.chunkCb;

  eBookReadPromise = new Promise<void>((resolve, reject) => {
    rs = createReadStream(eBookMeta.filePath, {
      highWaterMark,
    });

    rs.on('error', err => {
      reject(err);
    });
    rs.on('close', () => {
      resolve();
    });
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
          })
        ;
      }
    });

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
  await eBookReadPromise;
  if(highWaterMark !== undefined) {
    console.log(`highWaterMark: ${highWaterMark}`);
  }
}
