
import { EBOOKS_DATA_DIR_PATH, TXT_EBOOKS_META_DIR_PATH, TXT_EBOOKS_META_FILE_PATH } from '../../../constants';
import { checkFile, mkdirIfNotExistRecursive } from '../../../util/files';
import {
  downloadBooks,
  DownloadBooksResult,
  ScrapedBookWithFile,
} from './books-service';
import { getScrapedBooksMeta } from './book-meta-service';
import { zipShuffle } from '../../../util/shuffle';
import { getIntuitiveTimeString } from '../../../util/print-util';
import { writeFile, readFile } from 'fs/promises';

export async function fetchBooks() {
  let scrapedBooks: ScrapedBookWithFile[];
  let booksToDownload: ScrapedBookWithFile[], booksDownloaded: ScrapedBookWithFile[];
  let downloadBooksResult: DownloadBooksResult;
  let doneCount: number;

  await mkdirIfNotExistRecursive(EBOOKS_DATA_DIR_PATH);
  scrapedBooks = await getScrapedBooksMeta();
  console.log(`scrapedBooks.length: ${scrapedBooks.length.toLocaleString()}`);

  scrapedBooks.sort((a, b) => {
    return a.fileName.localeCompare(b.fileName);
  });
  scrapedBooks = zipShuffle(scrapedBooks);
  booksToDownload = [];
  for(let i = 0; i < scrapedBooks.length; ++i) {
    let scrapedBook: ScrapedBookWithFile, fileExists: boolean;
    scrapedBook = scrapedBooks[i];
    fileExists = await checkFile(scrapedBook.filePath);
    if(
      !fileExists
      // || (scrapedBook.fileName.startsWith('a-'))
      // || scrapedBook.fileName.startsWith('p')
    ) {
      booksToDownload.push(scrapedBook);
    }
  }

  doneCount = 0;
  booksDownloaded = [];

  const donePrintMod = Math.ceil(booksToDownload.length / 150);
  const donePercentPrintMod = Math.ceil(booksToDownload.length / 13);

  console.log(`scrapedBooksToDownload: ${booksToDownload.length.toLocaleString()}`);
  downloadBooksResult = await downloadBooks(booksToDownload, (err, res) => {
    let donePercent: number;
    doneCount++;

    if(err) {
      process.stdout.write(`ST${err?.status}x`);
    } else {
      booksDownloaded.push(res.book);
    }
    if((doneCount % donePercentPrintMod) === 0) {
      donePercent = doneCount / booksToDownload.length;
      process.stdout.write(`${Math.round(donePercent * 100)}%`);
    } else if((doneCount % donePrintMod) === 0) {
      process.stdout.write('.');
    }
  });
  console.log('');
  console.log(`Downloaded ${booksDownloaded.length.toLocaleString()} books in ${getIntuitiveTimeString(downloadBooksResult.ms)}`);
  await writeTxtBookMeta(booksDownloaded);
}

async function writeTxtBookMeta(scrapedBooks: ScrapedBookWithFile[]) {
  let metaFileExists: boolean, prevBooksMeta: ScrapedBookWithFile[], nextBookMeta: ScrapedBookWithFile[],
    scrapedBooksDeduped: ScrapedBookWithFile[];
  let metaFileData: string;
  await mkdirIfNotExistRecursive(TXT_EBOOKS_META_DIR_PATH);
  metaFileExists = await checkFile(TXT_EBOOKS_META_FILE_PATH);
  if(metaFileExists) {
    prevBooksMeta = JSON.parse((await readFile(TXT_EBOOKS_META_FILE_PATH)).toString());
  } else {
    prevBooksMeta = [];
  }
  console.log(`prevBooksMeta.length: ${prevBooksMeta.length.toLocaleString()}`);
  scrapedBooksDeduped = scrapedBooks.filter((scrapedBook) => {
    let foundPrevMetaIdx: number;
    foundPrevMetaIdx = prevBooksMeta.findIndex(prevBookMeta => {
      return prevBookMeta.fileName === scrapedBook.fileName;
    });
    return foundPrevMetaIdx === -1;
  });
  nextBookMeta = [
    ...prevBooksMeta,
    ...scrapedBooksDeduped,
  ];
  metaFileData = JSON.stringify(nextBookMeta, null, 2);
  await writeFile(TXT_EBOOKS_META_FILE_PATH, metaFileData);
}
