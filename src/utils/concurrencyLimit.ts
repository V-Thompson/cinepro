import pLimit from 'p-limit';
import type { AxiosRequestConfig } from 'axios';

/**
 * Maximum number of concurrent ScraperAPI requests allowed at any time.
 * Requests beyond this limit are queued and processed as slots free up.
 */
const SCRAPER_API_CONCURRENCY = 3;

export const scraperApiLimiter = pLimit(SCRAPER_API_CONCURRENCY);

/**
 * Wraps an async ScraperAPI fetch call with the concurrency limiter.
 * At most SCRAPER_API_CONCURRENCY requests will be in-flight simultaneously;
 * additional calls are queued and executed in order as slots become available.
 */
export function limitedScraperAPIFetch<T = any>(
    fn: (url: string, config?: AxiosRequestConfig) => Promise<T>,
    url: string,
    config?: AxiosRequestConfig
): Promise<T> {
    return scraperApiLimiter(() => fn(url, config));
}
