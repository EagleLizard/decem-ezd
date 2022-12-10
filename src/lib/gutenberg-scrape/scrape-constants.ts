export enum TOP_PAGES_ENUM {
  TOP_100 = 'TOP_100',
  TOP_1000 = 'TOP_1000',
}

export enum TOP_LISTS_ENUM {
  LAST_1_DAYS = 'LAST_1_DAYS',
  LAST_7_DAYS = 'LAST_7_DAYS',
  LAST_30_DAYS = 'LAST_30_DAYS',
}

export const TOP_LISTS_ID_MAP: Record<TOP_LISTS_ENUM, string> = {
  [TOP_LISTS_ENUM.LAST_1_DAYS]: 'books-last1',
  [TOP_LISTS_ENUM.LAST_7_DAYS]: 'books-last7',
  [TOP_LISTS_ENUM.LAST_30_DAYS]: 'books-last30',
};

export const TOP_LISTS_FILE_PREFIX_MAP: Record<TOP_LISTS_ENUM, string> = {
  [TOP_LISTS_ENUM.LAST_1_DAYS]: '1d',
  [TOP_LISTS_ENUM.LAST_7_DAYS]: '7d',
  [TOP_LISTS_ENUM.LAST_30_DAYS]: '30d',
};

export const TOP_PAGES_FILE_PREFIX_MAP: Record<TOP_PAGES_ENUM, string> = {
  [TOP_PAGES_ENUM.TOP_100]: 'top100',
  [TOP_PAGES_ENUM.TOP_1000]: 'top1k',
};

export const TOP_PAGES_URL_MAP: Record<TOP_PAGES_ENUM, string> = {
  [TOP_PAGES_ENUM.TOP_100]: 'https://www.gutenberg.org/browse/scores/top',
  [TOP_PAGES_ENUM.TOP_1000]: 'https://www.gutenberg.org/browse/scores/top1000.php',
};

export const TOP_LIST_ENUM_ARR: TOP_LISTS_ENUM[] = [
  TOP_LISTS_ENUM.LAST_1_DAYS,
  TOP_LISTS_ENUM.LAST_7_DAYS,
  TOP_LISTS_ENUM.LAST_30_DAYS,
];
