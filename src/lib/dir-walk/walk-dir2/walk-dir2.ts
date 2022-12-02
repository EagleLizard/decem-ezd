import { Dirent, readdir } from 'fs';
import path from 'path';

export interface WalkDir2Result {
  paths: string[];
  dirs: string[];
}

export type Walk2CbParams = {
  isFile: boolean;
  isDir: boolean;
  fullPath: string;
};

export function walkDir2(
  dir: string,
  cb?: (walkParams: Walk2CbParams) => void
): Promise<WalkDir2Result> {
  return new Promise((resolve, reject) => {
    let paths: string[], dirs: string[];
    let cursor: number, readCount: number;
    paths = [];
    dirs = [ dir ];
    cursor = 0;
    readCount = 0;

    walk();

    function walk() {
      let total: number;
      total = dirs.length;
      for(; cursor < total; ++cursor) {
        let currDir: string;
        currDir = dirs[cursor];
        readdir(currDir, {
          withFileTypes: true,
        }, (err, dirents) => {

          if(err) {
            // console.error('walkdir err');
            // console.error(err);
          }
          dirents = dirents ?? [];
          for(let i = 0; i < dirents.length; ++i) {
            let currDirent: Dirent, fullPath: string;
            let walkParams: Walk2CbParams;
            currDirent = dirents[i];
            fullPath = `${currDir}${path.sep}${currDirent.name}`;
            walkParams = {
              fullPath,
              isDir: false,
              isFile: false,
            };
            if(currDirent.isDirectory()) {
              dirs.push(fullPath);
              walkParams.isDir = true;
            } else {
              paths.push(fullPath);
              walkParams.isFile = true;
            }
            cb?.(walkParams);
          }
          if(++readCount === total) {
            if(dirs.length === cursor) {
              resolve({
                dirs,
                paths,
              });
            } else {
              walk();
            }
          }
        });
      }
    }
  });
}
