# Cinepro Hybrid Architecture Guide

## Overview

Cinepro now operates on a **hybrid model** where scraping is distributed across client residential IPs, while Railway handles caching and serving links.

### The Problem (Solved)
- Server IP gets banned when scraping directly
- Costs escalate with scale
- Single point of failure

### The Solution
- **Extension** (Client): Scrapes via user's home IP
- **Railway** (Backend): Caches links, serves queries
- **Frontend**: Orchestrates requests

---

## Architecture Diagram

```
User Clicks "Play"
       ↓
Frontend: "Do we have this cached?"
       ↓
[RAILWAY LOOKUP]
       ↓
    ┌──────────┬──────────┐
    ↓          ↓
 YES        NO
 ↓           ↓
[Return    [Signal
 Cached    Extension
 Links]    to Scrape]
 ↓           ↓
User      Extension:
Watches   Scrapes via
Video     Home IP
          ↓
      [Extract Link]
          ↓
      [Send to Railway]
          ↓
      [Railway Caches]
          ↓
      Frontend Gets Link
          ↓
      User Watches Video
```

---

## Key Components

### 1. **Railway Backend** (Server)
Location: `src/cache/` and `src/routes/cache.ts`

**Responsibilities:**
- Receive cache lookup requests from frontend
- Return cached links if available
- Accept scraped links from extension
- Store links with TTL (1 hour default)
- Invalidate expired/broken links

**Environment Variables:**
```
CACHE_TTL_SOURCES=3600              # 1 hour
CACHE_TTL_SUBTITLES=86400           # 24 hours
EXTENSION_SECRET=your-secret-key    # For validation
ALLOWED_EXTENSIONS=extension-id-1   # Whitelist
LINK_EXPIRATION_TTL=3600
```

---

## API Endpoints

### 1. Cache Lookup
```
POST /cache/lookup

Request:
{
  "tmdbId": 550,
  "contentType": "movie"
}

TV Request:
{
  "tmdbId": 1396,
  "contentType": "tv",
  "season": 1,
  "episode": 1
}

Response (Hit):
{
  "found": true,
  "sources": [
    {
      "url": "https://stream.com/video.m3u8",
      "quality": "1080p",
      "type": "hls",
      "providerId": "vidsrc",
      "headers": {
        "Referer": "https://example.com"
      }
    }
  ]
}

Response (Miss):
{
  "found": false,
  "requiresExtensionScrape": true,
  "reason": "No cached sources found"
}
```

### 2. Store Scraped Links
```
POST /cache/store

Headers:
{
  "x-extension-secret": "your-secret-key"
}

Request:
{
  "tmdbId": 550,
  "contentType": "movie",
  "sources": [
    {
      "providerId": "vidsrc",
      "url": "https://stream.com/video.m3u8",
      "quality": "1080p",
      "type": "hls",
      "headers": {
        "Referer": "https://cloudnestra.com"
      }
    }
  ]
}

Response:
{
  "success": true,
  "message": "Sources cached successfully"
}
```

### 3. Invalidate Cache
```
POST /cache/invalidate

Request:
{
  "tmdbId": 550,
  "contentType": "movie",
  "providerId": "vidsrc"  // optional
}

Response:
{
  "success": true,
  "message": "Cache invalidated"
}
```

### 4. Cache Stats
```
GET /cache/stats

Response:
{
  "cacheSize": 150,
  "totalEntries": 342,
  "validEntries": 298,
  "expiredEntries": 44,
  "hitRate": 0.87
}
```

---

## Workflow: Step by Step

### When User Clicks "Play"

**Step 1: Frontend Asks Railway**
```typescript
const response = await fetch('/cache/lookup', {
  method: 'POST',
  body: JSON.stringify({
    tmdbId: 550,
    contentType: 'movie'
  })
});
```

