
import { Dirent } from 'fs';
import { readdir, readFile } from 'fs/promises';
import path from 'path';

import { EBOOKS_DATA_DIR_PATH, SCRAPED_EBOOKS_DIR_PATH, SCRAPED_EBOOKS_FILE_NAME, TXT_EBOOKS_META_FILE_PATH } from '../../../constants';
import { checkDir } from '../../../util/files';
import { TOP_PAGES_ENUM, TOP_PAGES_FILE_PREFIX_MAP } from '../../gutenberg-scrape/scrape-constants';
import { ScrapedBook, ScrapedBookWithFile } from '../../../models/scraped-book';

export async function getScrapedBooksMeta(): Promise<ScrapedBookWithFile[]> {
  let bookMetaPaths: string[], visitedBookMap: Record<string, boolean>;
  let scrapedBooksWithFiles: ScrapedBookWithFile[];
  bookMetaPaths = await getScrapedBooksMetaPaths();
  // loadScrapedBooksMeta(TOP_PAGES_ENUM.TOP_100);
  // loadScrapedBookMeta(TOP_PAGES_ENUM.TOP_1000, TOP_LISTS_ENUM.LAST_1_DAYS);
  console.log(bookMetaPaths);

  visitedBookMap = {};
  scrapedBooksWithFiles = [];

  for(let i = 0; i < bookMetaPaths.length; ++i) {
    let currBookMetaPath: string;
    currBookMetaPath = bookMetaPaths[i];
    await getScrapedBooksWithFileNames(currBookMetaPath);
  }

  return scrapedBooksWithFiles;

  async function getScrapedBooksWithFileNames(bookMetaPath: string) {
    let booksMeta: ScrapedBook[], metaFileData: Buffer;
    metaFileData = await readFile(bookMetaPath);
    booksMeta = JSON.parse(metaFileData.toString());
    booksMeta.forEach(currBookMeta => {
      let currBookMetaWithFile: ScrapedBookWithFile;
      currBookMetaWithFile = getScrapedBookWithFileName(currBookMeta);
      if(!visitedBookMap[currBookMetaWithFile.fileName]) {
        scrapedBooksWithFiles.push(currBookMetaWithFile);
        visitedBookMap[currBookMetaWithFile.fileName] = true;
      }
    });
  }
}

async function getScrapedBooksMetaPaths(topPageType?: TOP_PAGES_ENUM): Promise<string[]> {
  let scrapedDirExists: boolean, scrapedMetaDirents: Dirent[];
  let scrapedBookMetaPaths: string[];

  scrapedDirExists = await checkDir(SCRAPED_EBOOKS_DIR_PATH);
  if(!scrapedDirExists) {
    throw new Error(`Directory doesn't exist, expected: ${SCRAPED_EBOOKS_DIR_PATH}`);
  }
  scrapedMetaDirents = await readdir(SCRAPED_EBOOKS_DIR_PATH, {
    withFileTypes: true,
  });
  scrapedBookMetaPaths = scrapedMetaDirents.reduce((acc, curr) => {
    let scrapedBookMetaFilePath: string;
    if(
      curr.name.includes(SCRAPED_EBOOKS_FILE_NAME)
      && curr.isFile()
    ) {
      scrapedBookMetaFilePath = [
        SCRAPED_EBOOKS_DIR_PATH,
        curr.name,
      ].join(path.sep);
      if(topPageType === undefined) {
        acc.push(scrapedBookMetaFilePath);
      } else if(curr.name.includes(TOP_PAGES_FILE_PREFIX_MAP[topPageType])) {
        acc.push(scrapedBookMetaFilePath);
      }
    }
    return acc;
  }, [] as string[]);
  return scrapedBookMetaPaths;
}

export async function getTxtBookMeta(): Promise<ScrapedBookWithFile[]> {
  let txtBookMeta: ScrapedBookWithFile[];
  txtBookMeta = JSON.parse((await readFile(TXT_EBOOKS_META_FILE_PATH)).toString());
  return txtBookMeta;
}

export function getScrapedBookFilePath(scrapedBook: ScrapedBookWithFile): string {
  let filePath: string;
  filePath = [
    EBOOKS_DATA_DIR_PATH,
    `${scrapedBook.fileName}.txt`,
  ].join(path.sep);
  return filePath;
}

function getScrapedBookWithFileName(scrapedBook: ScrapedBook): ScrapedBookWithFile {
  let withFileName: ScrapedBookWithFile;
  let titleKebabCase: string;
  titleKebabCase = getScrapedBookKebabTitle(scrapedBook.title);
  withFileName = {
    ...scrapedBook,
    fileName: titleKebabCase,
  };
  return withFileName;
}

function getScrapedBookKebabTitle(title: string) {
  let titleNoPunct: string, titleKebabCase: string;
  titleNoPunct = title.replace(/[^\p{L} 0-9]/gu, '');
  titleKebabCase = titleNoPunct
    .toLowerCase()
    .split(' ')
    .filter(word => word.length > 0)
    .join('-')
  ;
  return titleKebabCase;
}
