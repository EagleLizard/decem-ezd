
export function isString(val: unknown): val is string {
  if((typeof val) === 'string') {
    return true;
  }
  return false;
}

export function isNumber(val: unknown): val is number {
  return (typeof val) === 'number';
}
