// Single-file client script: fetch NASA images, show in a gallery, lightbox with focus trap,
// small debug overlay (Ctrl/Cmd+D), and simple localStorage caching.
// Single-file client script: fetch NASA images, show in a gallery, lightbox with focus trap,
// small debug overlay (Ctrl/Cmd+D), and simple localStorage caching.

const getImageBtn = document.getElementById('getImageBtn');
const gallery = document.getElementById('gallery');
const queryInput = document.getElementById('queryInput');
const numSelect = document.getElementById('numSelect');
const dateSelect = document.getElementById('dateSelect');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
let APOD_API_KEY = 'DEMO_KEY';
let OMDB_API_KEY = '';

// DOM refs that we resolve after DOMContentLoaded
let statusEl = null;
let lightbox = null;
let lightboxBackdrop = null;
let lightboxClose = null;
let lightboxMedia = null;
let lightboxMeta = null;
let funFactEl = null;
let clearCacheBtn = null;

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
  else console.log('STATUS:', msg);
}

function showOrbitPlaceholder() {
  gallery.innerHTML = `<div class="placeholder orbit-placeholder"><div class="orbit-container" aria-hidden="true"><div class="orbit"></div><div class="planet"></div><div class="satellite">🚀</div></div><p class="liftoff-text">Preparing For Liftoff...</p></div>`;
}

function showLoading() {
  gallery.innerHTML = `<div class="placeholder"><div class="placeholder-icon">🔄</div><p>Loading images…</p></div>`;
}

function getCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.ts || !parsed.data) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch (e) {
    console.warn('Cache parse error', e);
    return null;
  }
}

function setCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    console.warn('Failed to set cache', e);
  }
}

