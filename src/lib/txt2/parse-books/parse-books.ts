
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
        'the-witness-of-the-stars-by-e-w-bullinger',
        // 'the-declaration-of-independence-of-the-united-states-of-america-by-thomas-jefferson',
        'plutarchs-lives-volume-1-of-4-by-plutarch',
        'civilization-in-the-united-states-an-inquiry-by-thirty-americans-by-harold-stearns',
        'ten-reasons-proposed-to-his-adversaries-for-disputation-in-the-name-by-campion',
        //---
        'campaign-pictures-of-the-war-in-south-africa-18991900-by-a-g-hales',
        'chicago-and-the-old-northwest-16731835-by-milo-milton-quaife',
        'childrens-hour-with-red-riding-hood-and-other-stories-by-pseud-watty-piper',
        'christina-albertas-father-by-h-g-wells',
        'christmas-eve-at-mulligans-by-marie-irish',
        'civilization-in-the-united-states-an-inquiry-by-thirty-americans-by-harold-stearns',
        //---
        'dante-the-central-man-of-all-the-world-by-john-t-slattery',
        'david-thompson-the-explorer-by-charles-norris-cochrane',
        'david-thompsonthe-explorer-by-charles-norris-cochrane',
        'democracy-in-america-volume-1-by-alexis-de-tocqueville',
        'dishes-made-without-meat-by-mrs-c-s-peel',
        'don-sturdy-in-the-tombs-of-gold-or-the-old-egyptians-great-secret-by-appleton',
        'dr-vermonts-fantasy-and-other-stories-by-hannah-lynch',
        //---
        'paradisi-in-sole-paradisus-terrestris-a-garden-of-all-sorts-of-pleasant-flowers',
        'paradisi-in-sole-paradisus-terrestris-or-a-garden-of-all-sorts-of-pleasant',
        'physiological-economy-in-nutrition-with-special-reference-to-the-minimal',
        'physiological-economy-in-nutrition-with-special-reference-to-the-minimal-proteid',
        'plutarch-lives-of-the-noble-grecians-and-romans-by-plutarch',
        'plutarchs-lives-volume-1-of-4-by-plutarch',
        'poine-a-study-in-ancient-greek-bloodvengeance-by-hubert-joseph-treston',
        'prehistoric-villages-castles-and-towers-of-southwestern-colorado-by-fewkes',
        'present-status-and-prospects-of-the-peace-movement-by-bertha-von-suttner',
        'present-status-and-prospects-of-the-peace-movement-by-bertha-von-süttner',
        'prince-ragnal-and-other-holiday-verses-by-eleanor-c-donnelly',
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
