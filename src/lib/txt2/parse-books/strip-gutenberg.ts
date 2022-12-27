
/*
  Strips the project Gutenberg headers / footers
*/

import { ScrapedBookWithFile } from '../../../models/scraped-book';
import { readFileStream } from './read-file-stream';

const GUTENBERG_TAG_MARKER = '*';

export type StripGutenbergError = NodeJS.ErrnoException & {
  hasSmallPrint: boolean;
  missingStartTags: boolean;
  missingEndTags: boolean;
};

export type StripGutenbergOpts = {
  doneCb: (
    err: StripGutenbergError,
    book: ScrapedBookWithFile,
  ) => void;
  lineCb: (line: string) => void;
};

export async function stripGutenbergBook(
  book: ScrapedBookWithFile,
  opts: StripGutenbergOpts,
) {
  let startTagParsed: boolean, endTagParsed: boolean;
  let parseStartTag: boolean;
  let hasSmallPrint: boolean;
  let hasErr: boolean;

  let parseStartTagEndMarkers: boolean, startTagEndMarkerCount: number;

  parseStartTagEndMarkers = false;
  startTagEndMarkerCount = 0;

  startTagParsed = false;
  endTagParsed = false;

  const lineCb = (line: string) => {
    let startTagRxExecArr: RegExpExecArray, startTagCursor: number;

    startTagCursor = 0;
    if(hasSmallPrint) {
      return;
    }
    if(!startTagParsed) {
      if(getStartTagRx().test(line)) {
        startTagRxExecArr = getStartTagRx().exec(line);
        startTagCursor = startTagRxExecArr.index + startTagRxExecArr[0].length;
        parseStartTag = true;
      } else if(smallPrintRx(line)) {
        hasSmallPrint = true;
      }
    } else if(!endTagParsed && getEndTagRx().test(line)) {
      endTagParsed = true;
    }
    if(parseStartTag) {
      for(let i = startTagCursor; i < line.length; ++i) {
        if(line[i] === GUTENBERG_TAG_MARKER) {
          parseStartTagEndMarkers = true;
          startTagEndMarkerCount++;
        } else if(parseStartTagEndMarkers) {
          parseStartTagEndMarkers = false;
          startTagEndMarkerCount = 0;
        }
        if(startTagEndMarkerCount === 3) {
          parseStartTag = false;
          startTagParsed = true;
        }
      }
    } else {
      if(startTagParsed && !endTagParsed) {
        // call the inner line cb
        opts.lineCb(line);
      }
    }
  };

  await readFileStream(book.filePath, {
    lineCb,
  });
  hasErr = !startTagParsed || !endTagParsed || hasSmallPrint;

  if(hasErr) {
    const err: StripGutenbergError = {
      ...(new Error(`Failed to strip: ${book.fileName}`)),
      hasSmallPrint,
      missingStartTags: !startTagParsed,
      missingEndTags: !endTagParsed,
    };
    opts.doneCb(err, book);
  } else {
    opts.doneCb(undefined, book);
  }
}

function getEndTagRx(): RegExp {
  return (/^\s*\*{3}\s*end(.)*gutenberg/gi);
}
function getStartTagRx(): RegExp {
  return /^\s*\*{3}\s*start(.)*gutenberg/gi;
}

function smallPrintRx(line: string): boolean {
  return (/^\**.+(?:start|end).*small.*print/gi).test(line);
}
