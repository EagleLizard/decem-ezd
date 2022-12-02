
import path from 'path';
import os from 'os';
import { writeFile } from 'fs/promises';

import rimraf from 'rimraf';

import { Walk2CbParams, walkDir2 } from './walk-dir2/walk-dir2';
import { Timer } from '../../util/timer';
import { getIntuitiveTimeString } from '../../util/print-util';
import { BASE_DIR } from '../../constants';

export async function dirWalkMain() {
  let targetPath: string;
  let pathWalkTimer: Timer, pathWalkMs: number;
  let rimrafTimer: Timer, rimrafMs: number;
  let foundDirs: string[];
  // targetPath = `${os.homedir()}${path.sep}my-repos`;
  targetPath = [
    os.homedir(),
    'repos',
  ].join(path.sep);

  console.log(targetPath);

  foundDirs = [];

  const walkCb = (walkParams: Walk2CbParams) => {
    // if(
    //   walkParams.fullPath.includes('novem-ezd')
    //   || !walkParams.isDir
    //   || !isRootNodeModules(walkParams.fullPath)
    // ) {
    //   return;
    // }
    // foundDirs.push(walkParams.fullPath);
    if(
      walkParams.isFile
      && walkParams.fullPath.includes('.csv')
    ) {
      foundDirs.push(walkParams.fullPath);
    }
  };

  pathWalkTimer = Timer.start();
  await walkDir2(targetPath, walkCb);
  pathWalkMs = pathWalkTimer.stop();

  const pathsOutputFilePath = [
    BASE_DIR,
    'out.txt',
  ].join(path.sep);

  await writeFile(pathsOutputFilePath, foundDirs.join('\n'));

  // rimrafTimer = Timer.start();
  // for(let i = 0; i < foundDirs.length; ++i) {
  //   let currDir: string;
  //   currDir = foundDirs[i];
  //   console.log(`${currDir}`);
  //   try {
  //     await _rimraf(currDir);
  //   } catch(e) {
  //     if(e.code === 'EACCES') {
  //       console.error(e.message);
  //     } else {
  //       throw e;
  //     }
  //   }
  // }
  // rimrafMs = rimrafTimer.stop();
  console.log(`walkDir2 took ${getIntuitiveTimeString(pathWalkMs)}`);
  // console.log(`rimraf took: ${getIntuitiveTimeString(rimrafMs)}`);

  console.log('targetPath');
  console.log(targetPath);
}

function isRootNodeModules(dirPath: string): boolean {
  let pathParts: string[], nodeModulePartsCount: number;
  pathParts = dirPath.split(path.sep);
  if(pathParts[pathParts.length - 1] !== 'node_modules') {
    return false;
  }
  nodeModulePartsCount = 0;
  pathParts.forEach(pathPart => {
    if(pathPart === 'node_modules') {
      nodeModulePartsCount++;
    }
  });

  return nodeModulePartsCount === 1;
}

function _rimraf(targetPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    rimraf(targetPath, (err) => {
      if(err) {
        return reject(err);
      }
      resolve();
    });
  });
}
