
import { createWriteStream, Dirent, WriteStream } from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';

import rimraf from 'rimraf';

import { EBOOKS_DATA_DIR_PATH, STRIPPED_EBOOKS_DIR_PATH } from '../../../constants';
import { checkFile, mkdirIfNotExistRecursive, _rimraf } from '../../../util/files';
import { getIntuitiveTimeString } from '../../../util/print-util';
import { Timer } from '../../../util/timer';
import { getTxtBookMeta } from '../books/book-meta-service';
import { ScrapedBookWithFile } from '../books/books-service';
import { readFileStream } from './read-file-stream';
import { stripGutenbergBook, StripGutenbergError, StripGutenbergOpts } from './strip-gutenberg';

const DELIM_START_TAG_VAL = '<!--a1f55f5400';

export async function stripBooksMain() {
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
  await stripBooks(books, {
    doneCb,
  });
  stripMs = stripTimer.stop();
  console.log('');
  console.log(`num books failed to strip: ${errCount.toLocaleString()}`);
  console.log(`failed with small print: ${smallPrintCount.toLocaleString()}`);
  console.log(`Stripped headers from ${parsedCount.toLocaleString()} books in ${getIntuitiveTimeString(stripMs)}`);
}

async function stripBooks(books: ScrapedBookWithFile[], opts: {
  // doneCb: (err?: StripGutenbergError, book?: ScrapedBookWithFile) => void,
  doneCb: StripGutenbergOpts['doneCb'],
}) {
  let totalLineCount: number;

  totalLineCount = 0;
  for(let i = 0; i < books.length; ++i) {
    let currBook: ScrapedBookWithFile;
    let hasStripErr: boolean, strippedBookExists: boolean;
    let stripBookResult: StripBookResult;
    let destFileName: string, destFilePath: string;

    currBook = books[i];
    hasStripErr = false;

    const doneCb = (err: StripGutenbergError, book: ScrapedBookWithFile) => {
      if(err) {
        hasStripErr = true;
      }
      opts.doneCb(err, book);
    };

    destFileName = `${currBook.fileName}.txt`;
    destFilePath = [
      STRIPPED_EBOOKS_DIR_PATH,
      destFileName,
    ].join(path.sep);

    strippedBookExists = await checkFile(destFilePath);

    if(strippedBookExists) {
      stripBookResult = {
        lineCount: 0,
      };
      doneCb(undefined, currBook);
    } else {
      stripBookResult = await stripBook(currBook, {
        doneCb,
        destFilePath,
      });
    }


    if(hasStripErr) {
      /*
        Cleanup (delete) files if there was a strip err.
          We can only check after finishing streaming, because a file may have
          parsable start tags but not have parsable end tags
      */
      await _rimraf(destFilePath);
    } else {
      totalLineCount = totalLineCount + stripBookResult.lineCount;
    }

  }
  console.log('');
  console.log(`total lines: ${totalLineCount.toLocaleString()}`);
}

type StripBookResult = {
  lineCount: number;
};

async function stripBook(book: ScrapedBookWithFile, opts: {
  doneCb: StripGutenbergOpts['doneCb'],
  destFilePath: string,
}): Promise<StripBookResult> {
  let ws: WriteStream, wsFinishPromise: Promise<void>;
  let lineCount: number;
  let result: StripBookResult;

  lineCount = 0;

  ws = await initWs(opts.destFilePath);
  wsFinishPromise = getWsFinishPromise(ws);

  const lineCb = (line: string) => {
    // if(lineCount !== 0) {
    //   ws.write('\n');
    // }
    ws.write(`${line}\n`);
    lineCount++;
  };

  await stripGutenbergBook(book, {
    lineCb,
    doneCb: opts.doneCb,
  });
  ws.close();
  await wsFinishPromise;

  result = {
    lineCount,
  };
  return result;
}

async function initWs(_filePath: string): Promise<WriteStream> {
  let _ws: WriteStream;
  _ws = createWriteStream(_filePath);
  await new Promise<void>((resolve, reject) => {
    const wsReadyErrCb = (err: Error) => {
      console.error('error when opening writestream');
      reject(err);
    };
    _ws.once('ready', () => {
      _ws.removeListener('error', wsReadyErrCb);
      resolve();
    });
    _ws.once('error', wsReadyErrCb);
  });
  return _ws;
}
function getWsFinishPromise(_ws: WriteStream): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const wsCloseErrCb = (err: Error) => {
      console.error('error when writing to writestream');
      reject(err);
    };
    _ws.once('finish', () => {
      _ws.removeListener('error', wsCloseErrCb);
      resolve();
    });
    _ws.on('error', wsCloseErrCb);
  });
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
    // currBookPath = await getBookPath(currBook);
    currBookPath = currBook.filePath;
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
