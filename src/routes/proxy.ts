import { Router, Request, Response } from 'express';
import axios, { AxiosError } from 'axios';

const router = Router();

/**
 * GET /proxy
 * 
 * Proxy route that fetches a URL and streams the response back to the client.
 * 
 * Query Parameters:
 *   - url: The URL to fetch (required)
 *   - referer: The Referer header to use (optional, defaults to the origin of the url)
 *   - userAgent: The User-Agent header to use (optional)
 * 
 * Headers Set:
 *   - Access-Control-Allow-Origin: * (CORS header for frontend access)
 *   - Content-Type: Preserved from the upstream response
 *   - Content-Length: Preserved from the upstream response (if available)
 */
router.get('/proxy', async (req: Request, res: Response) => {
  try {
    const { url, referer, userAgent } = req.query;

    // Validate that url parameter is provided
    if (!url || typeof url !== 'string') {
      res.status(400).json({
        error: 'Missing or invalid "url" query parameter',
      });
      return;
    }

    // Validate that the URL is a valid HTTP(S) URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      res.status(400).json({
        error: 'Invalid URL format',
      });
      return;
    }

    // Ensure only HTTP(S) protocols are allowed
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      res.status(400).json({
        error: 'Only HTTP and HTTPS URLs are allowed',
      });
      return;
    }

    // Set up headers for the upstream request
    const headers: Record<string, string> = {
      'User-Agent':
        typeof userAgent === 'string'
          ? userAgent
          : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    // Set Referer header (defaults to the origin of the requested URL if not provided)
    if (typeof referer === 'string') {
      headers['Referer'] = referer;
    } else {
      headers['Referer'] = `${parsedUrl.protocol}//${parsedUrl.host}`;
    }

    // Build the request URL - route through ScraperAPI if API key is available
    let requestUrl = url as string;
    const scraperApiKey = process.env.SCRAPER_API_KEY;

    if (scraperApiKey) {
      // Route through ScraperAPI
      requestUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(url as string)}`;
    }

    // Fetch the URL with axios
    const response = await axios.get(requestUrl, {
      headers,
      responseType: 'stream',
      timeout: 30000, // 30 second timeout
      validateStatus: () => true, // Don't throw on any status code
    });

    // Set CORS header to allow frontend access
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Preserve important headers from the upstream response
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }

    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    // Set the status code from the upstream response
    res.status(response.status);

    // Pipe the response stream directly to the client
    response.data.pipe(res);

    // Handle errors in the stream
    response.data.on('error', (error: Error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Error streaming the requested content',
        });
      } else {
        res.end();
      }
    });
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Proxy error:', error);

    if (!res.headersSent) {
      res.status(502).json({
        error: 'Failed to fetch the requested URL',
        details: axiosError.message || 'Unknown error',
      });
    } else {
      res.end();
    }
  }
});

/**
 * OPTIONS /proxy
 * 
 * Handle CORS preflight requests for the proxy route.
 */
router.options('/proxy', (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

export default router;
