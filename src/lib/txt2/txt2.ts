
import { gutenbergScrapeMain } from '../gutenberg-scrape/gutenberg-scrape';
import { fetchBooks } from './books/fetch-books';
import { stripBooksMain } from './parse-books/strip-books';

enum TXT2_ARGS {
  SCRAPE = 'SCRAPE',
  STRIP = 'STRIP',
  FETCH = 'FETCH',
  PARSE = 'PARSE',
}

const TXT2_ARG_MAP: Record<TXT2_ARGS, string> = {
  [TXT2_ARGS.SCRAPE]: 'scrape',
  [TXT2_ARGS.STRIP]: 'strip',
  [TXT2_ARGS.FETCH]: 'fetch',
  [TXT2_ARGS.PARSE]: 'parse',
};

export async function txt2Main(argv: string[]) {
  let cliArgs: string[], cmdArg: string;

  setProcName();

  cliArgs = argv.slice(2);
  cmdArg = cliArgs[0];
  switch(cmdArg) {
    case TXT2_ARG_MAP.SCRAPE:
      await gutenbergScrapeMain();
      break;
    case TXT2_ARG_MAP.STRIP:
      await stripBooksMain();
      break;
    case TXT2_ARG_MAP.FETCH:
      await fetchBooks();
      break;
    case TXT2_ARG_MAP.PARSE:
      break;
    default:
      handleDefaultArg(cmdArg);
  }
}

function handleDefaultArg(cmdArg: string) {
  cmdArg = cmdArg ?? '';
  if(cmdArg.trim().length === 0) {
    console.log('Empty command provided.');
  } else {
    console.log(`Command not supported: ${cmdArg}`);
  }
}

function setProcName() {
  process.title = 'ezd_txt2';
}
