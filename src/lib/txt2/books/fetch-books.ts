
import { EBOOKS_DATA_DIR_PATH, TXT_EBOOKS_META_DIR_PATH, TXT_EBOOKS_META_FILE_PATH } from '../../../constants';
import { checkFile, mkdirIfNotExistRecursive } from '../../../util/files';
import { downloadBooks, DownloadBooksResult, MAX_CONCURRENT_DOWNLOADS, MAX_TOTAL_SOCKETS, ScrapedBookWithFile } from './books-service';
import { loadScrapedBooksMeta } from './book-meta-service';
import { zipShuffle } from '../../../util/shuffle';
import { getIntuitiveTimeString } from '../../../util/print-util';
import { writeFile, readFile } from 'fs/promises';

export async function fetchBooks() {
  let scrapedBooks: ScrapedBookWithFile[];
  let scrapedBooksToDownload: ScrapedBookWithFile[];
  let downloadBooksResult: DownloadBooksResult;
  console.log(`MAX_CONCURRENT_DOWNLOADS: ${MAX_CONCURRENT_DOWNLOADS}`);
  console.log(`MAX_TOTAL_SOCKETS: ${MAX_TOTAL_SOCKETS}`);
  await mkdirIfNotExistRecursive(EBOOKS_DATA_DIR_PATH);
  scrapedBooks = await loadScrapedBooksMeta();
  scrapedBooks.sort((a, b) => {
    return a.fileName.localeCompare(b.fileName);
  });
  // scrapedBooks = scrapedBooks.slice(0, Math.round(scrapedBooks.length / 2));
  scrapedBooks = zipShuffle(scrapedBooks);
  scrapedBooksToDownload = [];
  for(let i = 0; i < scrapedBooks.length; ++i) {
    let scrapedBook: ScrapedBookWithFile, fileExists: boolean;
    scrapedBook = scrapedBooks[i];
    fileExists = await checkFile(scrapedBook.filePath);
    if(
      !fileExists
      // || (scrapedBook.fileName[0] === 't')
    ) {
      scrapedBooksToDownload.push(scrapedBook);
    }
  }

  console.log(`scrapedBooksToDownload: ${scrapedBooksToDownload.length.toLocaleString()}`);
  downloadBooksResult = await downloadBooks(scrapedBooksToDownload, (book, doneCount, bookArr) => {
    const donePrintMod = Math.ceil(bookArr.length / 150);
    const donePercentPrintMod = Math.ceil(bookArr.length / 13);
    if((doneCount % donePercentPrintMod) === 0) {
      const donePercent = doneCount / bookArr.length;
      process.stdout.write(`${Math.round(donePercent * 100)}%`);
    } else if((doneCount % donePrintMod) === 0) {
      process.stdout.write('.');
    }
  });
  console.log('');
  console.log(`Downloaded ${downloadBooksResult.doneCount.toLocaleString()} books in ${getIntuitiveTimeString(downloadBooksResult.ms)}`);
  await writeTxtBookMeta(scrapedBooksToDownload);
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
