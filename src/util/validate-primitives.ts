
export function isString(val: unknown): val is string {
  if((typeof val) === 'string') {
    return true;
  }
  return false;
}
