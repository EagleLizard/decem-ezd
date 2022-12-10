
import { createWriteStream, Dirent, WriteStream } from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';

import rimraf from 'rimraf';

import { EBOOKS_DATA_DIR_PATH, STRIPPED_EBOOKS_DIR_PATH } from '../../../constants';
import { mkdirIfNotExistRecursive, _rimraf } from '../../../util/files';
import { getIntuitiveTimeString } from '../../../util/print-util';
import { Timer } from '../../../util/timer';
import { getTxtBookMeta } from '../books/book-meta-service';
import { ScrapedBookWithFile } from '../books/books-service';
import { readFileStream } from './read-file-stream';
import { stripGutenbergBook, StripGutenbergError } from './strip-gutenberg';

const DELIM_START_TAG_VAL = '<!--a1f55f5400';

export async function parseBooksMain() {
  let booksMeta: ScrapedBookWithFile[];
  let booksToParse: ScrapedBookWithFile[];

  console.log('strip ~');
  booksMeta = await getTxtBookMeta();
  console.log(booksMeta.length);
  const testBookFilter = (bookMeta: ScrapedBookWithFile) => {
    return (
      // bookMeta.fileName.startsWith('p')
      bookMeta.fileName.includes('the-art-of-war-by-active-6th-century-bc-sunzi')
      // || bookMeta.fileName.includes('art-of-war')
      || true
    );
  };
  const matchingTestBooks = booksMeta.filter(testBookFilter);
  booksToParse = matchingTestBooks.slice();

  console.log(`#booksToParse: ${booksToParse.length}`);

  // await countParse(booksToParse);
  await stripParse(booksToParse);
}

async function stripParse(books: ScrapedBookWithFile[]) {
  let doneCount: number, donePrintMod: number;
  let parsedCount: number, errCount: number, smallPrintCount: number;
  let stripTimer: Timer, stripMs: number;

  doneCount = 0;
  parsedCount = 0;
  errCount = 0;
  smallPrintCount = 0;
  donePrintMod = Math.ceil(books.length / 70);

  await mkdirIfNotExistRecursive(STRIPPED_EBOOKS_DIR_PATH);

  const doneCb = (err: StripGutenbergError, book: ScrapedBookWithFile) => {
    doneCount++;
    if(err) {
      errCount++;
      if(err.hasSmallPrint) {
        smallPrintCount++;
      }
    } else {
      parsedCount++;
    }
    if((doneCount % donePrintMod) === 0) {
      process.stdout.write('x');
    }
  };

  console.log('stripGutenbergBooks_');
  console.log('');
  stripTimer = Timer.start();
  await stripGutenbergBooks(books, {
    doneCb,
  });
  stripMs = stripTimer.stop();
  console.log('');
  console.log(`num books failed to strip: ${errCount.toLocaleString()}`);
  console.log(`failed with small print: ${smallPrintCount.toLocaleString()}`);
  console.log(`Stripped headers from ${parsedCount.toLocaleString()} books in ${getIntuitiveTimeString(stripMs)}`);
}

async function stripGutenbergBooks(books: ScrapedBookWithFile[], opts: {
  doneCb: (err?: StripGutenbergError, book?: ScrapedBookWithFile) => void,
}) {
  let totalLineCount: number;

  totalLineCount = 0;
  for(let i = 0; i < books.length; ++i) {
    let currBook: ScrapedBookWithFile;
    let lineCount: number;
    let destFileName: string, destFilePath: string;
    let ws: WriteStream, hasStripErr: boolean;

    currBook = books[i];
    lineCount = 0;
    hasStripErr = false;

    destFileName = `${currBook.fileName}.txt`;
    destFilePath = [
      STRIPPED_EBOOKS_DIR_PATH,
      destFileName,
    ].join(path.sep);

    ws = createWriteStream(destFilePath);

    await new Promise<void>((resolve, reject) => {
      ws.once('ready', () => {
        resolve();
      });
      ws.once('error', err => {
        console.error('error when opening writestream');
        console.error(err);
        reject(err);
      });
    });

    const lineCb = (line: string) => {
      if(lineCount !== 0) {
        ws.write('\n');
      }
      ws.write(`${line}`);
      lineCount++;
    };

    const doneCb = (err: StripGutenbergError, book: ScrapedBookWithFile) => {
      if(err) {
        hasStripErr = true;
      }
      opts.doneCb(err, book);
    };

    await stripGutenbergBook(currBook, {
      doneCb,
      lineCb,
    });

    const wsClosePromise = new Promise<void>((resolve) => {
      ws.once('finish', () => {
        resolve();
      });
    });
    ws.close();

    await wsClosePromise;

    if(hasStripErr) {
      /*
        Cleanup (delete) files if there was a strip err.
          We can only check after finishing streaming, because a file may have
          parsable start tags but not have parsable end tags
      */
      await _rimraf(destFilePath);
    } else {
      totalLineCount = totalLineCount + lineCount;
    }

  }
  console.log('');
  console.log(`total lines: ${totalLineCount.toLocaleString()}`);
}

async function countParse(booksToParse: ScrapedBookWithFile[]) {
  let doneCount: number, donePrintMod: number;
  let totalLineCount: number;

  let parseBooksTimer: Timer, parseBooksMs: number;
  totalLineCount = 0;
  doneCount = 0;
  donePrintMod = Math.ceil(booksToParse.length / 70);

  const doneCb = (res: ParseBookResult) => {
    doneCount++;
    totalLineCount += res.lines;
    if((doneCount % donePrintMod) === 0) {
      process.stdout.write('.');
    }
  };

  console.log('parseBooksSync');
  console.log('');
  parseBooksTimer = Timer.start();
  await parseBooksSync(booksToParse, {
    doneCb,
  });
  parseBooksMs = parseBooksTimer.stop();
  console.log('');
  console.log(`Parsed ${doneCount.toLocaleString()} books in ${getIntuitiveTimeString(parseBooksMs)}`);
  console.log(`total lines: ${totalLineCount.toLocaleString()}`);
}

type ParseBookResult = {
  book: ScrapedBookWithFile;
  lines: number;
};

async function parseBooksSync(
  books: ScrapedBookWithFile[],
  opts: {
    doneCb?: (parseBookResult?: ParseBookResult) => void,
  } = {}
) {
  for(let i = 0; i < books.length; ++i) {
    let currBook: ScrapedBookWithFile, currBookPath: string;
    let lineCount: number;
    currBook = books[i];
    currBookPath = await getBookPath(currBook);
    lineCount = 0;
    const lineCb = (line: string) => {
      lineCount++;
      if(line.includes(DELIM_START_TAG_VAL)) {
        console.log(`\n${line}`);
      }
    };
    await readFileStream(currBookPath, {
      lineCb,
    });
    opts.doneCb?.({
      book: currBook,
      lines: lineCount,
    });
  }
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
