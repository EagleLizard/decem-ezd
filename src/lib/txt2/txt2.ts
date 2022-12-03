
import { EBOOKS_DATA_DIR_PATH } from '../../constants';
import { checkFile, mkdirIfNotExistRecursive } from '../../util/files';
import { gutenbergScrapeMain } from '../gutenberg-scrape/gutenberg-scrape';
import { zipShuffle } from '../../util/shuffle';
import { downloadBooks, ScrapedBookWithFile, MAX_CONCURRENT_DOWNLOADS, MAX_TOTAL_SOCKETS, DownloadBooksResult } from './books/books-service';
import { getIntuitiveTimeString } from '../../util/print-util';
import { loadScrapedBooksMeta } from './books/book-meta-service';

enum TXT2_ARGS {
  SCRAPE = 'SCRAPE',
  PARSE = 'PARSE',
}

const TXT2_ARG_MAP: Record<TXT2_ARGS, string> = {
  [TXT2_ARGS.SCRAPE]: 'scrape',
  [TXT2_ARGS.PARSE]: 'parse',
};

export async function txt2Main(argv: string[]) {
  let cliArgs: string[], cmdArg: string;
  cliArgs = argv.slice(2);
  cmdArg = cliArgs[0];
  switch(cmdArg) {
    case TXT2_ARG_MAP.SCRAPE:
      await gutenbergScrapeMain();
      break;
    case TXT2_ARG_MAP.PARSE:
      console.log('parse ~');
      break;
    default:
      await initBooks();
  }
}

async function initBooks() {
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
      // || (scrapedBook.fileName[0] === 'a')
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
}
