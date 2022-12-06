
import https from 'https';
import dns from 'dns';
import { LookupFunction } from 'net';
import { createWriteStream, WriteStream } from 'fs';

import { Response } from 'node-fetch';

import { fetchRetry } from '../../../util/fetch-retry';
import { Timer } from '../../../util/timer';
import { ScrapedBook } from '../../gutenberg-scrape/gutenberg-scrape';
import { sleep } from '../../../util/sleep';

export const MAX_CONCURRENT_DOWNLOADS = 25;
export const MAX_TOTAL_SOCKETS = 25;

export type ScrapedBookWithFile = {
  fileName: string;
  filePath: string;
} & ScrapedBook;

export type DownloadBooksResult = {
  ms: number;
  doneCount: number;
};

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
  downloadCb: (
    err: NodeJS.ErrnoException & {
      status?: number,
      response?: Response,
    },
    result: {
      book: ScrapedBookWithFile;
    }
  ) => void,
): Promise<DownloadBooksResult> {
  let downloadBooksTimer: Timer, downloadBooksMs: number;
  let doneBookCount: number;
  let runningDownloads: number;

  runningDownloads = 0;
  doneBookCount = 0;

  downloadBooksTimer = Timer.start();
  for(let i = 0; i < scrapedBooks.length; ++i) {
    let scrapedBook: ScrapedBookWithFile;
    while(runningDownloads >= MAX_CONCURRENT_DOWNLOADS) {
      await sleep(10);
    }
    scrapedBook = scrapedBooks[i];
    runningDownloads++;
    (async () => {
      try {
        await downloadBook(scrapedBook);

        downloadCb(undefined, {
          book: scrapedBook,
        });
      } catch(e) {
        if(
          ((typeof e?.status) !== 'number')
          || e?.status < 300
        ) {
          throw e;
        } else {
          downloadCb(e, {
            book: scrapedBook,
          });
        }
      } finally {
        doneBookCount++;
        runningDownloads--;
      }
    })();
  }
  while(runningDownloads > 0) {
    await sleep(10);
  }
  downloadBooksMs = downloadBooksTimer.stop();
  return {
    ms: downloadBooksMs,
    doneCount: doneBookCount,
  };
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
