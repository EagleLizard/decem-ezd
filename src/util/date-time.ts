
export function getCurrentDateString(): string {
  let today: Date;
  let month: number, day: number, year: number;
  let dateString: string;
  today = new Date();
  month = today.getMonth() + 1;
  day = today.getDate();
  year = today.getFullYear();
  dateString = `${year}-${month}-${day}`;
  return dateString;
}
