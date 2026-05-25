/**
 * Cache Manager
 * Handles in-memory caching of scraped links with TTL support
 */

import { CacheEntry, CachedSource, CacheLookupRequest, CacheStats } from './types.js';

export class CacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
    stores: 0,
    invalidations: 0
  };

  private ttlSources: number;
  private maxLinkAge: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(ttlSources: number = 3600, maxLinkAge: number = 300) {
    this.ttlSources = ttlSources;
    this.maxLinkAge = maxLinkAge;

    // Start cleanup interval (every 5 minutes)
    this.startCleanupInterval();
  }

  /**
   * Generate cache key from lookup request
   */
  private generateKey(req: CacheLookupRequest): string {
    if (req.contentType === 'tv') {
      return `tv:${req.tmdbId}:s${req.season}e${req.episode}`;
    }
    return `movie:${req.tmdbId}`;
  }

  /**
   * Lookup cached sources
   */
  lookup(req: CacheLookupRequest): CachedSource[] | null {
    const key = this.generateKey(req);
    const entry = this.cache.get(key);

    // Check if entry exists and hasn't expired
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now() / 1000;
    if (now > entry.expiresAt) {
      // Expired - remove and return null
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    if (!entry.isValid) {
      // Marked as invalid
      this.stats.misses++;
      return null;
    }

    // Cache hit!
    this.stats.hits++;
    entry.hits++;

    return entry.sources;
  }

  /**
   * Store scraped sources
   */
  store(
    tmdbId: number,
    contentType: 'movie' | 'tv',
    sources: CachedSource[],
    season?: number,
    episode?: number
  ): string {
    const key = contentType === 'tv' 
      ? `tv:${tmdbId}:s${season}e${episode}`
      : `movie:${tmdbId}`;

    const now = Date.now() / 1000;
    const expiresAt = now + this.ttlSources;

    const entry: CacheEntry = {
      tmdbId,
      contentType,
      season,
      episode,
      sources,
      createdAt: now,
      expiresAt,
      isValid: true,
      hits: 0
    };

    this.cache.set(key, entry);
    this.stats.stores++;

    return key;
  }

  /**
   * Invalidate cache entry
   */
  invalidate(
    tmdbId: number,
    contentType: 'movie' | 'tv',
    season?: number,
    episode?: number,
    providerId?: string
  ): number {
    let invalidatedCount = 0;

    if (providerId) {
      // Invalidate specific provider
      const key = contentType === 'tv' 
        ? `tv:${tmdbId}:s${season}e${episode}`
        : `movie:${tmdbId}`;

      const entry = this.cache.get(key);
      if (entry) {
        entry.sources = entry.sources.filter(s => s.providerId !== providerId);
        if (entry.sources.length === 0) {
          this.cache.delete(key);
          invalidatedCount = 1;
        }
      }
    } else {
      // Invalidate entire entry
      const key = contentType === 'tv' 
        ? `tv:${tmdbId}:s${season}e${episode}`
        : `movie:${tmdbId}`;

      if (this.cache.has(key)) {
        this.cache.delete(key);
        invalidatedCount = 1;
      }
    }

    this.stats.invalidations += invalidatedCount;
    return invalidatedCount;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const now = Date.now() / 1000;
    let validEntries = 0;
    let expiredEntries = 0;
    let totalAge = 0;

    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expiredEntries++;
      } else if (entry.isValid) {
        validEntries++;
        totalAge += now - entry.createdAt;
      }
    }

    const totalHits = this.stats.hits;
    const totalAttempts = totalHits + this.stats.misses;
    const hitRate = totalAttempts > 0 ? totalHits / totalAttempts : 0;

    return {
      cacheSize: this.cache.size,
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      hitRate: Number(hitRate.toFixed(3)),
      averageCacheAge: validEntries > 0 ? totalAge / validEntries : 0
    };
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Start automatic cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now() / 1000;
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt || !entry.isValid) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[CacheManager] Cleaned up ${removed} expired entries`);
    }
  }

  /**
   * Stop cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Singleton instance
let cacheManagerInstance: CacheManager | null = null;

export function getCacheManager(): CacheManager {
  if (!cacheManagerInstance) {
    const ttl = Number(process.env.CACHE_TTL_SOURCES ?? 3600);
    const maxAge = Number(process.env.MAX_LINK_AGE_CHECK ?? 300);
    cacheManagerInstance = new CacheManager(ttl, maxAge);
  }
  return cacheManagerInstance;
}
