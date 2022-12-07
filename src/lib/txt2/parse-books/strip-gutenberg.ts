
/*
  Strips the project Gutenberg headers / footers
*/

import { ScrapedBookWithFile } from '../books/books-service';
import { readFileStream } from './read-file-stream';

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

  startTagParsed = false;
  endTagParsed = false;
  const lineCb = (rawLine: string) => {
    let line: string;
    // line = rawLine.trim().toLowerCase();
    line = rawLine;
    if(hasSmallPrint) {
      return;
    }
    if(!startTagParsed) {
      if(startTagRx(line)) {
        parseStartTag = true;
      } else if(smallPrintRx(line)) {
        hasSmallPrint = true;
      }
    } else if(!endTagParsed) {
      if(endTagRx(line)) {
        parseEndTag = true;
      }
    }
    if(parseStartTag) {
      if(startTagEndRx(line)) {
        // console.log(line);
        parseStartTag = false;
        startTagParsed = true;
      }
    }
    if(parseEndTag) {
      if(endTagEndRx(line)) {
        parseEndTag = false;
        endTagParsed = true;
      }
    }
  };

  await readFileStream(book.filePath, {
    lineCb,
  });
  hasErr = !startTagParsed || !endTagParsed || hasSmallPrint;

  if(hasErr) {
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
  // return (/^\*{3}\s*start/gi).test(line);
  return (/^\*{3}\s*start(.)*gutenberg/gi).test(line);
}
function startTagEndRx(line: string): boolean {
  return (/[^*]\*{3}$/gi).test(line);
}

// function checkGutenbergStart(line: string): boolean {
//   return (/^\*{3}(.)*start(.)*gutenberg(.)*\*{3}$/gi).test(line);
// }
// function checkGutenbergEnd(line: string): boolean {
//   return (/^\*{3}(.)*end(.)*gutenberg(.)*\*{3}$/gi).test(line);
// }
