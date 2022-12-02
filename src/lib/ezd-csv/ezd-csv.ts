
import path from 'path';


import { DATA_DIR_PATH } from '../../constants';
import { Timer } from '../../util/timer';
import { sleep } from '../../util/sleep';
import { getIntuitiveTimeString } from '../../util/print-util';
import { isString } from '../../util/validate-primitives';

import { CsvReader, getCsvReader, parseCsv } from './parse-csv';

export async function ezdCsvMain() {
  let csvPath: string;

  csvPath = [
    DATA_DIR_PATH,
    '2022_11_18.csv',
  ].join(path.sep);

  const iteratorTimer = Timer.start();
  await parseCsvWithReader(csvPath);
  const iteratorMs = iteratorTimer.stop();
  console.log(`iterator parse took: ${getIntuitiveTimeString(iteratorMs)}`);
  // await parseCsv(csvPath, recordCb);
  // console.log(`# records: ${(recordIdx + 1).toLocaleString()}`);

}

async function parseCsvWithReader(csvPath: string) {
  let headers: string[];
  let csvReader: CsvReader, rawRecord: unknown;
  let recordIdx: number;

  recordIdx = 0;

  csvReader = getCsvReader(csvPath);

  while((rawRecord = await csvReader.read()) !== null) {
    let record: unknown[];

    if(!Array.isArray(rawRecord)) {
      console.error(rawRecord);
      throw new Error(`Encountered record that isn't array type, found type: ${typeof rawRecord}`);
    }
    record = rawRecord;
    if(recordIdx === 0) {
      if(!record.every(isString)) {
        console.error(record);
        throw new Error(`Invalid header record, expected string[], received: ${typeof record}`);
      }
      headers = record;
      console.log('headers:');
      console.log(headers);
    } else {
      // parse record
    }
    recordIdx++;
  }
  console.log(`# records: ${(recordIdx + 1).toLocaleString()}`);
}
