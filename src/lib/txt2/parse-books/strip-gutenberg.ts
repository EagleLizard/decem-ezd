
/*
  Strips the project Gutenberg headers / footers
*/

import { ScrapedBookWithFile } from '../books/books-service';
import { readFileStream } from './read-file-stream';

export async function stripGutenbergBook(book: ScrapedBookWithFile) {
  let startTag: boolean, endTag: boolean;
  startTag = false;
  endTag = false;
  const lineCb = (rawLine: string) => {
    let line: string;
    line = rawLine.trim().toLowerCase();
    if(!startTag) {
      if(checkGutenbergStart(rawLine)) {
        startTag = true;
      }
    } else if(!endTag) {
      if(checkGutenbergEnd(rawLine)) {
        endTag = true;
      }
    }
  };

  await readFileStream(book.filePath, {
    lineCb,
  });
  if(!startTag || !endTag) {
    console.log(`Missing start or end tags for ${book.fileName}`);
  }
}

function checkGutenbergStart(line: string): boolean {
  return (/^\*{3}(.)*start(.)*gutenberg(.)*\*{3}$/gi).test(line);
}
function checkGutenbergEnd(line: string): boolean {
  return (/^\*{3}(.)*end(.)*gutenberg(.)*\*{3}$/gi).test(line);
}