function svgVideoPlaceholder() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='240'><rect width='100%' height='100%' fill='#111' /><text x='50%' y='50%' fill='#fff' font-size='20' text-anchor='middle' dy='.3em'>VIDEO</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function fetchSpaceImages() {
  const rawQuery = (queryInput && queryInput.value || '').trim();
  const queryBase = rawQuery.length ? rawQuery : 'space';
  const selectedDate = (dateSelect && dateSelect.value) ? dateSelect.value : '';
  const query = selectedDate ? `${queryBase} ${selectedDate}` : queryBase;
  const count = parseInt(numSelect && numSelect.value, 10) || 6;

  const cacheKey = `nasa_cache_${(queryBase + (selectedDate ? `_${selectedDate}` : '')).toLowerCase()}_${count}`;
  const cached = getCache(cacheKey);
  if (cached && Array.isArray(cached) && cached.length) {
    renderImages(cached);
    return;
  }

  if (selectedDate) {
    await fetchAPOD(selectedDate);
    return;
  }

  showLoading();
  if (getImageBtn) getImageBtn.disabled = true;
  try {
    const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Network error: ${resp.status}`);
    const data = await resp.json();
    const items = (data.collection && data.collection.items) || [];
    const images = [];
    for (const item of items) {
      if (!item.links || !item.links.length) continue;
      const link = item.links.find(l => l.render === 'image') || item.links[0];
      if (!link || !link.href) continue;
      const d = (item.data && item.data[0]) || {};
      images.push({
        href: link.href,
        title: d.title || '',
        nasa_id: d.nasa_id,
        date_created: d.date_created,
        photographer: d.photographer || d.secondary_creator || d.credit || d.copyright || '',
        center: d.center || '',
        description: d.description || d.description_508 || d.explanation || '',
        keywords: d.keywords || []
      });
      if (images.length >= count) break;
    }

    if (images.length === 0) {
      gallery.innerHTML = `<div class="placeholder"><p>No images found for "${query}". Try a different search.</p></div>`;
    } else {
      renderImages(images);
      setCache(cacheKey, images);
    }
  } catch (err) {
    console.error('Fetch error', err);
    gallery.innerHTML = `<div class="placeholder"><p>Error loading images: ${err.message}</p></div>`;
  } finally {
    if (getImageBtn) getImageBtn.disabled = false;
  }
}

async function fetchAPOD(date) {
  const cacheKey = `nasa_cache_apod_${date}`;
  const cached = getCache(cacheKey);
  if (cached) { renderImages(cached); return; }
  showLoading();
  if (getImageBtn) getImageBtn.disabled = true;
  try {
    const apodUrl = `https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(APOD_API_KEY)}&date=${encodeURIComponent(date)}`;
    const resp = await fetch(apodUrl);
    if (!resp.ok) throw new Error(`APOD API error: ${resp.status}`);
    const data = await resp.json();
    const isVideo = data.media_type === 'video';
    const thumb = data.thumbnail_url || (isVideo ? null : data.hdurl || data.url);
    const hrefForGrid = thumb || (isVideo ? svgVideoPlaceholder() : (data.hdurl || data.url));
    const item = {
      href: hrefForGrid,
      title: data.title || '',
      nasa_id: data.date || '',
      date_created: data.date || '',
      photographer: data.copyright || '',
      center: '',
      description: data.explanation || '',
      media_type: data.media_type || 'image',
      content_url: data.url || data.hdurl || ''
    };
    renderImages([item]);
    setCache(cacheKey, [item]);
  } catch (err) {
    console.error('APOD fetch error', err);
    gallery.innerHTML = `<div class="placeholder"><p>Error loading APOD for ${date}: ${err.message}</p></div>`;
  } finally {
    if (getImageBtn) getImageBtn.disabled = false;
  }
}

// Lightbox + accessibility: focus trap + restore focus
let previousActiveElement = null;
let lightboxKeydownHandler = null;

function openLightbox(item) {
  if (!lightbox) return;
  previousActiveElement = document.activeElement;
  lightbox.setAttribute('aria-hidden', 'false');
  setStatus(`Opening preview: ${item.title || ''}`);
  lightboxMedia.innerHTML = `<div class="placeholder"><p>Loading preview…</p></div>`;
  lightboxMeta.textContent = '';

  (async () => {
    try {
      if (item.nasa_id) {
        const assetUrl = `https://images-api.nasa.gov/asset/${encodeURIComponent(item.nasa_id)}`;
        const resp = await fetch(assetUrl);
        if (resp.ok) {
          const data = await resp.json();
          const assetItems = (data.collection && data.collection.items) || [];
          const video = assetItems.find(a => a.href && a.href.match(/\.mp4$/i));
          if (video) {
            lightboxMedia.innerHTML = `<video controls src="${video.href}"></video>`;
          } else {
            const jpg = assetItems.reverse().find(a => a.href && a.href.match(/\.jpe?g$/i));
            if (jpg) lightboxMedia.innerHTML = `<img src="${jpg.href}" alt="${item.title || ''}"/>`;
            else lightboxMedia.innerHTML = `<img src="${item.href}" alt="${item.title || ''}"/>`;
          }
        } else {
          lightboxMedia.innerHTML = `<img src="${item.href}" alt="${item.title || ''}"/>`;
        }
      } else {
        lightboxMedia.innerHTML = `<img src="${item.href}" alt="${item.title || ''}"/>`;
      }
    } catch (err) {
      console.error('Lightbox asset error', err);
      lightboxMedia.innerHTML = `<img src="${item.href}" alt="${item.title || ''}"/>`;
    }

    // metadata
    let metaHTML = '';
    if (item.title) metaHTML += `<h3>${item.title}</h3>`;
    const smallParts = [];
    if (item.date_created) smallParts.push(`Date: ${item.date_created}`);
    if (item.photographer) smallParts.push(`By: ${item.photographer}`);
    if (item.center) smallParts.push(`Center: ${item.center}`);
    if (smallParts.length) metaHTML += `<div>${smallParts.join(' • ')}</div>`;
    if (item.description) metaHTML += `<p class="lightbox-desc">${item.description}</p>`;
    if (item.nasa_id) metaHTML += `<p><a href="https://images.nasa.gov/details/${encodeURIComponent(item.nasa_id)}" target="_blank" rel="noopener">View on NASA Images</a></p>`;
    lightboxMeta.innerHTML = metaHTML;

    // OMDb best-effort enrichment
    if (OMDB_API_KEY && item.title && (item.media_type === 'video' || (item.content_url && item.content_url.includes('youtube')) || (item.href && item.href.includes('youtube')))) {
      try {
        const omdbUrl = `https://www.omdbapi.com/?apikey=${encodeURIComponent(OMDB_API_KEY)}&t=${encodeURIComponent(item.title)}`;
        const ombResp = await fetch(omdbUrl);
        if (ombResp.ok) {
          const ombData = await ombResp.json();
          if (ombData && ombData.Response === 'True') {
            let omdbHtml = '<div class="omdb-info">';
            if (ombData.Poster && ombData.Poster !== 'N/A') omdbHtml += `<img src="${ombData.Poster}" alt="${ombData.Title} poster" style="max-width:120px;float:left;margin-right:8px;"/>`;
            omdbHtml += `<div style="overflow:hidden;"><strong>${ombData.Title}</strong> (${ombData.Year})<br/>${ombData.Genre || ''}<br/>Rated: ${ombData.Rated || 'N/A'}`;
            if (ombData.imdbID) omdbHtml += `<br/><a href="https://www.imdb.com/title/${ombData.imdbID}" target="_blank" rel="noopener">View on IMDb</a>`;
            omdbHtml += `</div><div style="clear:both"></div></div>`;
            lightboxMeta.innerHTML += omdbHtml;
            setStatus('Loaded movie info from OMDb.');
          }
        }
      } catch (e) { console.warn('OMDb fetch failed', e); }
    }

    // focus management: focus close button and trap focus
    if (lightboxClose) lightboxClose.focus();
    trapLightboxFocus();
  })();
}

