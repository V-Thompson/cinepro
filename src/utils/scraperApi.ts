import axios, { AxiosRequestConfig } from 'axios';

/**
 * Fetch a URL with ScraperAPI proxy support
 * If SCRAPER_API_KEY is not set, falls back to direct request
 */
export async function fetchWithScraperAPI<T = any>(
  url: string,
  config?: AxiosRequestConfig
): Promise<T> {
  const scraperApiKey = process.env.SCRAPER_API_KEY;

  if (!scraperApiKey) {
    // Fallback to direct request if no key
    const response = await axios.get<T>(url, config);
    return response.data;
  }

  // Route through ScraperAPI
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
}
