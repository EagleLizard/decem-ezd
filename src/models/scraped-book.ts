
export type ScrapedBook = {
  title: string;
  plaintextUrl: string;
  pageUrl: string;
  rank: number;
};

export type ScrapedBookWithFile = {
  fileName: string;
  filePath: string;
} & ScrapedBook;
