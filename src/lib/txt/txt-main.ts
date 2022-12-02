
import {
  EBookTxtFile,
  EBOOK_ENUM,
  EBOOK_ENUM_ARRAY,
} from './txt-constants';
import { Timer } from '../../util/timer';
import { getIntuitiveTimeString } from '../../util/print-util';

import {
  countCharsByLine,
  CountCharsResult,
  getEBookTxtFile,
  writeCharCountTxtOutput,
} from './e-book/count-chars';

const COUNT_CHARS_FILE_NAME_POSTFIX = 'count-chars';

export async function txtMain() {
  await countCharsMain(EBOOK_ENUM_ARRAY);
}

async function countCharsMain(eBooks: EBOOK_ENUM[]) {
  let eBookTxtFiles: EBookTxtFile[];
  let countCharsResultTuples: [ EBookTxtFile, CountCharsResult ][];
  let totalCharCountTimer: Timer, totalCharCountMs: number;

  eBookTxtFiles = [];
  countCharsResultTuples = [];

  for(let i = 0; i < eBooks.length; ++i) {
    let currEBook: EBOOK_ENUM, eBookTxtFile: EBookTxtFile;
    currEBook = eBooks[i];
    eBookTxtFile = await getEBookTxtFile(currEBook);
    eBookTxtFiles.push(eBookTxtFile);
  }

  totalCharCountTimer = Timer.start();

  for(let i = 0; i < eBookTxtFiles.length; ++i) {
    let eBookTxtFile: EBookTxtFile;
    let countCharsResult: CountCharsResult;
    eBookTxtFile = eBookTxtFiles[i];
    countCharsResult = await countCharsByLine(eBookTxtFile);
    countCharsResultTuples.push([
      eBookTxtFile,
      countCharsResult,
    ]);
    console.log('');
    console.log(eBookTxtFile.title);
    console.log(`${getIntuitiveTimeString(countCharsResult.ms)}`);
    console.log(`lines: ${countCharsResult.lineCount.toLocaleString()}`);
    console.log(`totalChars: ${countCharsResult.totalCharCount.toLocaleString()}`);
  }

  totalCharCountMs = totalCharCountTimer.stop();

  console.log(`\ntotalCharCount took: ${getIntuitiveTimeString(totalCharCountMs)}`);

  for(let i = 0; i < countCharsResultTuples.length; ++i) {
    let currCountCharsResultTuple: [ EBookTxtFile, CountCharsResult ];
    let currEBookTxtFile: EBookTxtFile, currCountCharsResult: CountCharsResult;
    let fileNamePostfix: string;
    currCountCharsResultTuple = countCharsResultTuples[i];
    [ currEBookTxtFile, currCountCharsResult ] = currCountCharsResultTuple;
    fileNamePostfix = `${COUNT_CHARS_FILE_NAME_POSTFIX}-line`;
    await writeCharCountTxtOutput({
      eBookTxtFile: currEBookTxtFile,
      countCharsResult: currCountCharsResult,
      fileNamePostfix,
    });
  }
}