function trapLightboxFocus() {
  if (!lightbox) return;
  const focusable = lightbox.querySelectorAll('a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
  const focusables = Array.prototype.slice.call(focusable).filter(el => !el.hasAttribute('disabled'));
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  lightboxKeydownHandler = (e) => {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    } else if (e.key === 'Escape' || e.key === 'Esc') {
      closeLightbox();
    }
  };
  document.addEventListener('keydown', lightboxKeydownHandler);
}

function releaseLightboxFocus() {
  if (lightboxKeydownHandler) { document.removeEventListener('keydown', lightboxKeydownHandler); lightboxKeydownHandler = null; }
}

function closeLightbox() {
  if (!lightbox) return;
  lightbox.setAttribute('aria-hidden', 'true');
  lightboxMedia.innerHTML = '';
  lightboxMeta.textContent = '';
  releaseLightboxFocus();
  if (previousActiveElement && previousActiveElement.focus) previousActiveElement.focus();
  previousActiveElement = null;
  setStatus('Closed preview.');
}

function renderImages(images) {
  gallery.innerHTML = '';
  images.forEach(img => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    const imageEl = document.createElement('img');
    imageEl.src = img.href;
    imageEl.alt = img.title || 'NASA Image';
    const caption = document.createElement('p'); caption.textContent = img.title || '';
    const meta = document.createElement('div'); meta.className = 'meta';
    const metaParts = [];
    if (img.date_created) metaParts.push(`Date: ${img.date_created}`);
    if (img.photographer) metaParts.push(`By: ${img.photographer}`);
    if (img.center) metaParts.push(`Center: ${img.center}`);
    meta.textContent = metaParts.join(' • ');
    item.appendChild(imageEl); item.appendChild(caption); if (meta.textContent) item.appendChild(meta);
    gallery.appendChild(item);
    item.addEventListener('click', () => openLightbox(img));
  });
}

