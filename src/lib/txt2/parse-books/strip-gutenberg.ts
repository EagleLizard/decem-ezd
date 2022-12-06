
/*
  Strips the project Gutenberg headers / footers
*/

import { ScrapedBookWithFile } from '../books/books-service';
import { readFileStream } from './read-file-stream';

export async function stripGutenbergBook(book: ScrapedBookWithFile) {
  let startTagParsed: boolean, endTagParsed: boolean;
  let parseStartTag: boolean, parseEndTag: boolean;
  let startTagLineCount: number;

  let startTagLine: string;

  startTagLineCount = 0;

  startTagParsed = false;
  endTagParsed = false;
  const lineCb = (rawLine: string) => {
    let line: string;
    line = rawLine.trim().toLowerCase();
    // line = rawLine;
    if(!startTagParsed) {
      if(startTagRx(line)) {
        parseStartTag = true;
      }
    } else if(!endTagParsed) {
      if(endTagRx(line)) {
        parseEndTag = true;
      }
    }
    if(parseStartTag) {
      startTagLineCount++;
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
  if(!startTagParsed || !endTagParsed) {
    console.log('');
    console.log(book.fileName);
    if(!startTagParsed) {
      console.log('Missing start tags');
      // console.log(startTagLine);
    }
    if(!endTagParsed) {
      console.log('Missing end tags');
    }
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
