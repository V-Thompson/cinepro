import axios, { AxiosRequestConfig } from 'axios';
import { scraperApiLimiter } from './concurrencyLimit.js';

/**
 * Fetch a URL with ScraperAPI proxy support.
 * If SCRAPER_API_KEY is not set, falls back to a direct request (no limiting).
 * When routing through ScraperAPI, requests are queued through a concurrency
 * limiter so that no more than 3 hit the service simultaneously.
 */
export async function fetchWithScraperAPI<T = any>(
  url: string,
  config?: AxiosRequestConfig
): Promise<T> {
  const scraperApiKey = process.env.SCRAPER_API_KEY;

  if (!scraperApiKey) {
    // Fallback to direct request if no key — no rate-limit concern here
    const response = await axios.get<T>(url, config);
    return response.data;
  }

  // Route through ScraperAPI, gated by the concurrency limiter
  return scraperApiLimiter(async () => {
    const scraperUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(url)}`;

    const response = await axios.get<T>(scraperUrl, {
      ...config,
      headers: {
        ...config?.headers,
        // Remove Host header to avoid conflicts with ScraperAPI
        Host: undefined
      }
    });

    return response.data;
  });
}
