
/*
  Strips the project Gutenberg headers / footers
*/

import { ScrapedBookWithFile } from '../books/books-service';
import { readFileStream } from './read-file-stream';

const GUTENBERG_TAG_MARKER = '*';

export async function stripGutenbergBook(
  book: ScrapedBookWithFile,
  opts: {
    cb: (
      err: NodeJS.ErrnoException & {
        hasSmallPrint: boolean;
      },
      book: ScrapedBookWithFile,
    ) => void;
  }
) {
  let startTagParsed: boolean, endTagParsed: boolean;
  let parseStartTag: boolean, parseEndTag: boolean;
  let hasSmallPrint: boolean;
  let hasErr: boolean;

  let parseStartTagEndMarkers: boolean, startTagEndMarkerCount: number;
  let parseEndTagEndMarkers: boolean, endTagEndMarkerCount: number;

  parseStartTagEndMarkers = false;
  startTagEndMarkerCount = 0;
  parseEndTagEndMarkers = false;
  endTagEndMarkerCount = 0;

  startTagParsed = false;
  endTagParsed = false;

  const lineCb = (rawLine: string) => {
    let line: string;
    let startTagRxExecArr: RegExpExecArray, startTagCursor: number;
    let endTagRxExecArr: RegExpExecArray, endTagCursor: number;
    // line = rawLine.trim().toLowerCase();
    startTagCursor = 0;
    endTagCursor = 0;

    line = rawLine;
    if(hasSmallPrint) {
      return;
    }
    if(!startTagParsed) {
      // if(line.includes('GUTENBERG')) {
      //   console.log(line);
      // }
      if(getStartTagRx().test(line)) {
        startTagRxExecArr = getStartTagRx().exec(line);
        startTagCursor = startTagRxExecArr.index + startTagRxExecArr[0].length;
        parseStartTag = true;
      } else if(smallPrintRx(line)) {
        hasSmallPrint = true;
      }
    } else if(!endTagParsed) {
      if(getEndTagRx().test(line)) {
        endTagRxExecArr = getEndTagRx().exec(line);
        endTagCursor = endTagRxExecArr.index + endTagRxExecArr[0].length;
        parseEndTag = true;
      }
    }
    if(parseStartTag) {
      // console.log(line.substring(startTagCursor));
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
    } else if(parseEndTag) {
      for(let i = endTagCursor; i < line.length; ++i) {
        if(line[i] === GUTENBERG_TAG_MARKER) {
          parseEndTagEndMarkers = true;
          endTagEndMarkerCount++;
        } else if(parseEndTagEndMarkers) {
          parseEndTagEndMarkers = false;
          endTagEndMarkerCount = 0;
        }
        if(endTagEndMarkerCount === 3) {
          parseEndTag = false;
          endTagParsed = true;
        }
      }
    }
  };

  await readFileStream(book.filePath, {
    lineCb,
    // lineCb: _lineCb,
  });
  hasErr = !startTagParsed || !endTagParsed || hasSmallPrint;

  if(hasErr) {
    // console.log(`${book.fileName}`);
    if(hasSmallPrint) {
      // console.log('__Small print');
    }
    if(!hasSmallPrint) {
      console.log(`\n${book.fileName}`);
      if(!startTagParsed) {
        console.log('Missing start tags');
      }
      if(!endTagParsed) {
        console.log('Missing end tags');
      }
    }
    const err = {
      ...(new Error(`Failed to strip: ${book.fileName}`)),
      hasSmallPrint,
    };
    opts.cb(err, book);
  } else {
    opts.cb(undefined, book);
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

function endTagRx(line: string): boolean {
  return (/^\*{3}\s*end(.)*gutenberg/gi).test(line);
}
function endTagEndRx(line: string): boolean {
  return (/[^*]\*{3}$/gi).test(line);
}

function startTagRx(line: string): boolean {
  return (/^\*{3}\s*start(.)*gutenberg/gi).test(line);
}
function startTagEndRx(line: string): boolean {
  return (/[^*]\*{3}$/gi).test(line);
}
