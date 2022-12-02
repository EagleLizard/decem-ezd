
import { writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

import puppeteer from 'puppeteer';

import { DATA_DIR_PATH, SCRAPED_EBOOKS_DIR_PATH, SCRAPED_EBOOKS_FILE_NAME, SCRAPED_EBOOKS_NOT_FOUND_FILE_NAME } from '../../constants';
import { getIntuitiveTimeString } from '../../util/print-util';
import { Timer } from '../../util/timer';
import { sleep } from '../../util/sleep';
import { mkdirIfNotExistRecursive } from '../../util/files';

const NUM_CPUS = os.cpus().length;
// const MAX_CONCURRENT_PAGES = 1;
// const MAX_CONCURRENT_PAGES = 2;
// const MAX_CONCURRENT_PAGES = Math.ceil(NUM_CPUS / 2);
const MAX_CONCURRENT_PAGES = NUM_CPUS - 1;
// const MAX_CONCURRENT_PAGES = Math.ceil(NUM_CPUS * Math.LOG2E);

const GUTENBERG_TOP_1000_URL = 'https://www.gutenberg.org/browse/scores/top1000.php';

const TOP_1000_MONTH_SELECTOR = 'ol > a[href=\'#authors-last30\']';

export type ScrapedBook = {
  title: string;
  plaintextUrl: string;
  pageUrl: string;
};

type GetPuppeteerLaunchArgsParams = {
  viewportWidth: number;
  viewportHeight: number;
};

export async function gutenbergScrapeMain() {
  console.log(`MAX_CONCURRENT_PAGES: ${MAX_CONCURRENT_PAGES}`);
  await gutenbergScraper();
}

async function gutenbergScraper() {
  let browser: puppeteer.Browser;
  let viewportWidth: number, viewportHeight: number;
  let args: string[];
  // viewportWidth = 1280;
  // viewportHeight = 768;
  viewportWidth = 640;
  viewportHeight = 384;
  // viewportWidth = 320;
  // viewportHeight = 192;

  console.log('scraper');
  // console.log(puppeteer.defaultArgs());
  args = getPuppeteerLaunchArgs({
    viewportWidth,
    viewportHeight,
  });
  console.log(args);
  browser = await puppeteer.launch({
    headless: true,
    args,
    defaultViewport: {
      width: viewportWidth,
      height: viewportHeight,
    },
    userDataDir: `${DATA_DIR_PATH}${path.sep}chromium_user`,
  });
  await scrapeTop1000(browser);
  await browser.close();
}

async function scrapeTop1000(browser: puppeteer.Browser) {
  let page: puppeteer.Page;
  let allBookLinks: string[], bookLinks: string[];
  let scrapedBooks: ScrapedBook[], notFoundScrapedBooks: ScrapedBook[];
  let currentDateString: string;
  let scrapedEBooksFileName: string, scrapedEBooksNotFoundFileName: string;
  let scrapedEBooksFilePath: string, scrapedEBooksNotFoundFilePath: string;

  let scrapeBooksTimer: Timer, scrapedBooksMs: number;
  let completedScrapeTasks: number;
  let runningScrapeTasks: number;

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

  await page.goto(GUTENBERG_TOP_1000_URL);
  await page.waitForSelector(TOP_1000_MONTH_SELECTOR);
  allBookLinks = await page.evaluate((top1000MonthSelector) => {
    return [
      ...(
        document
          .querySelectorAll('ol li a[href^=\'/ebooks/\']')
      )
    ].map((anchorEl: HTMLAnchorElement) => {
      return anchorEl.href;
    });
  }, TOP_1000_MONTH_SELECTOR);
  await page.close();

  console.log('allBookLinks.length');
  console.log(allBookLinks.length);
  bookLinks = [ ...(new Set(allBookLinks)) ];
  scrapedBooks = [];
  notFoundScrapedBooks = [];
  completedScrapeTasks = 0;

  runningScrapeTasks = 0;

  console.log('');

  scrapeBooksTimer = Timer.start();
  for(let i = 0; i < bookLinks.length; ++i) {
    let currBookLink: string;
    // console.log(runningScrapeTasks);
    while(runningScrapeTasks >= MAX_CONCURRENT_PAGES) {
      await sleep(10);
    }
    currBookLink = bookLinks[i];
    runningScrapeTasks++;
    (async () => {
      let scrapedBook: ScrapedBook;
      scrapedBook = await getPlaintextLink(browser, currBookLink);
      if(scrapedBook.plaintextUrl === undefined) {
        notFoundScrapedBooks.push(scrapedBook);
      } else {
        scrapedBooks.push(scrapedBook);
      }
      completedScrapeTasks++;
      if((completedScrapeTasks % 10) === 0) {
        process.stdout.write('.');
      }
      runningScrapeTasks--;
    })();
  }
  while(runningScrapeTasks > 0) {
    await sleep(10);
  }

  scrapedBooksMs = scrapeBooksTimer.stop();

  console.log('');

  console.log(`scraped ${scrapedBooks.length.toLocaleString()} ebooks in ${getIntuitiveTimeString(scrapedBooksMs)}`);

  await mkdirIfNotExistRecursive(SCRAPED_EBOOKS_DIR_PATH);
  currentDateString = getCurrentDateString();
  scrapedEBooksFileName = `${currentDateString}_${SCRAPED_EBOOKS_FILE_NAME}`;
  scrapedEBooksNotFoundFileName = `${currentDateString}_${SCRAPED_EBOOKS_NOT_FOUND_FILE_NAME}`;
  scrapedEBooksFilePath = [
    SCRAPED_EBOOKS_DIR_PATH,
    scrapedEBooksFileName,
  ].join(path.sep);
  scrapedEBooksNotFoundFilePath = [
    SCRAPED_EBOOKS_DIR_PATH,
    scrapedEBooksNotFoundFileName,
  ].join(path.sep);
  await writeFile(scrapedEBooksFilePath, JSON.stringify(scrapedBooks, null, 2));
  await writeFile(scrapedEBooksNotFoundFilePath, JSON.stringify(notFoundScrapedBooks, null, 2));
  // await writeFile(SCRAPED_EBOOKS_FILE_PATH, JSON.stringify(scrapedBooks, null, 2));
  // await writeFile(SCRAPED_EBOOKS_NOT_FOUND_FILE_PATH, JSON.stringify(notFoundScrapedBooks, null, 2));
}

async function getPlaintextLink(browser: puppeteer.Browser, bookLink: string): Promise<ScrapedBook> {
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
  };
}

function getCurrentDateString(): string {
  let today: Date;
  let month: number, day: number, year: number;
  let dateString: string;
  today = new Date();
  month = today.getMonth() + 1;
  day = today.getDate();
  year = today.getFullYear();
  dateString = `${year}-${month}-${day}`;
  return dateString;
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
