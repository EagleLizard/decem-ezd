
import { writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

import * as puppeteer from 'puppeteer';

import { DATA_DIR_PATH, SCRAPED_EBOOKS_DIR_PATH, SCRAPED_EBOOKS_FILE_NAME, SCRAPED_EBOOKS_NOT_FOUND_FILE_NAME } from '../../constants';
import { getIntuitiveTimeString } from '../../util/print-util';
import { Timer } from '../../util/timer';
import { sleep } from '../../util/sleep';
import { mkdirIfNotExistRecursive } from '../../util/files';
import { getCurrentDateString } from '../../util/date-time';
import { TOP_LISTS_ENUM, TOP_LISTS_FILE_PREFIX_MAP, TOP_LISTS_ID_MAP, TOP_LIST_ENUM_ARR, TOP_PAGES_ENUM, TOP_PAGES_FILE_PREFIX_MAP, TOP_PAGES_URL_MAP } from './scrape-constants';
import { ScrapedBook } from '../../models/scraped-book';

const NUM_CPUS = os.cpus().length;
const MAX_CONCURRENT_PAGES = NUM_CPUS - 1;

type GetPuppeteerLaunchArgsParams = {
  viewportWidth: number;
  viewportHeight: number;
};

export async function gutenbergScrapeMain() {
  console.log(`MAX_CONCURRENT_PAGES: ${MAX_CONCURRENT_PAGES}`);
  await gutenbergScraper();
}

async function gutenbergScraper() {
  let browser: puppeteer.Browser, launchArgs: string[];
  let viewportWidth: number, viewportHeight: number;
  // viewportWidth = 1280;
  // viewportHeight = 768;
  viewportWidth = 640;
  viewportHeight = 384;

  console.log('scraper');
  launchArgs = getPuppeteerLaunchArgs({
    viewportWidth,
    viewportHeight,
  });
  console.log(launchArgs);
  browser = await puppeteer.launch({
    headless: true,
    args: launchArgs,
    defaultViewport: {
      width: viewportWidth,
      height: viewportHeight,
    },
    userDataDir: `${DATA_DIR_PATH}${path.sep}chromium_user`,
  });
  await scrapeTop100(browser);
  await scrapeTop1000(browser);

  await browser.close();
}

async function scrapeTop100(browser: puppeteer.Browser) {
  console.log('Scraping top100');
  await scrapeTopPage(browser, TOP_PAGES_ENUM.TOP_100);
}

async function scrapeTop1000(browser: puppeteer.Browser) {
  console.log('Scraping top1k');
  return scrapeTopPage(browser, TOP_PAGES_ENUM.TOP_1000);
}

async function scrapeTopPage(browser: puppeteer.Browser, topPageType: TOP_PAGES_ENUM) {
  let scrapeTopListResult: Record<string, string[]>;
  let totalBooksScraped: number;
  let scrapeTimer: Timer, scrapeMs: number;

  scrapeTopListResult = await scrapeTopBookLists(browser, topPageType);
  totalBooksScraped = 0;

  const _getPlaintextLink = getPlaintextLinkMemo();

  scrapeTimer = Timer.start();

  for(let i = 0; i < TOP_LIST_ENUM_ARR.length; ++i) {
    let currTopListEnum: TOP_LISTS_ENUM, currTopListKey: string, currTopListLinks: string[];
    let scrapedBooks: ScrapedBook[], notFoundScrapedBooks: ScrapedBook[];
    let runningScrapeTasks: number, completedScrapeTasks: number;
    let currDateStr: string;

    currTopListEnum = TOP_LIST_ENUM_ARR[i];
    currTopListKey = TOP_LISTS_ID_MAP[currTopListEnum];
    currTopListLinks = scrapeTopListResult[currTopListKey];

    currDateStr = getCurrentDateString();
    scrapedBooks = [];
    notFoundScrapedBooks = [];
    runningScrapeTasks = 0;
    completedScrapeTasks = 0;

    console.log(currTopListKey);

    for(let k = 0; k < currTopListLinks.length; ++k) {
      let currBookLink: string, currBookRank: number;

      currBookLink = currTopListLinks[k];
      currBookRank = k + 1;

      while(runningScrapeTasks >= MAX_CONCURRENT_PAGES) {
        await sleep(10);
      }
      runningScrapeTasks++;
      (async () => {
        let scrapedBook: ScrapedBook;
        let hasWaitForError: boolean;
        hasWaitForError = false;
        try {
          scrapedBook = await _getPlaintextLink(browser, currBookLink, currBookRank);
        } catch(e) {
          if(e instanceof puppeteer.TimeoutError) {
            hasWaitForError = true;
            scrapedBook = {
              plaintextUrl: undefined,
              title: undefined,
              rank: currBookRank,
              pageUrl: currBookLink,
            };
          } else {
            throw e;
          }
        }
        if(
          (scrapedBook.plaintextUrl === undefined)
          || hasWaitForError
        ) {
          notFoundScrapedBooks.push(scrapedBook);
        } else {
          scrapedBooks.push(scrapedBook);
        }
        completedScrapeTasks++;
        if((completedScrapeTasks % 10) === 0) {
          process.stdout.write('.');
        }
        if(hasWaitForError) {
          process.stdout.write('x');
        }
        runningScrapeTasks--;
      })();
    }
    while(runningScrapeTasks > 0) {
      await sleep(10);
    }
    console.log('');
    totalBooksScraped += completedScrapeTasks;
    await writeScrapedBooksFile(
      currTopListEnum,
      topPageType,
      currDateStr,
      scrapedBooks,
      notFoundScrapedBooks,
    );
  }

  scrapeMs = scrapeTimer.stop();

  console.log(`scraped ${totalBooksScraped.toLocaleString()} books in ${getIntuitiveTimeString(scrapeMs)}`);
}

function getPlaintextLinkMemo() {
  let scrapedBookCache: Record<string, ScrapedBook>;
  scrapedBookCache = {};
  return async (browser: puppeteer.Browser, bookLink: string, rank: number): Promise<ScrapedBook> => {
    let scrapedBook: ScrapedBook;
    if(scrapedBookCache[bookLink] === undefined) {
      scrapedBook = await getPlaintextLink(browser, bookLink, rank);
      scrapedBookCache[bookLink] = scrapedBook;
    } else {
      scrapedBook = scrapedBookCache[bookLink];
    }
    return {
      ...scrapedBook,
      rank,
    };
  };
}

async function writeScrapedBooksFile(
  topListType: TOP_LISTS_ENUM,
  topPageType: TOP_PAGES_ENUM,
  dateStr: string,
  scrapedBooks: ScrapedBook[],
  notFoundScrapedBooks: ScrapedBook[]
) {
  let scrapedBooksFileName: string, scrapedBooksFilePath: string;
  let notFoundScrapedBooksFileName: string, notFoundScrapedBooksFilePath: string;
  let topListFilePrefix: string, topPageFilePrefix: string;
  await mkdirIfNotExistRecursive(SCRAPED_EBOOKS_DIR_PATH);
  topListFilePrefix = TOP_LISTS_FILE_PREFIX_MAP[topListType];
  topPageFilePrefix = TOP_PAGES_FILE_PREFIX_MAP[topPageType];
  scrapedBooksFileName = `${dateStr}_${topPageFilePrefix}_${topListFilePrefix}_${SCRAPED_EBOOKS_FILE_NAME}`;
  notFoundScrapedBooksFileName = `${dateStr}_${topPageFilePrefix}_${topListFilePrefix}_${SCRAPED_EBOOKS_NOT_FOUND_FILE_NAME}`;
  scrapedBooksFilePath = [
    SCRAPED_EBOOKS_DIR_PATH,
    scrapedBooksFileName,
  ].join(path.sep);
  notFoundScrapedBooksFilePath = [
    SCRAPED_EBOOKS_DIR_PATH,
    notFoundScrapedBooksFileName,
  ].join(path.sep);

  await writeFile(scrapedBooksFilePath, JSON.stringify(scrapedBooks, null, 2));
  await writeFile(notFoundScrapedBooksFilePath, JSON.stringify(notFoundScrapedBooks, null, 2));
}

async function scrapeTopBookLists(browser: puppeteer.Browser, topPageType: TOP_PAGES_ENUM): Promise<Record<string, string[]>> {
  let page: puppeteer.Page;
  let topPageUrl: string;
  let bookListLinksMap: Record<string, string[]>;
  let expectedTopListIds: string[];

  topPageUrl = TOP_PAGES_URL_MAP[topPageType];

  const TOP_LIST_WAIT_SELECTOR = 'ol > a[href=\'#authors-last30\']';

  await mkdirIfNotExistRecursive(DATA_DIR_PATH);

  page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', (request) => {
    let doIntercept: boolean;
    doIntercept = shouldInterceptPageRequest(request.resourceType());
    if(doIntercept) {
      return request.abort();
    }
    return request.continue();
  });

  await page.goto(topPageUrl);

  await page.waitForSelector(TOP_LIST_WAIT_SELECTOR);

  bookListLinksMap = {};

  bookListLinksMap = await page.evaluate(() => {
    let listMap: Record<string, string[]>;
    let bookLists: HTMLElement[] = [
      ...document.querySelectorAll('ol')
    ].filter(el => el.querySelector('li a[href^=\'/ebooks/\']') !== null);
    let listTitleIds = bookLists
      .map(el => el.previousElementSibling)
      .map(el => el.querySelector('[id^="books-last"]').getAttribute('id'))
    ;
    listMap = {};
    listMap = listTitleIds.reduce((acc, curr, idx) => {
      let currListBookLinks: string[];
      currListBookLinks = [
        ...bookLists[idx].querySelectorAll('li a[href^=\'/ebooks/\']')
      ].map((anchorEl: HTMLAnchorElement) => {
        return anchorEl.href;
      });
      acc[curr] = currListBookLinks;
      return acc;
    }, listMap);

    return listMap;
  });

  expectedTopListIds = [ ...Object.values(TOP_LISTS_ID_MAP) ];

  expectedTopListIds.forEach((expectedTopListId) => {
    let foundNonStringIdx: number, bookListLinks: string[];
    bookListLinks = bookListLinksMap[expectedTopListId];
    if(!Array.isArray(bookListLinks)) {
      throw new Error(`Did not scrape expected list for "${expectedTopListId}"`);
    }
    foundNonStringIdx = bookListLinks.findIndex(listLink => {
      return (typeof listLink) !== 'string';
    });

    if(foundNonStringIdx !== -1) {
      const foundNonStringBookLink = bookListLinks[foundNonStringIdx];
      console.error('foundNonStringBookLink');
      console.error(foundNonStringBookLink);
      throw new Error(`Unexpected type in bookLink list "${expectedTopListId}" at index ${foundNonStringIdx}. Expected 'string', received: ${typeof foundNonStringBookLink}`);
    }
  });

  await page.close();

  return bookListLinksMap;
}