**Step 2a: Cache Hit (Fast Lane) ⚡**
```
Railway: "Yes! We have a fresh link for Fight Club"
Response: { found: true, sources: [...] }
Result: Video plays instantly, no scraping needed
```

**Step 2b: Cache Miss (Needs Scraping)**
```
Railway: "No, we don't have that cached"
Response: { found: false, requiresExtensionScrape: true }
Frontend: "Extension! We need you to scrape this movie"
```

**Step 3: Extension Scrapes via User's IP**
```typescript
// Extension code (NOT on Railway):
const scrapedLinks = await scrapeAllProviders(tmdbId);

// For example:
[
  { providerId: 'vidsrc', url: 'https://stream1.com/video.m3u8' },
  { providerId: 'vidnest', url: 'https://stream2.com/video.m3u8' }
]
```

**Step 4: Extension Sends Back to Railway**
```typescript
await fetch('https://railway.cinepro.cc/cache/store', {
  method: 'POST',
  headers: {
    'x-extension-secret': 'YOUR_SECRET'
  },
  body: JSON.stringify({
    tmdbId: 550,
    contentType: 'movie',
    sources: scrapedLinks
  })
});
```

**Step 5: Railway Caches & Frontend Gets Link**
```
Railway stores: Fight Club links expire in 1 hour
Next 4,999 users who want Fight Club: Get instant result!
Your server IP: Never touched
Your costs: $0 scraping
```

---

## Configuration Changes Needed

### 1. Update Your `.env` File

Add these new variables:

```bash
# Extension Security
EXTENSION_SECRET=your-super-secret-key-here
ALLOWED_EXTENSIONS=cinepro-extension-v1

# Cache Configuration
CACHE_TTL_SOURCES=3600        # 1 hour for movies/shows
CACHE_TTL_SUBTITLES=86400     # 24 hours for subtitles
LINK_EXPIRATION_TTL=3600      # Same as above
MAX_LINK_AGE_CHECK=300        # Re-validate old links after 5 min

# You can remove these (no longer needed):
# SCRAPER_API_KEY=...  (extension does scraping now)
```

### 2. Update Providers

Your providers (like `vidsrc.ts`) need to **stay mostly the same**, but:

**OLD WAY (Still works for testing):**
```typescript
// Providers run on Railway, scrape directly
const html = await this.fetchPage(pageUrl, media);
```

**NEW WAY (Hybrid):**
```typescript
// Extension calls these scraping functions
// Railway only caches results
// Frontend orchestrates
```

---

## How to Integrate Extension

### From Browser Extension Code

```typescript
// cinepro-extension/src/scraper.ts

async function scrapeMovie(tmdbId: number) {
  // 1. Run YOUR existing scraping logic
  const sources = await runAllProviders(tmdbId);
  
  // 2. Send results to Railway
  const response = await fetch(
    'https://your-railway-url/cache/store',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-extension-secret': 'your-secret-key'
      },
      body: JSON.stringify({
        tmdbId,
        contentType: 'movie',
        sources: sources.map(s => ({
          providerId: s.provider,
          url: s.url,
          quality: s.quality,
          type: 'hls',  // or 'mp4' or 'dash'
          headers: s.headers
        }))
      })
    }
  );
  
  return response.json();
}
```

### From Frontend Code

```typescript
// cinepro-ui/src/player.ts

async function playMovie(tmdbId: number) {
  // Step 1: Check cache
  const cacheResult = await fetch('/cache/lookup', {
    method: 'POST',
    body: JSON.stringify({
      tmdbId,
      contentType: 'movie'
    })
  }).then(r => r.json());
  
  // Step 2: If cache hit, play immediately
  if (cacheResult.found) {
    const url = cacheResult.sources[0].url;
    playVideo(url);
    return;
  }
  
  // Step 3: If cache miss, trigger extension
  if (cacheResult.requiresExtensionScrape) {
    // Send message to extension
    chrome.runtime.sendMessage({
      action: 'scrapeMovie',
      tmdbId
    }, (response) => {
      // Wait a moment for extension to post results
      setTimeout(() => {
        // Retry cache lookup
        playMovie(tmdbId);
      }, 2000);
    });
  }
}
```