const FUN_FACTS = [
  'A day on Venus is longer than a year on Venus.',
  'One million Earths could fit inside the Sun.',
  'There are more trees on Earth than stars in the Milky Way.',
  'Jupiter’s magnetic field is 20,000 times stronger than Earth’s.',
  'Neutron stars can spin 600 times per second.'
];
function showFunFact() { if (!funFactEl) return; const f = FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)]; funFactEl.textContent = `Fun space fact: ${f}`; }

// DOM-ready wiring
document.addEventListener('DOMContentLoaded', () => {
  // resolve DOM refs
  statusEl = document.getElementById('status');
  lightbox = document.getElementById('lightbox');
  lightboxBackdrop = document.getElementById('lightboxBackdrop');
  lightboxClose = document.getElementById('lightboxClose');
  lightboxMedia = document.getElementById('lightboxMedia');
  lightboxMeta = document.getElementById('lightboxMeta');
  funFactEl = document.getElementById('funFact');
  clearCacheBtn = document.getElementById('clearCacheBtn');

  showOrbitPlaceholder();

  if (getImageBtn) getImageBtn.addEventListener('click', (e) => { e.preventDefault(); fetchSpaceImages(); });
  if (queryInput) queryInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fetchSpaceImages(); } });
  if (clearCacheBtn) clearCacheBtn.addEventListener('click', (e) => { e.preventDefault(); const keys = Object.keys(localStorage); let removed = 0; for (const k of keys) { if (k && k.startsWith('nasa_cache_')) { localStorage.removeItem(k); removed++; } } setStatus(`Cleared ${removed} cached result(s).`); showOrbitPlaceholder(); });

  // load keys from localStorage (generator writes config.js, but localStorage may have been used previously)
  try { const nas = localStorage.getItem('api_key_nasa'); const omb = localStorage.getItem('api_key_omdb'); if (nas) APOD_API_KEY = nas; if (omb) OMDB_API_KEY = omb; } catch (e) { console.warn('Failed to load API keys', e); }
  // load config.js provided keys (if present)
  try { if (window && window.NASA_CONFIG) { if (window.NASA_CONFIG.APOD_API_KEY) APOD_API_KEY = window.NASA_CONFIG.APOD_API_KEY; if (window.NASA_CONFIG.OMDB_API_KEY) OMDB_API_KEY = window.NASA_CONFIG.OMDB_API_KEY; setStatus('Loaded API keys from local config.'); } } catch (e) {}

  // lightbox wiring
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);

  // debug panel toggled by Ctrl/Cmd+D
  const dbg = document.createElement('div'); dbg.id = 'debugPanel'; dbg.style.cssText = 'position:fixed;right:12px;bottom:12px;background:rgba(0,0,0,0.8);color:#fff;padding:8px 10px;border-radius:6px;font-size:12px;z-index:2000;max-width:260px;display:none;'; dbg.innerHTML = '<strong>Debug</strong><div id="dbgContent" style="margin-top:6px"></div>'; document.body.appendChild(dbg);
  function updateDbg() { const c = document.getElementById('dbgContent'); if (!c) return; c.innerHTML = `<div>getImageBtn: ${!!getImageBtn}</div><div>clearCacheBtn: ${!!clearCacheBtn}</div><div>gallery: ${!!gallery}</div><div>lightbox: ${!!lightbox}</div><div>APOD key: ${APOD_API_KEY ? 'set' : 'unset'}</div><div>OMDb key: ${OMDB_API_KEY ? 'set' : 'unset'}</div>`; }
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); if (dbg.style.display === 'none') { updateDbg(); dbg.style.display = 'block'; } else dbg.style.display = 'none'; } });

  // show fun fact now
  showFunFact();
});

// global error reporting
window.addEventListener('error', (ev) => { try { if (document && document.getElementById('status')) document.getElementById('status').textContent = `JS error: ${ev.message}`; } catch (e) {} console.error('Global error', ev.error || ev.message || ev); });
window.addEventListener('unhandledrejection', (ev) => { try { if (document && document.getElementById('status')) document.getElementById('status').textContent = `Unhandled promise rejection: ${ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason)}`; } catch (e) {} console.error('Unhandled rejection', ev); });
