/**
 * Cache Routes
 * Endpoints for cache lookup, store, invalidate, and stats
 */

import { Router, Request, Response } from 'express';
import { getCacheManager } from '../cache/cacheManager.js';
import { getExtensionBridge } from '../extension/extensionBridge.js';
import {
  CacheLookupRequest,
  CacheStoreRequest,
  CacheInvalidateRequest
} from '../cache/types.js';

const router = Router();
const cacheManager = getCacheManager();
const extensionBridge = getExtensionBridge();

/**
 * POST /cache/lookup
 * Frontend checks if movie/show is cached
 */
router.post('/cache/lookup', async (req: Request, res: Response) => {
  try {
    const { tmdbId, contentType, season, episode } = req.body as CacheLookupRequest;

    // Validate input
    if (!tmdbId || !contentType) {
      res.status(400).json({
        found: false,
        error: 'Missing required fields: tmdbId, contentType'
      });
      return;
    }

    if (!['movie', 'tv'].includes(contentType)) {
      res.status(400).json({
        found: false,
        error: 'Invalid contentType. Must be "movie" or "tv"'
      });
      return;
    }

    // Lookup in cache
    const sources = cacheManager.lookup({
      tmdbId,
      contentType: contentType as 'movie' | 'tv',
      season,
      episode
    });

    if (sources && sources.length > 0) {
      res.status(200).json({
        found: true,
        sources,
        cacheAge: Math.round((Date.now() / 1000))
      });
    } else {
      res.status(200).json({
        found: false,
        requiresExtensionScrape: true,
        reason: 'No cached sources found or cache expired'
      });
    }
  } catch (error) {
    console.error('[Cache] Lookup error:', error);
    res.status(500).json({
      found: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /cache/store
 * Extension sends scraped sources to store
 */
router.post('/cache/store', async (req: Request, res: Response) => {
  try {
    // Validate extension request
    const validation = extensionBridge.validateRequest(req.headers, req.body);
    if (!validation.valid) {
      res.status(401).json({
        success: false,
        message: validation.error || 'Unauthorized'
      });
      return;
    }

    const {
      tmdbId,
      contentType,
      sources,
      season,
      episode
    } = req.body as CacheStoreRequest;

    // Validate input
    if (!tmdbId || !contentType || !sources || !Array.isArray(sources)) {
      res.status(400).json({
        success: false,
        message: 'Missing or invalid required fields: tmdbId, contentType, sources'
      });
      return;
    }

    if (sources.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Sources array cannot be empty'
      });
      return;
    }

    // Validate each source
    for (const source of sources) {
      if (!source.providerId || !source.url || !source.type) {
        res.status(400).json({
          success: false,
          message: 'Each source must have: providerId, url, type'
        });
        return;
      }

      // Validate URL format
      try {
        new URL(source.url);
      } catch {
        res.status(400).json({
          success: false,
          message: `Invalid URL: ${source.url}`
        });
        return;
      }
    }

    // Store in cache
    const cacheKey = cacheManager.store(
      tmdbId,
      contentType as 'movie' | 'tv',
      sources,
      season,
      episode
    );

    console.log(
      `[Cache] Stored ${sources.length} sources for ${contentType} ${tmdbId}`,
      `from extension: ${validation.extensionId}`
    );

    res.status(200).json({
      success: true,
      message: 'Sources cached successfully',
      cacheKey
    });
  } catch (error) {
    console.error('[Cache] Store error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /cache/invalidate
 * Invalidate cache entries (mark as broken or remove)
 */
router.post('/cache/invalidate', async (req: Request, res: Response) => {
  try {
    const {
      tmdbId,
      contentType,
      season,
      episode,
      providerId
    } = req.body as CacheInvalidateRequest;

    // Validate input
    if (!tmdbId || !contentType) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: tmdbId, contentType'
      });
      return;
    }

    // Invalidate in cache
    const invalidatedCount = cacheManager.invalidate(
      tmdbId,
      contentType as 'movie' | 'tv',
      season,
      episode,
      providerId
    );

    console.log(
      `[Cache] Invalidated ${invalidatedCount} cache entries for ${contentType} ${tmdbId}`
    );

    res.status(200).json({
      success: true,
      message: 'Cache entries invalidated',
      invalidatedCount
    });
  } catch (error) {
    console.error('[Cache] Invalidate error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /cache/stats
 * Get cache statistics
 */
router.get('/cache/stats', async (req: Request, res: Response) => {
  try {
    const stats = cacheManager.getStats();
    const extensionInfo = extensionBridge.getExtensionInfo();

    res.status(200).json({
      cache: stats,
      security: {
        extensionSecretConfigured: extensionInfo.secretConfigured,
        allowedExtensionsCount: extensionInfo.extensionsWhitelisted,
        allowedExtensions: extensionInfo.allowedExtensions
      }
    });
  } catch (error) {
    console.error('[Cache] Stats error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * OPTIONS /cache/*
 * Handle CORS preflight requests
 */
router.options('/cache/:action', (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-extension-secret');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

export default router;
