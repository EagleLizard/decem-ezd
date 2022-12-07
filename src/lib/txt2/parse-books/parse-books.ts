
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
      // bookMeta.fileName.startsWith('p')
      [
        'st-john-damascene-on-holy-images-πρὸς-τοὺς-διαβάλλοντας-τᾶς-ἁγίας-εἰκόνας',
        'a-vindication-of-the-rights-of-woman-by-mary-wollstonecraft',
        'the-2000-cia-world-factbook-by-united-states-central-intelligence-agency',
        'the-2010-cia-world-factbook-by-united-states-central-intelligence-agency',
        'an-index-of-the-divine-comedy-by-dante-by-dante-alighieri',
        'the-analects-of-confucius-from-the-chinese-classics-by-confucius',
        'antiquities-of-the-jews-by-flavius-josephus',
        'the-chinese-classics-volume-1-confucian-analects-by-james-legge',
        'the-crowd-a-study-of-the-popular-mind-by-gustave-le-bon',
        'the-declaration-of-independence-of-the-united-states-of-america-by-thomas-jefferson',
        'the-decameron-volume-i-by-giovanni-boccaccio',
        'following-the-equator-a-journey-around-the-world-by-mark-twain',
        'the-koran-alquran-by-g-margoliouth-and-j-m-rodwell',
        'the-little-man-a-farcical-morality-in-three-scenes-by-john-galsworthy',
        'hamlet-by-william-shakespeare',
        'in-darkest-england-and-the-way-out-by-william-booth',
        'les-trois-mousquetaires-by-alexandre-dumas',
        'lulus-library-volume-1-of-3-by-louisa-may-alcott',
        'moby-word-lists-by-grady-ward',
        'the-united-states-bill-of-rights-by-united-states',
        'this-country-of-ours-by-h-e-marshall',
        'othello-by-william-shakespeare',
        'websters-unabridged-dictionary-by-various',
        'plutarch-lives-of-the-noble-grecians-and-romans-by-plutarch',
      ].some(missingTagTxt => missingTagTxt.includes(bookMeta.fileName))
      // || bookMeta.fileName.includes('the-art-of-war-by-active-6th-century-bc-sunzi')
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
  let errCount: number, errBooks: ScrapedBookWithFile[];
  let smallPrintCount: number;
  let errBookStr: string;
  smallPrintCount = 0;
  errBooks = [];
  for(let i = 0; i < books.length; ++i) {
    let currBook: ScrapedBookWithFile;
    currBook = books[i];
    await stripGutenbergBook(currBook, {
      cb: (err, _book) => {
        if(err) {
          if(err.hasSmallPrint) {
            smallPrintCount++;
          }
          // console.log(err);
          errBooks.push(_book);
        } else {
          opts.doneCb?.(_book);
        }
      }
    });
  }
  errCount = errBooks.length;
  if(errCount > 0) {
    errBookStr = errBooks.map(errBook => errBook.fileName).join('\n');
    // console.log(`\n${errBookStr}`);
    console.log(`\nnum books failed to strip: ${errCount.toLocaleString()}`);
    console.log(`failed with small print: ${smallPrintCount.toLocaleString()}`);
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