async function getPlaintextLink(browser: puppeteer.Browser, bookLink: string, rank: number): Promise<ScrapedBook> {
  let page: puppeteer.Page, title: string, plainTextLink: string;
  page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', (request) => {
    let doIntercept: boolean;
    doIntercept = shouldInterceptPageRequest(request.resourceType());
    if(doIntercept) {
      return request.abort();
    }
    return request.continue();
  });

  await page.goto(bookLink);

  await page.waitForSelector('div.page_content');
  [ title, plainTextLink ] = await page.evaluate(() => {
    let anchorEl: HTMLAnchorElement, titleEl: HTMLElement;
    let anchorLink: string, titleText: string;
    titleEl = document.querySelector('div.page_content [itemprop=\'name\']');
    anchorEl = document.querySelector('tr td[content*=\'text/plain\'] a');
    titleText = titleEl.textContent;
    anchorLink = (anchorEl === null)
      ? undefined
      : anchorEl.href
    ;

    return [
      titleText,
      anchorLink,
    ];
  });

  await page.close();

  // await sleep(100);

  plainTextLink = plainTextLink ?? undefined;

  return {
    title,
    plaintextUrl: plainTextLink,
    pageUrl: bookLink,
    rank,
  };
}

function shouldInterceptPageRequest(resourceType: puppeteer.ResourceType): boolean {
  let foundInterceptIdx: number, shouldIntercept: boolean;
  foundInterceptIdx = [
    'image',
    'media',
    'font',
    'stylesheet',
  ].findIndex(interceptType => {
    return interceptType === resourceType;
  });
  shouldIntercept = foundInterceptIdx !== -1;
  return shouldIntercept;
}

