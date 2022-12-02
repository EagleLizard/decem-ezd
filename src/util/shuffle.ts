
export function zipShuffle<T>(_arr: T[]): T[] {
  let midPointIdx: number, firstHalf: T[], lastHalf: T[];
  let maxLen: number;
  let resArr: T[];
  midPointIdx = Math.round(_arr.length / 2);
  firstHalf = _arr.slice(0, midPointIdx);
  lastHalf = _arr.slice(midPointIdx);
  if(_arr.length < 2) {
    return _arr.slice();
  }
  resArr = [];
  maxLen = Math.max(firstHalf.length, lastHalf.length);
  for(let i = 0; i < maxLen; ++i) {
    if(i < lastHalf.length) {
      resArr.push(lastHalf[i]);
    }
    if(i < firstHalf.length) {
      resArr.push(firstHalf[i]);
    }
  }

  return resArr;
}
