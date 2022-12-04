
import { gutenbergScrapeMain } from '../gutenberg-scrape/gutenberg-scrape';
import { fetchBooks } from './books/fetch-books';
import { parseBooksMain } from './parse-books/parse-books';

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

  setProcName();

  cliArgs = argv.slice(2);
  cmdArg = cliArgs[0];
  switch(cmdArg) {
    case TXT2_ARG_MAP.SCRAPE:
      await gutenbergScrapeMain();
      break;
    case TXT2_ARG_MAP.PARSE:
      await parseBooksMain();
      break;
    default:
      await fetchBooks();
  }
}

function setProcName() {
  process.title = 'ezd_txt2';
}
