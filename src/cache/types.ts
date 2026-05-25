/**
 * Cache Type Definitions
 * All types used across the caching system
 */

export interface CachedSource {
  providerId: string;
  url: string;
  quality?: string;
  type: 'hls' | 'mp4' | 'dash';
  headers?: Record<string, string>;
  audioTracks?: {
    label: string;
    language: string;
  }[];
}

export interface CacheEntry {
  tmdbId: number;
  contentType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  sources: CachedSource[];
  createdAt: number;
  expiresAt: number;
  isValid: boolean;
  hits: number;
}

export interface CacheLookupRequest {
  tmdbId: number;
  contentType: 'movie' | 'tv';
  season?: number;
  episode?: number;
}

export interface CacheLookupResponse {
  found: boolean;
  sources?: CachedSource[];
  requiresExtensionScrape?: boolean;
  reason?: string;
  cacheAge?: number;
}

export interface CacheStoreRequest {
  tmdbId: number;
  contentType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  sources: CachedSource[];
}

export interface CacheStoreResponse {
  success: boolean;
  message: string;
  cacheKey?: string;
}

export interface CacheInvalidateRequest {
  tmdbId: number;
  contentType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  providerId?: string;
}

export interface CacheInvalidateResponse {
  success: boolean;
  message: string;
  invalidatedCount: number;
}

export interface CacheStats {
  cacheSize: number;
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
  hitRate: number;
  averageCacheAge: number;
}
