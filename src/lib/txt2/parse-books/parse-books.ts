
import { Dirent } from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';

import { EBOOKS_DATA_DIR_PATH, STRIPPED_EBOOKS_DIR_PATH } from '../../../constants';
import { getIntuitiveTimeString } from '../../../util/print-util';
import { Timer } from '../../../util/timer';
import { getTxtBookMeta } from '../books/book-meta-service';
import { ScrapedBookWithFile } from '../books/books-service';
import { readFileStream } from './read-file-stream';

type CountParseResult = {
  lineCount: number;
}

export async function parseBooksMain() {
  console.log('!~ parse ~!');
  await countParseBooksHandler();
}

async function countParseBooksHandler() {
  let txtBooksMeta: ScrapedBookWithFile[], scrapedBooks: ScrapedBookWithFile[];
  let bookToParse: ScrapedBookWithFile[];
  txtBooksMeta = await getTxtBookMeta();
  scrapedBooks = txtBooksMeta.filter(bookMeta => {
    return (
      bookMeta.fileName.includes('the-art-of-war-by-active-6th-century-bc-sunzi')
      // || bookMeta.fileName.startsWith('p')
      || true
    );
  });

  await parseBooksSync(scrapedBooks);
}

async function parseBooksSync(booksToParse: ScrapedBookWithFile[]) {
  let books: ScrapedBookWithFile[], baseDir: string;
  let doneCount: number, totalLineCount: number, totalCharCount: number;
  let donePrintMod: number;
  let parseTimer: Timer, parseMs: number;

  // baseDir = EBOOKS_DATA_DIR_PATH;
  baseDir = STRIPPED_EBOOKS_DIR_PATH;

  const _getBookPath = getBookPathMemo(baseDir);

  totalLineCount = 0;
  totalCharCount = 0;
  doneCount = 0;
  books = [];

  for(let i = 0; i < booksToParse.length; ++i) {
    let currBook: ScrapedBookWithFile, foundBookPath: string;
    let nextBook: ScrapedBookWithFile;
    currBook = booksToParse[i];
    foundBookPath = await _getBookPath(currBook);
    if(foundBookPath === undefined) {
      continue;
    }
    nextBook = {
      ...currBook,
      filePath: foundBookPath,
    };
    books.push(nextBook);
  }

  donePrintMod = Math.ceil(books.length / 70);

  const doneCb = (res: CountParseDoneCbResult) => {
    doneCount++;
    totalLineCount += res.lineCount;
    totalCharCount += res.charCount;
    if((doneCount % donePrintMod) === 0) {
      process.stdout.write('➤');
      // process.stdout.write('△');
      // process.stdout.write('❯');
      // process.stdout.write('➣');
      // process.stdout.write('➢');
      // process.stdout.write('▁');
      // process.stdout.write('▂');
    }
  };

  parseTimer = Timer.start();

  for(let i = 0; i < books.length; ++i) {
    let currBook: ScrapedBookWithFile;
    currBook = books[i];
    await countParse({
      bookDir: baseDir,
      book: currBook,
      doneCb,
    });
  }

  parseMs = parseTimer.stop();

  console.log('');
  console.log(`parsed ${doneCount.toLocaleString()} books in ${getIntuitiveTimeString(parseMs)}`);
  console.log(`totalChars: ${totalCharCount.toLocaleString()}`);
  console.log(`totalLines: ${totalLineCount.toLocaleString()}`);
}

type CountParseDoneCbResult = {
  book: ScrapedBookWithFile;
  lineCount: number;
  charCount: number;
  bookFilePath: string;
};

type CountParseOpts = {
  bookDir: string;
  book: ScrapedBookWithFile;
  doneCb: (result: CountParseDoneCbResult) => void;
}

async function countParse(opts: CountParseOpts) {
  let fileName: string, filePath: string;
  let lineCount: number, charCount: number;

  fileName = `${opts.book.fileName}.txt`;
  filePath = [
    opts.bookDir,
    fileName
  ].join(path.sep);

  lineCount = 0;
  charCount = 0;

  const lineCb = (line: string) => {
    lineCount++;
    // for(let i = 0; i < line.length; ++i) {
    //   if((/[^\s]/gi).test(line[i])) {
    //     charCount++;
    //   }
    // }
  };

  await readFileStream(filePath, {
    lineCb,
  });

  opts.doneCb({
    book: opts.book,
    bookFilePath: filePath,
    lineCount,
    charCount,
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
