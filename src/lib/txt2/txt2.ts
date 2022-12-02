
import path from 'path';
import { Dirent } from 'fs';
import { readdir, readFile } from 'fs/promises';

import { EBOOKS_DATA_DIR_PATH, SCRAPED_EBOOKS_DIR_PATH, SCRAPED_EBOOKS_FILE_NAME } from '../../constants';
import { checkDir, mkdirIfNotExistRecursive } from '../../util/files';
import { gutenbergScrapeMain, ScrapedBook } from '../gutenberg-scrape/gutenberg-scrape';
import { zipShuffle } from '../../util/shuffle';
import { downloadBooks, ScrapedBookWithFile, MAX_CONCURRENT_DOWNLOADS, MAX_TOTAL_SOCKETS } from './books/books-service';

const TXT_SCRAPE_COMMAND = 'scrape';

export async function txt2Main(argv: string[]) {
  let cliArgs: string[], cmdArg: string;
  cliArgs = argv.slice(2);
  cmdArg = cliArgs[0];
  if(cmdArg === TXT_SCRAPE_COMMAND) {
    await gutenbergScrapeMain();
  } else {
    await initBooks();
  }
}

async function initBooks() {
  let scrapedBooks: ScrapedBookWithFile[];
  console.log(`MAX_CONCURRENT_DOWNLOADS: ${MAX_CONCURRENT_DOWNLOADS}`);
  console.log(`MAX_TOTAL_SOCKETS: ${MAX_TOTAL_SOCKETS}`);
  await mkdirIfNotExistRecursive(EBOOKS_DATA_DIR_PATH);
  scrapedBooks = await loadScrapedBooksMeta();
  scrapedBooks.sort((a, b) => {
    return a.fileName.localeCompare(b.fileName);
  });
  // scrapedBooks = scrapedBooks.slice(0, Math.round(scrapedBooks.length / 2));
  scrapedBooks = zipShuffle(scrapedBooks);
  await downloadBooks(scrapedBooks);
}

async function loadScrapedBooksMeta(): Promise<ScrapedBookWithFile[]> {
  let scrapedDirExists: boolean, scrapedMetaDirents: Dirent[];
  let scrapedBookMetaPaths: string[], scrapedBooksMeta: ScrapedBookWithFile[];
  scrapedDirExists = await checkDir(SCRAPED_EBOOKS_DIR_PATH);
  if(!scrapedDirExists) {
    throw new Error(`Directory doesn't exist, expected: ${SCRAPED_EBOOKS_DIR_PATH}`);
  }
  scrapedMetaDirents = await readdir(SCRAPED_EBOOKS_DIR_PATH, {
    withFileTypes: true,
  });
  scrapedBookMetaPaths = scrapedMetaDirents.reduce((acc, curr) => {
    if(
      curr.name.includes(SCRAPED_EBOOKS_FILE_NAME)
      && curr.isFile()
    ) {
      acc.push([
        SCRAPED_EBOOKS_DIR_PATH,
        curr.name,
      ].join(path.sep));
    }
    return acc;
  }, [] as string[]);

  scrapedBooksMeta = [];

  for(let i = 0; i < scrapedBookMetaPaths.length; ++i) {
    let currScrapedBookMetaPath: string;
    let currBooksMeta: ScrapedBook[], metaFileData: Buffer;
    currScrapedBookMetaPath = scrapedBookMetaPaths[i];
    metaFileData = await readFile(currScrapedBookMetaPath);
    currBooksMeta = JSON.parse(metaFileData.toString());
    console.log(`${currScrapedBookMetaPath}: ${currBooksMeta.length}`);
    for(let k = 0; k < currBooksMeta.length; ++k) {
      let currBookMeta: ScrapedBookWithFile;
      let foundBooksMetaIdx: number;
      currBookMeta = getScrapedBookWithFileName(currBooksMeta[k]);
      foundBooksMetaIdx = scrapedBooksMeta.findIndex(scrapedBookMeta => {
        return scrapedBookMeta.fileName === currBookMeta.fileName;
      });
      if(foundBooksMetaIdx === -1) {
        scrapedBooksMeta.push(currBookMeta);
      }
    }
  }
  console.log(scrapedBooksMeta.length);
  return scrapedBooksMeta;
}

function getScrapedBookWithFileName(scrapedBook: ScrapedBook): ScrapedBookWithFile {
  let withFileName: ScrapedBookWithFile;
  let titleKebabCase: string;
  titleKebabCase = getScrapedBookKebabTitle(scrapedBook.title);
  withFileName = {
    ...scrapedBook,
    fileName: titleKebabCase,
    filePath: [
      EBOOKS_DATA_DIR_PATH,
      `${titleKebabCase}.txt`,
    ].join(path.sep)
  };
  return withFileName;
}

function getScrapedBookKebabTitle(title: string) {
  let titleNoPunct: string, titleKebabCase: string;
  titleNoPunct = title.replace(/[^\p{L} ]/gu, '');
  titleKebabCase = titleNoPunct
    .toLowerCase()
    .split(' ')
    .filter(word => word.length > 0)
    .join('-')
  ;
  return titleKebabCase;
}
