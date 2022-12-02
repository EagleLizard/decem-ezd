
import path from 'path';
import {
  createWriteStream,
  WriteStream,
} from 'fs';

import { Timer } from '../../../util/timer';
import {
  checkFile,
  mkdirIfNotExistRecursive,
} from '../../../util/files';
import {
  EBookTxtFile,
  EBookTxtFileSrc,
  EBOOK_ENUM,
  EBOOK_TXT_FILE_URI_MAP,
  STATS_DELIM_END,
  STATS_DELIM_START,
  TXT_DATA_DIR_PATH,
  TXT_OUT_DIR_PATH,
} from '../txt-constants';
import {
  downloadEBook,
  readEBook,
} from './e-book-service';
import { getIntuitiveTimeString } from '../../../util/print-util';

export type CountCharsResult = {
  charCountMap: Record<string, number>;
  totalCharCount: number;
  lineCount: number;
  ms: number;
};

function getEBookTxtFileSrc(eBookMetaSrc: EBookTxtFileSrc): EBookTxtFile {
  let filePath: string;
  filePath = `${TXT_DATA_DIR_PATH}${path.sep}${eBookMetaSrc.title}.txt`;
  return {
    key: eBookMetaSrc.key,
    title: eBookMetaSrc.title,
    uri: eBookMetaSrc.uri,
    filePath,
  };
}

export async function getEBookTxtFile(eBook: EBOOK_ENUM): Promise<EBookTxtFile> {
  let eBookTxtFile: EBookTxtFile, eBookTxtFileSrc: EBookTxtFileSrc;
  let fileExists: boolean;
  let eBookGetTimer: Timer, eBookGetMs: number;

  eBookTxtFileSrc = EBOOK_TXT_FILE_URI_MAP[eBook];
  eBookTxtFile = getEBookTxtFileSrc(eBookTxtFileSrc);

  await mkdirIfNotExistRecursive(TXT_DATA_DIR_PATH);

  fileExists = await checkFile(eBookTxtFile.filePath);

  if(fileExists) {
    console.log(`'${eBookTxtFile.title}' exists.`);
  } else {
    console.log(`Downloading ${eBookTxtFile.title}: ${eBookTxtFile.uri}`);
    eBookGetTimer = Timer.start();
    await downloadEBook(eBookTxtFile);
    eBookGetMs = eBookGetTimer.stop();
    console.log(`Downloaded ${eBookTxtFile.title} in ${getIntuitiveTimeString(eBookGetMs)}.`);
  }
  return eBookTxtFile;
}

export async function countCharsByLine(eBookTxtFile: EBookTxtFile): Promise<CountCharsResult> {
  let countCharsResult: CountCharsResult;
  let charCountMap: Record<string, number>;
  let lineCount: number, totalCharCount: number;
  let readTimer: Timer, readMs: number;

  charCountMap = {};
  totalCharCount = 0;
  lineCount = 0;

  const lineCb = (line: string) => {
    for(let i = 0; i < line.length; ++i) {
      let currChar: string;
      currChar = line[i];
      // if(charCountMap[currChar] === undefined) {
      //   charCountMap[currChar] = 0;
      // }
      // charCountMap[currChar]++;
      charCountMap[currChar] = (charCountMap[currChar] ?? 0) + 1;
      totalCharCount++;
    }
    lineCount++;
  };

  readTimer = Timer.start();
  await readEBook(eBookTxtFile, {
    lineCb,
  });
  readMs = readTimer.stop();

  countCharsResult = {
    charCountMap,
    totalCharCount,
    lineCount,
    ms: readMs,
  };

  return countCharsResult;
}

export type WriteCharCountTxtOpts = {
  eBookTxtFile: EBookTxtFile;
  countCharsResult: CountCharsResult;
  fileNamePostfix: string;
}

export async function writeCharCountTxtOutput(opts: WriteCharCountTxtOpts) {
  let eBookTxtFile: EBookTxtFile,
    countCharsResult: CountCharsResult,
    fileNamePostfix: string
  ;
  let outFilePath: string, ws: WriteStream;
  let charCountTuples: [ string, number ][];

  await mkdirIfNotExistRecursive(TXT_OUT_DIR_PATH);

  eBookTxtFile = opts.eBookTxtFile;
  countCharsResult = opts.countCharsResult;
  fileNamePostfix = opts.fileNamePostfix;

  outFilePath = `${TXT_OUT_DIR_PATH}${path.sep}${eBookTxtFile.title}.${fileNamePostfix}.txt`;
  charCountTuples = Object.entries(countCharsResult.charCountMap);

  charCountTuples.sort((a, b) => {
    let aCount: number, bCount: number;
    aCount = a[1];
    bCount = b[1];
    if(aCount > bCount) {
      return -1;
    } else if(aCount < bCount) {
      return 1;
    } else {
      return 0;
    }
  });

  ws = createWriteStream(outFilePath);

  await new Promise<void>((resolve, reject) => {
    ws.on('error', err => {
      reject(err);
    });
    ws.once('ready', () => {
      ws.write(`${STATS_DELIM_START} stats ${STATS_DELIM_END}\n`);
      ws.write(`ms : ${countCharsResult.ms}\n`);
      ws.write(`lineCount : ${countCharsResult.lineCount}\n`);
      ws.write(`totalCharCount : ${countCharsResult.totalCharCount}\n`);
      ws.write(`${STATS_DELIM_START} charCount ${STATS_DELIM_END}\n`);
      for(let i = 0; i < charCountTuples.length; ++i) {
        let charCountTuple: [ string, number ];
        charCountTuple = charCountTuples[i];
        ws.write(`'${charCountTuple[0]}' : ${charCountTuple[1]}\n`);
      }
      ws.end(() => {
        resolve();
      });
    });
  });
}
