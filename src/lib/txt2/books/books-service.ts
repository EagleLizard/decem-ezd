
import https from 'https';
import dns from 'dns';
import { LookupFunction } from 'net';
import { createWriteStream, WriteStream } from 'fs';

import { Response } from 'node-fetch';
import _chunk from 'lodash.chunk';

import { fetchRetry } from '../../../util/fetch-retry';
import { Timer } from '../../../util/timer';
import { isNumber } from '../../../util/validate-primitives';
import { ScrapedBookWithFile } from '../../../models/scraped-book';

const BOOK_DOWNLOAD_CHUNK_SIZE = 50;

export type DownloadBooksResult = {
  ms: number;
  doneCount: number;
};

export type DownloadBookCbError = NodeJS.ErrnoException & {
  status?: number,
  response?: Response,
};
export type DownloadBookCbResult = {
  book: ScrapedBookWithFile;
};

const sharedHttpsAgent = new https.Agent({
  family: 4,
  lookup: getMemoizedLookup(),
});

export async function downloadBooks(
  scrapedBooks: ScrapedBookWithFile[],
  downloadCb: (err: DownloadBookCbError, result: DownloadBookCbResult) => void,
): Promise<DownloadBooksResult> {
  let downloadBooksTimer: Timer, downloadBooksMs: number;
  let bookChunks: ScrapedBookWithFile[][];
  let doneBookCount: number;

  console.log('');
  console.log(`BOOK_DOWNLOAD_CHUNK_SIZE: ${BOOK_DOWNLOAD_CHUNK_SIZE}`);
  console.log('');

  doneBookCount = 0;
  bookChunks = _chunk(scrapedBooks, BOOK_DOWNLOAD_CHUNK_SIZE);

  downloadBooksTimer = Timer.start();

  for(let i = 0; i < bookChunks.length; ++i) {
    let currBookChunk: ScrapedBookWithFile[], bookChunkPromises: Promise<void>[];
    currBookChunk = bookChunks[i];
    bookChunkPromises = [];
    for(let k = 0; k < currBookChunk.length; ++k) {
      let currBook: ScrapedBookWithFile, currBookPromise: Promise<void>;
      currBook = currBookChunk[k];
      currBookPromise = (async () => {
        let cbErr: DownloadBookCbError;
        try {
          await downloadBook(currBook, sharedHttpsAgent);
        } catch(e) {
          if(!isNumber(e?.status) || (e.status < 300)) {
            throw e;
          }
          cbErr = e;
        }
        downloadCb(cbErr, {
          book: currBook,
        });
        doneBookCount++;
      })();
      bookChunkPromises.push(currBookPromise);
    }
    await Promise.all(bookChunkPromises);
  }

  downloadBooksMs = downloadBooksTimer.stop();

  return {
    ms: downloadBooksMs,
    doneCount: doneBookCount,
  };
}

async function downloadBook(scrapedBook: ScrapedBookWithFile, httpsAgent?: https.Agent) {
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

  if(resp.status !== 200) {
    throw {
      ...(new Error(`Error: Status ${resp.status} from book ${scrapedBook.title}`)),
      response: resp,
      book: scrapedBook,
      status: resp.status,
    };
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

function getMemoizedLookup(): LookupFunction {
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
      if(address !== undefined) {
        hostIpMap[hostname] = address;
      }
      cb(err, addresses?.[0], 4);
    });
  };
  return _lookup;
}
