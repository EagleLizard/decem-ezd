
import { Dirent } from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';

import { EBOOKS_DATA_DIR_PATH } from '../../../constants';
import { getIntuitiveTimeString } from '../../../util/print-util';
import { Timer } from '../../../util/timer';
import { getTxtBookMeta } from '../books/book-meta-service';
import { ScrapedBookWithFile } from '../books/books-service';
import { readFileStream } from './read-file-stream';
import { stripGutenbergBook } from './strip-gutenberg';

const MAX_CONCURRENT_BOOK_STREAMS = 20;

export async function parseBooksMain() {
  let booksMeta: ScrapedBookWithFile[];
  let booksToParse: ScrapedBookWithFile[];

  console.log('parse ~');
  booksMeta = await getTxtBookMeta();
  console.log(booksMeta.length);
  const testBookFilter = (bookMeta: ScrapedBookWithFile) => {
    return (
      [
        'the-witness-of-the-stars-by-e-w-bullinger',
        'the-declaration-of-independence-of-the-united-states-of-america-by-thomas-jefferson',
        'plutarchs-lives-volume-1-of-4-by-plutarch',
      ].some(missingTagTxt => missingTagTxt.includes(bookMeta.fileName))
      || bookMeta.fileName.includes('the-art-of-war-by-active-6th-century-bc-sunzi')
      || bookMeta.fileName.includes('art-of-war')
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
  
  let stripTimer: Timer, stripMs: number;

  doneCount = 0;
  donePrintMod = Math.ceil(books.length / 140);

  const doneCb = () => {
    doneCount++;
    // if((doneCount % donePrintMod) === 0) {
    //   process.stdout.write('x');
    // }
  };

  console.log('stripGutenbergBooks_');
  console.log('');
  stripTimer = Timer.start();
  await stripGutenbergBooks(books, {
    doneCb,
  });
  stripMs = stripTimer.stop();
  console.log('');
  console.log(`Stripped headers from ${doneCount.toLocaleString()} books in ${getIntuitiveTimeString(stripMs)}`);

}

async function stripGutenbergBooks(books: ScrapedBookWithFile[], opts: {
  doneCb?: (book?: ScrapedBookWithFile) => void,
} = {}) {
  for(let i = 0; i < books.length; ++i) {
    let currBook: ScrapedBookWithFile;
    currBook = books[i];
    await stripGutenbergBook(currBook);
    opts.doneCb?.(currBook);
  }
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
