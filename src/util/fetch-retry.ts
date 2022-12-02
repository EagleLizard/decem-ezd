
import fetch, { RequestInfo, RequestInit, Response } from 'node-fetch';
import { sleep } from './sleep';

export type FetchRetryOpts = {
  retries?: number;
  doRetry?: (err: any) => boolean;
  retryDelay?: (attempt: number, err: any, response?: Response) => number;
} & RequestInit;

export async function fetchRetry(url: RequestInfo, init?: FetchRetryOpts): Promise<Response> {
  let retryCount: number;
  let maxRetries: number, doRetry: FetchRetryOpts['doRetry'], retryDelay: FetchRetryOpts['retryDelay'];
  let retryDelayMs: number;
  maxRetries = init?.retries ?? 0;
  doRetry = init?.doRetry ?? (() => false);
  retryDelay = init?.retryDelay ?? (() => 0);
  retryCount = 0;
  do {
    try {
      return await fetch(url, init);
    } catch(e) {
      if(
        !doRetry(e)
        || (retryCount >= maxRetries)
      ) {
        throw e;
      }
      retryDelayMs = retryDelay(retryCount, e);
      await sleep(retryDelayMs);
      retryCount++;
    }
  } while(retryCount <= maxRetries);
}
