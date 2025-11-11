#!/usr/bin/env node
// Simple Express server that provides an /apod-proxy route.
// Flow for a requested date (YYYY-MM-DD):
// 1) Try the official NASA APOD API
// 2) If that fails, try scraping the apod.nasa.gov page for that date
// 3) If still not found, ask the Wayback Machine for an archived copy and scrape that
// 4) If still not found, try the Images API as a best-effort fallback (same year)
// Responses are cached in-memory for a TTL to avoid rate limits.

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8000;
const BIND_ADDR = process.env.BIND_ADDR || '0.0.0.0';
const NASA_API_KEY = process.env.NASA_API_KEY || 'DEMO_KEY';

// Simple in-memory cache: { key: { expires: ms, data: any } }
const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data, ttl = CACHE_TTL_MS) {
  cache.set(key, { data, expires: Date.now() + ttl });
}

// Helper: resolve a NASA images-api asset (by nasa_id) to a best direct URL
async function resolveAssetByNasaId(nasaId) {
  if (!nasaId) return null;
  const cacheKey = `asset:${nasaId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://images-api.nasa.gov/asset/${encodeURIComponent(nasaId)}`;
    const res = await axios.get(url, { timeout: 15000 });
    if (res.status !== 200 || !res.data || !res.data.collection) return null;
    const items = res.data.collection.items || [];
    // Prefer mp4 if present, otherwise the largest image (heuristic: last image)
    const mp4 = items.find(i => i.href && i.href.endsWith('.mp4'));
    if (mp4 && mp4.href) {
      const out = { best: mp4.href, items, type: 'video', source: 'images-asset' };
      cacheSet(cacheKey, out, 24 * 60 * 60 * 1000);
      return out;
    }
    // images
    const images = items.filter(i => i.href && i.href.match(/\.(jpg|jpeg|png|gif)$/i));
    const best = images.length ? images[images.length - 1].href : null;
    const out = { best: best || null, items, type: 'image', source: 'images-asset' };
    cacheSet(cacheKey, out, 24 * 60 * 60 * 1000);
    return out;
  } catch (err) {
    return null;
  }
}

function dateToApodPage(dateStr) {
  // dateStr is YYYY-MM-DD -> apYYMMDD.html (two-digit year)
  const [y, m, d] = dateStr.split('-');
  const yy = y.slice(-2);
  return `https://apod.nasa.gov/apod/ap${yy}${m}${d}.html`;
}

async function fetchApodApi(date) {
  try {
    const url = `https://api.nasa.gov/planetary/apod?date=${date}&api_key=${NASA_API_KEY}`;
    const res = await axios.get(url, { timeout: 15000 });
    if (res.status === 200 && res.data) {
      return { source: 'apod-api', raw: res.data };
    }
  } catch (err) {
    // fallthrough
  }
  return null;
}

async function scrapeApodPage(pageUrl) {
  try {
    const res = await axios.get(pageUrl, { timeout: 15000, responseType: 'text' });
    if (res.status !== 200 || !res.data) return null;
    const $ = cheerio.load(res.data);

    // Title: use <title> or the first <b> in the center
    const title = $('title').first().text().trim() || $('b').first().text().trim();

    // Try to find the main image or video
    // Images are often the first <img> or wrapped in <a href=\"image...\">
    let src = null;

    // First check for an <a> that links to images (common pattern)
    const aWithImage = $('a').filter((i, el) => {
      const href = $(el).attr('href') || '';
      return /image|apod|jpg|jpeg|png|gif|mov|mp4/i.test(href);
    }).first();

    if (aWithImage && aWithImage.attr('href')) {
      src = aWithImage.attr('href');
    }

    if (!src) {
      const img = $('img').first();
      if (img && img.attr('src')) src = img.attr('src');
    }

    if (!src) return null;

    // Make absolute URL
    const absolute = new URL(src, 'https://apod.nasa.gov/apod/').href;

    // Explanation text: gather paragraphs after the <b> title block
    const explanation = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 2000);

    return {
      source: 'apod-scrape',
      raw: {
        url: absolute,
        title: title || null,
        explanation: explanation || null,
      },
    };
  } catch (err) {
    return null;
  }
}

async function fetchWaybackAndScrape(originalPage) {
  try {
    const availUrl = `http://archive.org/wayback/available?url=${encodeURIComponent(originalPage)}`;
    const availRes = await axios.get(availUrl, { timeout: 10000 });
    if (availRes.status !== 200 || !availRes.data) return null;
    const snapshots = availRes.data.archived_snapshots;
    if (!snapshots || !snapshots.closest || !snapshots.closest.available) return null;
    const snapshotUrl = snapshots.closest.url;
    // Fetch snapshot and scrape
    return await scrapeApodPage(snapshotUrl);
  } catch (err) {
    return null;
  }
}

