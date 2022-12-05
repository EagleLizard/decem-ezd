
import { Dirent } from 'fs';
import { readdir, readFile } from 'fs/promises';
import path from 'path';

import { EBOOKS_DATA_DIR_PATH, SCRAPED_EBOOKS_DIR_PATH, SCRAPED_EBOOKS_FILE_NAME, TXT_EBOOKS_META_FILE_PATH } from '../../../constants';
import { checkDir } from '../../../util/files';
import { ScrapedBook } from '../../gutenberg-scrape/gutenberg-scrape';
import { ScrapedBookWithFile } from './books-service';

export async function loadScrapedBooksMeta(): Promise<ScrapedBookWithFile[]> {
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

export async function getTxtBookMeta(): Promise<ScrapedBookWithFile[]> {
  let txtBookMeta: ScrapedBookWithFile[];
  txtBookMeta = JSON.parse((await readFile(TXT_EBOOKS_META_FILE_PATH)).toString())
  return txtBookMeta;
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
  titleNoPunct = title.replace(/[^\p{L} 0-9]/gu, '');
  titleKebabCase = titleNoPunct
    .toLowerCase()
    .split(' ')
    .filter(word => word.length > 0)
    .join('-')
  ;
  return titleKebabCase;
}
