
import { createReadStream, ReadStream } from 'fs';
import { isPromise } from 'util/types';

import { parser as CsvParser, parse as csvParse } from 'csv';

import { checkFile } from '../../util/files';

export async function parseCsv(
  csvPath: string,
  recordCb: (record: unknown, idx?: number) => void | Promise<void>
) {
  let parseCsvFn: AsyncGenerator, recordItr: IteratorResult<unknown>;
  let recordIdx: number;
  parseCsvFn = parseCsvGenerator(csvPath);

  recordIdx = 0;

  while(!(recordItr = await parseCsvFn.next()).done) {
    let recordCbResult: unknown;
    recordCbResult = recordCb(recordItr.value, recordIdx++);
    if(isPromise(recordCbResult)) {
      await recordCbResult;
    }
  }
}

export type CsvReader = {
  read: () => Promise<unknown | null>;
};

export function getCsvReader(csvPath: string): CsvReader {
  let csvReader: CsvReader;
  let parseCsvGtr: AsyncGenerator;
  parseCsvGtr = parseCsvGenerator(csvPath);

  const read = async (): Promise<unknown | null> => {
    let recordIt: IteratorResult<unknown>;
    recordIt = await parseCsvGtr.next();
    if(recordIt.done) {
      return null;
    }
    return recordIt.value;
  };

  csvReader = {
    read,
  };
  return csvReader;
}

async function* parseCsvGenerator(csvPath: string) {
  let fileExists: boolean;
  let csvParsePromise: Promise<void>, csvReadablePromise: Promise<void>;
  let csvParser: CsvParser.Parser, csvRs: ReadStream;
  // let record: unknown;

  fileExists = await checkFile(csvPath);
  if(!fileExists) {
    throw new Error(`File doesn't exist at path: ${csvPath}`);
  }

  csvParser = csvParse();
  csvRs = createReadStream(csvPath);
  csvReadablePromise = new Promise<void>((readableResolve, readableReject) => {
    csvParsePromise = new Promise<void>((resolve, reject) => {
      csvParser.on('readable', () => {
        readableResolve();
      });
      csvParser.on('error', (err) => {
        readableReject(err);
        reject(err);
      });
      csvParser.on('end', () => {
        resolve();
      });
    });
  });
  csvRs.pipe(csvParser);
  await csvReadablePromise;
  for await (const record of csvParser) {
    yield record;
  }
  await csvParsePromise;
}

export async function _parseCsv(csvPath: string, recordCb: (record: unknown) => void) {
  let fileExists: boolean;
  let csvParsePromise: Promise<void>;
  let csvParser: CsvParser.Parser, csvRs: ReadStream;

  fileExists = await checkFile(csvPath);
  if(!fileExists) {
    throw new Error(`File doesn't exist at path: ${csvPath}`);
  }

  csvParser = csvParse();
  csvRs = createReadStream(csvPath);

  csvParsePromise = new Promise<void>((resolve, reject) => {
    csvParser.on('readable', () => {
      let record: unknown;
      while((record = csvParser.read()) !== null) {
        recordCb(record);
      }
    });
    csvParser.on('error', (err) => {
      reject(err);
    });
    csvParser.on('end', () => {
      resolve();
    });
  });
  csvRs.pipe(csvParser);
  await csvParsePromise;
}