async function fetchImagesApiFallback(date) {
  // Use the NASA Images API to search for images in the same year as `date`.
  // This is a best-effort fallback when APOD and Wayback don't return the asset.
  try {
    const year = date.split('-')[0];
    const q = encodeURIComponent('apod');
    const url = `https://images-api.nasa.gov/search?q=${q}&media_type=image&year_start=${year}&year_end=${year}`;
    const res = await axios.get(url, { timeout: 15000 });
    if (res.status !== 200 || !res.data || !res.data.collection || !res.data.collection.items) return null;
    const items = res.data.collection.items;
    // Find first item with links that look like a direct image
    for (const item of items) {
      if (!item.links || item.links.length === 0) continue;
      const link = item.links.find(l => l.href && /\.(jpg|jpeg|png|gif)$/i.test(l.href));
      if (link && link.href) {
        const data = (item.data && item.data[0]) || {};
        return {
          date,
          title: data.title || null,
          explanation: data.description || data.description_508 || null,
          media_type: 'image',
          url: link.href,
          source: 'images-api-fallback',
        };
      }
    }
  } catch (err) {
    // ignore
  }
  return null;
}

app.get('/apod-proxy', async (req, res) => {
  const date = req.query.date;
  if (!date || typeof date !== 'string') {
    return res.status(400).json({ error: 'Missing required `date` query parameter (YYYY-MM-DD).' });
  }

  // Basic validation YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format.' });
  }

  // Check cache
  const cacheKey = `apod:${date}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  // 1) Try APOD API
  const fromApi = await fetchApodApi(date);
  if (fromApi && fromApi.raw && (fromApi.raw.url || fromApi.raw.hdurl)) {
    const out = {
      date,
      title: fromApi.raw.title || null,
      explanation: fromApi.raw.explanation || null,
      media_type: fromApi.raw.media_type || 'image',
      url: fromApi.raw.url || fromApi.raw.hdurl || null,
      hdurl: fromApi.raw.hdurl || null,
      source: 'apod-api',
    };
    cacheSet(cacheKey, out);
    return res.json(out);
  }

  // 2) Try scraping the official APOD page
  const apodPage = dateToApodPage(date);
  const scraped = await scrapeApodPage(apodPage);
  if (scraped && scraped.raw && scraped.raw.url) {
    const out = {
      date,
      title: scraped.raw.title || null,
      explanation: scraped.raw.explanation || null,
      media_type: 'image',
      url: scraped.raw.url,
      source: 'apod-scrape',
    };
    cacheSet(cacheKey, out);
    return res.json(out);
  }

  // 3) Wayback Machine fallback
  const wayback = await fetchWaybackAndScrape(apodPage);
  if (wayback && wayback.raw && wayback.raw.url) {
    const out = {
      date,
      title: wayback.raw.title || null,
      explanation: wayback.raw.explanation || null,
      media_type: 'image',
      url: wayback.raw.url,
      source: 'apod-wayback',
    };
    cacheSet(cacheKey, out);
    return res.json(out);
  }

  // 4) Try NASA Images API as a best-effort fallback (same year)
  const imagesFallback = await fetchImagesApiFallback(date);
  if (imagesFallback && imagesFallback.url) {
    cacheSet(cacheKey, imagesFallback);
    return res.json(imagesFallback);
  }

  return res.status(404).json({ error: `No APOD found for ${date}` });
});

// Resolve endpoint: return a best direct URL for a given nasa_id
app.get('/resolve-asset', async (req, res) => {
  const nasaId = req.query.nasa_id || req.query.id || req.query.nasaId;
  if (!nasaId) return res.status(400).json({ error: 'Missing nasa_id query parameter' });
  try {
    const resolved = await resolveAssetByNasaId(nasaId);
    if (!resolved) return res.status(404).json({ error: 'No asset found for that nasa_id' });
    return res.json(resolved);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve asset' });
  }
});

// Image proxy: streams external images through the server to avoid CORS/hotlinking issues.
// For safety, only allow an allowlist of hostnames (common NASA hosts and known CDN hosts).
app.get('/image-proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Missing url query parameter' });
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const allow = [
      'apod.nasa.gov',
      'images-api.nasa.gov',
      'images.nasa.gov',
      'img.youtube.com',
      'i.ytimg.com',
      'www.youtube.com',
      'images.spaceref.com',
      'i.imgur.com',
      'pbs.twimg.com'
    ];
    const ok = allow.some(a => hostname === a || hostname.endsWith('.' + a));
    if (!ok) return res.status(403).json({ error: 'Host not allowed to be proxied' });

    const r = await axios.get(url, { responseType: 'stream', timeout: 20000 });
    const contentType = r.headers['content-type'] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    // Cache-control: let browsers cache proxied images for a short time
    res.setHeader('Cache-Control', 'public, max-age=86400');
    r.data.pipe(res);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to proxy image' });
  }
});

// Serve static files from the project root so index.html works when visiting the server
app.use(express.static(path.join(__dirname)));

// Lightweight health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', pid: process.pid, env: process.env.NODE_ENV || 'development' });
});

// Log network interfaces to help developers find a reachable host
function logNetworkInfo() {
  try {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    const ips = [];
    Object.keys(ifaces).forEach((name) => {
      ifaces[name].forEach((iface) => {
        if (iface.family === 'IPv4' && !iface.internal) ips.push({ iface: name, address: iface.address });
      });
    });
    console.log('Network addresses:', ips);
  } catch (e) {
    // ignore
  }
}

app.listen(PORT, BIND_ADDR, () => {
  // eslint-disable-next-line no-console
  console.log(`APOD proxy server listening on http://${BIND_ADDR}:${PORT}`);
  logNetworkInfo();
});

