
import { Dirent } from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';

import _chunk from 'lodash.chunk';

import { EBOOKS_DATA_DIR_PATH, STRIPPED_EBOOKS_DIR_PATH } from '../../../constants';
import { getIntuitiveTimeString } from '../../../util/print-util';
import { Timer } from '../../../util/timer';
import { getTxtBookMeta } from '../books/book-meta-service';
import { ScrapedBookWithFile } from '../books/books-service';
import { readFileStream } from './read-file-stream';

/*
  process.stdout.write('➤');
  process.stdout.write('△');
  process.stdout.write('❯');
  process.stdout.write('➣');
  process.stdout.write('➢');
  process.stdout.write('▁');
  process.stdout.write('▂');
*/

export async function parseBooksMain() {
  console.log('!~ parse ~!');
  await countParseBooksHandler();
}

async function countParseBooksHandler() {
  let baseDir: string;
  let txtBooksMeta: ScrapedBookWithFile[], scrapedBooks: ScrapedBookWithFile[];
  let booksToParse: ScrapedBookWithFile[];

  // baseDir = EBOOKS_DATA_DIR_PATH;
  baseDir = STRIPPED_EBOOKS_DIR_PATH;

  const _getBookPath = getBookPathMemo(baseDir);

  txtBooksMeta = await getTxtBookMeta();
  scrapedBooks = txtBooksMeta.filter(bookMeta => {
    return (
      // bookMeta.fileName.includes('the-art-of-war-by-active-6th-century-bc-sunzi')
      // bookMeta.fileName.startsWith('p')
      // bookMeta.fileName.startsWith('a')
      // bookMeta.fileName.startsWith('n')
      bookMeta.fileName.startsWith('t')
      || true
    );
  });

  booksToParse = [];

  for(let i = 0; i < scrapedBooks.length; ++i) {
    let currBook: ScrapedBookWithFile, foundBookPath: string;
    let nextBook: ScrapedBookWithFile;
    currBook = scrapedBooks[i];
    foundBookPath = await _getBookPath(currBook);
    if(foundBookPath === undefined) {
      continue;
    }
    nextBook = {
      ...currBook,
      filePath: foundBookPath,
    };
    booksToParse.push(nextBook);
  }

  // await parseLineCountsSync(booksToParse, baseDir);
  await parseCharCountsSync(booksToParse, baseDir);
  // await parseCharCountsChunked(booksToParse, baseDir);
}

async function parseCharCountsChunked(books: ScrapedBookWithFile[], baseDir: string) {
  let doneCount: number, totalCharCount: number, totalLineCount: number;
  let bookChunks: ScrapedBookWithFile[][];
  let donePrintMod: number;
  let parseTimer: Timer, parseMs: number;

  const CHAR_COUNT_BOOK_CHUNK_SIZE = 10;
  console.log(`CHAR_COUNT_BOOK_CHUNK_SIZE: ${CHAR_COUNT_BOOK_CHUNK_SIZE}`);

  totalCharCount = 0;
  totalLineCount = 0;
  doneCount = 0;

  donePrintMod = Math.ceil(books.length / 70);

  const doneCb = (opts: CharCountParseCbResult) => {
    doneCount++;
    totalCharCount += opts.charCount;
    totalLineCount += opts.lineCount;
    if((doneCount % donePrintMod) === 0) {
      process.stdout.write('+');
    }
  };

  parseTimer = Timer.start();

  bookChunks = _chunk(books, CHAR_COUNT_BOOK_CHUNK_SIZE);

  for(let i = 0; i < bookChunks.length; ++i) {
    let currBookChunk: ScrapedBookWithFile[], currBookChunkPromises: Promise<void>[];
    currBookChunk = bookChunks[i];
    currBookChunkPromises = [];
    for(let k = 0; k < currBookChunk.length; ++k) {
      let bookPromise: Promise<void>;
      bookPromise = (async () => {
        let currBook: ScrapedBookWithFile;
        currBook = currBookChunk[k];
        await charCountParse({
          book: currBook,
          bookDir: baseDir,
          doneCb,
        });
      })();
      currBookChunkPromises.push(bookPromise);
    }
    await Promise.all(currBookChunkPromises);
  }

  parseMs = parseTimer.stop();

  console.log('');
  console.log(`parsed ${doneCount.toLocaleString()} books in ${getIntuitiveTimeString(parseMs)}`);
  console.log(`totalLines: ${totalLineCount.toLocaleString()}`);
  console.log(`totalChars: ${totalCharCount.toLocaleString()}`);
}