function getPuppeteerLaunchArgs(params: GetPuppeteerLaunchArgsParams): string[] {
  let args: string[];
  args = [
    '--no-sandbox',
    // '--disable-gpu',
    `--window-size=${params.viewportWidth},${params.viewportHeight}`,
    '--disable-notifications',

    // '--disable-accelerated-2d-canvas',
    // '--no-first-run',

    '--single-process',
    // '--no-zygote',
    // '--disable-setuid-sandbox',
    // '--disable-infobars',
    // '--no-first-run',
    // '--window-position=0,0',
    // '--ignore-certificate-errors',
    // '--ignore-certificate-errors-skip-list',
    // '--disable-dev-shm-usage',
    // '--disable-accelerated-2d-canvas',
    // '--hide-scrollbars',
    // '--disable-extensions',
    // '--force-color-profile=srgb',
    // '--mute-audio',
    // '--disable-background-timer-throttling',
    // '--disable-backgrounding-occluded-windows',
    // '--disable-breakpad',
    // '--disable-component-extensions-with-background-pages',
    // '--disable-features=TranslateUI,BlinkGenPropertyTrees,IsolateOrigins,site-per-process',
    // '--disable-ipc-flooding-protection',
    // '--disable-renderer-backgrounding',
    // '--enable-features=NetworkService,NetworkServiceInProcess'
  ];
  return args;
}