---

## Database Schema (If Using Redis/Postgres)

### Option 1: Redis (Fast, In-Memory)
```
Key: "movie:550"
Value: {
  sources: [
    { url, quality, providerId, type, headers },
    ...
  ],
  expiresAt: timestamp,
  isValid: true
}

Expiration: TTL = 3600 seconds
```

### Option 2: PostgreSQL (Persistent)
```sql
CREATE TABLE cached_sources (
  id UUID PRIMARY KEY,
  content_type VARCHAR(10),  -- 'movie' or 'tv'
  tmdb_id INT NOT NULL,
  season INT,
  episode INT,
  provider_id VARCHAR(50),
  url TEXT NOT NULL,
  quality VARCHAR(20),
  type VARCHAR(10),  -- 'hls', 'mp4', 'dash'
  headers JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  is_valid BOOLEAN DEFAULT true,
  CONSTRAINT unique_cache UNIQUE(content_type, tmdb_id, season, episode, provider_id)
);

CREATE INDEX idx_cache_lookup ON cached_sources(tmdb_id, content_type);
CREATE INDEX idx_expires ON cached_sources(expires_at);
```

---

## Security Considerations

### 1. Extension Authentication
- All extension requests must include `x-extension-secret` header
- Validate signature on incoming requests
- Whitelist specific extension IDs in `ALLOWED_EXTENSIONS`

### 2. Rate Limiting
- Limit how many cache stores per extension per minute
- Prevent extension from spamming endpoint

### 3. Data Validation
- Validate all URLs before caching
- Sanitize headers
- Check content-type matches (HLS should end in .m3u8, etc.)

---

## Monitoring & Debugging

### Check Cache Health
```bash
curl https://your-railway-url/cache/stats
```

Response:
```json
{
  "cacheSize": 1250,
  "totalEntries": 3847,
  "validEntries": 3201,
  "expiredEntries": 646,
  "hitRate": 0.83
}
```

### View Extension Activity Logs
```bash
docker logs your-railway-container | grep EXTENSION
```

---

## Costs Breakdown

### With Hybrid Architecture (5,000 Users)

| Component | Cost |
|-----------|------|
| Railway (Database + API) | ~$5-20/month |
| Scraping (5,000 home IPs) | $0 |
| Bandwidth (Cached) | ~$10-30/month |
| **Total** | ~$15-50/month |

### Without Hybrid (Old Way)

| Component | Cost |
|-----------|------|
| Railway (Heavy scraping) | $50-200+/month |
| Scraper API | $0-300+/month |
| Bandwidth | $20-50/month |
| **Total** | $70-550+/month |

---

## Next Steps

1. ✅ Update `.env` with new variables
2. ✅ Deploy new `/cache/*` endpoints to Railway
3. 📝 Modify browser extension to call `/cache/store`
4. 📝 Modify frontend UI to call `/cache/lookup`
5. 🧪 Test with 1-2 users
6. 📈 Scale to 5,000+ users

---

## Troubleshooting

### Links Not Being Cached
- Check `EXTENSION_SECRET` matches on both sides
- Verify `x-extension-secret` header is being sent
- Check Railway logs for validation errors

### Cache Hits Always Fail
- Increase `LINK_EXPIRATION_TTL` if links expire too fast
- Check if links are actually valid (test manually)
- See if `isValid` flag is being set incorrectly

### Extension Can't Post to Railway
- Verify CORS is enabled on `POST /cache/store`
- Check extension secret header
- Test with curl first to isolate issue

---

## Questions?

See the inline comments in:
- `src/cache/cacheManager.ts` - Core logic
- `src/routes/cache.ts` - API endpoints
- `src/extension/extensionBridge.ts` - Extension communication