async function parseCharCountsSync(books: ScrapedBookWithFile[], baseDir: string) {
  let doneCount: number, totalCharCount: number, totalLineCount: number;
  let donePrintMod: number;
  let parseTimer: Timer, parseMs: number;

  totalCharCount = 0;
  totalLineCount = 0;
  doneCount = 0;

  donePrintMod = Math.ceil(books.length / 70);

  const doneCb = (opts: CharCountParseCbResult) => {
    doneCount++;
    totalCharCount += opts.charCount;
    totalLineCount += opts.lineCount;
    if((doneCount % donePrintMod) === 0) {
      process.stdout.write('+');
    }
  };

  parseTimer = Timer.start();

  for(let i = 0; i < books.length; ++i) {
    let currBook: ScrapedBookWithFile;
    currBook = books[i];
    await charCountParse({
      book: currBook,
      bookDir: baseDir,
      doneCb,
    });
  }

  parseMs = parseTimer.stop();

  console.log('');
  console.log(`parsed ${doneCount.toLocaleString()} books in ${getIntuitiveTimeString(parseMs)}`);
  console.log(`totalLines: ${totalLineCount.toLocaleString()}`);
  console.log(`totalChars: ${totalCharCount.toLocaleString()}`);
}

type CharCountParseCbResult = {
  book: ScrapedBookWithFile;
  bookFilePath: string;
  charCount: number;
  lineCount: number;
};

type CharCountParseOpts = {
  book: ScrapedBookWithFile;
  bookDir: string;
  doneCb: (result: CharCountParseCbResult) => void;
};

async function charCountParse(opts: CharCountParseOpts) {
  let fileName: string, filePath: string;
  let charCount: number, lineCount: number;

  fileName = `${opts.book.fileName}.txt`;
  filePath = [
    opts.bookDir,
    fileName
  ].join(path.sep);

  charCount = 0;
  lineCount = 0;

  const countLineChars = (line: string) => {
    for(let i = 0; i < line.length; ++i) {
      let currChar: string;
      currChar = line[i];
      if((/[\S]/gi).test(currChar)) {
        charCount++;
      }
    }
  };

  const lineCb = (line: string) => {
    lineCount++;
    countLineChars(line);
  };

  await readFileStream(filePath, {
    lineCb,
  });

  opts.doneCb({
    book: opts.book,
    bookFilePath: filePath,
    charCount,
    lineCount,
  });
}

async function parseLineCountsSync(books: ScrapedBookWithFile[], baseDir: string) {
  let doneCount: number, totalLineCount: number;
  let donePrintMod: number;
  let parseTimer: Timer, parseMs: number;

  console.log('parseLineCountsSync');

  totalLineCount = 0;
  doneCount = 0;

  donePrintMod = Math.ceil(books.length / 70);

  const doneCb = (res: LineCountParseDoneCbResult) => {
    doneCount++;
    totalLineCount += res.lineCount;
    if((doneCount % donePrintMod) === 0) {
      process.stdout.write('➤');
    }
  };

  parseTimer = Timer.start();

  for(let i = 0; i < books.length; ++i) {
    let currBook: ScrapedBookWithFile;
    currBook = books[i];
    await lineCountParse({
      bookDir: baseDir,
      book: currBook,
      doneCb,
    });
  }

  parseMs = parseTimer.stop();

  console.log('');
  console.log(`parsed ${doneCount.toLocaleString()} books in ${getIntuitiveTimeString(parseMs)}`);
  console.log(`totalLines: ${totalLineCount.toLocaleString()}`);
}

type LineCountParseDoneCbResult = {
  book: ScrapedBookWithFile;
  lineCount: number;
  bookFilePath: string;
};

type LineCountParseOpts = {
  bookDir: string;
  book: ScrapedBookWithFile;
  doneCb: (result: LineCountParseDoneCbResult) => void;
}

async function lineCountParse(opts: LineCountParseOpts) {
  let fileName: string, filePath: string;
  let lineCount: number;

  fileName = `${opts.book.fileName}.txt`;
  filePath = [
    opts.bookDir,
    fileName
  ].join(path.sep);

  lineCount = 0;

  const lineCb = (line: string) => {
    lineCount++;
  };

  await readFileStream(filePath, {
    lineCb,
  });

  opts.doneCb({
    book: opts.book,
    bookFilePath: filePath,
    lineCount,
  });
}

function getBookPathMemo(baseDir: string) {
  let dirents: Dirent[];
  return async function getBookPath(book: ScrapedBookWithFile): Promise<string> {
    let foundDirent: Dirent;
    let bookPath: string;
    if(dirents === undefined) {
      dirents = await readdir(baseDir, {
        withFileTypes: true,
      });
    }
    foundDirent = dirents.find(dirent => dirent.name.includes(book.fileName));
    if(!foundDirent) {
      return;
    }
    bookPath = [
      baseDir,
      foundDirent.name
    ].join(path.sep);
    return bookPath;
  };
}
