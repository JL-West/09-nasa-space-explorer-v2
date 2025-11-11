/*
  Beginner-friendly JS for NASA Space Explorer
  - Uses const/let and template literals
  - Adds comments to explain each part
  - Reads API keys from window.NASA_CONFIG (config.js) or localStorage fallback
  - Uses /apod-proxy for APOD date lookups (server-side proxy)
  - Uses images-api.nasa.gov for free-text searches
  - Caches results in localStorage with TTL
  - Implements an accessible lightbox with focus-trap
  - Adds a fun fact at the top and a small debug overlay (Ctrl/Cmd+D)
*/

(() => {
  // Config / constants
  const CACHE_PREFIX = 'nasa_cache_';
  const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours for cached search results
  const APOD_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours for APOD results
  const IMAGES_API_BASE = 'https://images-api.nasa.gov';
  const APOD_PROXY_PATH = '/apod-proxy'; // server endpoint (server.js)
  const RESOLVE_ASSET_PATH = '/resolve-asset'; // server helper to get best direct url for nasa_id
  const OMDB_BASE = 'https://www.omdbapi.com/';

  // Helpful DOM selectors (will be assigned on DOMContentLoaded)
  let getImageBtn;
  let clearCacheBtn;
  let queryInput;
  let numSelect;
  let dateSelect;
  let gallery;
  let statusEl;
  let lightbox;
  let lightboxBackdrop;
  let lightboxClose;
  let lightboxMedia;
  let lightboxMeta;
  let funFactEl;
  let sourceLabelEl;
  
  // key manager elements
  let apodKeyInput;
  let omdbKeyInput;
  let saveKeysBtn;
  let clearKeysBtn;

  // Lightbox focus tracking
  let lastFocusedBeforeLightbox = null;

  // Read keys from config.js (window.NASA_CONFIG) or localStorage fallback
  function getApiKeys() {
    const cfg = window.NASA_CONFIG || {};
    const apodKey = cfg.APOD_API_KEY || localStorage.getItem('api_key_nasa') || 'DEMO_KEY';
    const omdbKey = cfg.OMDB_API_KEY || localStorage.getItem('api_key_omdb') || '';
    return { apodKey, omdbKey };
  }

  // Return which source is providing the APOD key (non-sensitive)
  function keySourceInfo() {
    const cfg = window.NASA_CONFIG || {};
    const ls = localStorage.getItem('api_key_nasa');
    let source = 'DEMO_KEY';
    if (cfg.APOD_API_KEY) source = 'config.js';
    else if (ls) source = 'localStorage';
    return { source };
  }

  // Update key indicator (no sensitive data shown). This intentionally does not
  // render or expose API key values in the UI. The function is kept so other
  // code can call it, but it will not display secret material.
  function updateKeyIndicator() {
    try {
      // Intentionally do not render the key value. If a non-sensitive label is
      // desired in future, we can expose: `Key source: config.js | localStorage | demo`.
      // For now, keep the UI free of API key text.
      return;
    } catch (e) { /* ignore */ }
  }

  // Save keys from inputs into localStorage
  function saveKeysToLocalStorage() {
    try {
      const a = apodKeyInput && apodKeyInput.value && apodKeyInput.value.trim();
      const o = omdbKeyInput && omdbKeyInput.value && omdbKeyInput.value.trim();
      if (a) localStorage.setItem('api_key_nasa', a);
      if (o) localStorage.setItem('api_key_omdb', o);
      updateKeyIndicator();
      setStatus('API keys saved locally.');
      return true;
    } catch (e) {
      console.warn('Failed to save keys', e);
      setStatus('Failed to save keys.');
      return false;
    }
  }

  function clearLocalKeys() {
    try {
      localStorage.removeItem('api_key_nasa');
      localStorage.removeItem('api_key_omdb');
      if (apodKeyInput) apodKeyInput.value = '';
      if (omdbKeyInput) omdbKeyInput.value = '';
      updateKeyIndicator();
      setStatus('Local API keys removed.');
    } catch (e) {
      console.warn('Failed to clear keys', e);
      setStatus('Failed to clear keys.');
    }
  }

  // Simple status helper (updates aria-live region)
  function setStatus(message) {
    if (!statusEl) return;
    statusEl.textContent = message;
    // also console log for debugging
    console.log('[status]', message);
  }

  // Non-sensitive UI: show which source provided the APOD (apod-api, apod-scrape, apod-wayback, images-api-fallback)
  function setSourceLabel(source) {
    try {
      if (!sourceLabelEl) return;
      if (!source) {
        sourceLabelEl.textContent = '';
        sourceLabelEl.style.display = 'none';
        return;
      }
      sourceLabelEl.textContent = `Source: ${source}`;
      sourceLabelEl.style.display = '';
    } catch (e) {
      // ignore
    }
  }

  // LocalStorage cache helpers
  function cacheKey(key) {
    return `${CACHE_PREFIX}${key}`;
  }
  function saveCache(key, value) {
    const payload = { ts: Date.now(), value };
    try {
      localStorage.setItem(cacheKey(key), JSON.stringify(payload));
    } catch (e) {
      // ignore storage errors
      console.warn('Could not save cache', e);
    }
  }
  function loadCache(key, ttl = CACHE_TTL_MS) {
    try {
      const raw = localStorage.getItem(cacheKey(key));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.ts || !parsed.value) return null;
      if (Date.now() - parsed.ts > ttl) {
        localStorage.removeItem(cacheKey(key));
        return null;
      }
      return parsed.value;
    } catch (e) {
      return null;
    }
  }
  function clearAllCache() {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    });
  }

  // Fun facts (kept short for beginners)
  const FUN_FACTS = [
    'The Hubble Space Telescope was launched in 1990 and revolutionized astronomy.',
    'Saturn is the least dense planet — it would float in water!',
    'The Moon is moving away from Earth about 3.8 cm per year.',
    'A day on Venus is longer than a year on Venus.',
    'Neutron stars can spin hundreds of times per second.',
    'The footprints on the Moon will likely remain for millions of years — there is no wind to erode them.',
    'Voyager 1, launched in 1977, is now in interstellar space.',
    'Sunlight takes about 8 minutes and 20 seconds to reach Earth.',
    'Mars hosts the tallest volcano in the solar system: Olympus Mons.',
    'Jupiter’s Great Red Spot is a storm larger than Earth and has existed for centuries.'
  ];
  function showRandomFunFact() {
    if (!funFactEl) return;
    const idx = Math.floor(Math.random() * FUN_FACTS.length);
    funFactEl.textContent = `Fun space fact: ${FUN_FACTS[idx]}`;
  }

  // Utility: create a DOM node from HTML string
  function nodeFromHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
  }

  // Render a placeholder (for no results)
  function renderPlaceholder(message = 'No images found') {
    if (!gallery) return;
    gallery.innerHTML = `
      <div class="placeholder">
        <p>${message}</p>
      </div>
    `;
  }

  // Render skeleton placeholders while loading
  function renderSkeleton(count = 6) {
    if (!gallery) return;
    const container = document.createElement('div');
    container.className = 'skeleton-grid';
    for (let i = 0; i < count; i++) {
      const card = document.createElement('div');
      card.className = 'skeleton-card';
      card.innerHTML = `
        <div class="skeleton-thumb"></div>
        <div class="skeleton-line long"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line short"></div>
      `;
      container.appendChild(card);
    }
    gallery.innerHTML = '';
    gallery.appendChild(container);
  }

  // Loading overlay show/hide
  function showLoading(on = true, count = 6) {
    try {
      const ov = document.getElementById('loadingOverlay');
      if (!ov) return;
      if (on) {
        ov.classList.add('show');
        ov.setAttribute('aria-hidden', 'false');
        // show skeletons in gallery for parity
        renderSkeleton(count);
      } else {
        ov.classList.remove('show');
        ov.setAttribute('aria-hidden', 'true');
      }
    } catch (e) {
      console.warn('Loading overlay toggle failed', e);
    }
  }

  // Render a friendly astronaut SVG when APOD is unavailable for historic dates
  function renderAstronautPlaceholder(message = 'APOD not available for this date.') {
    if (!gallery) return;
    const svg = `
      <svg width="220" height="220" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g fill="none" fill-rule="evenodd">
          <circle cx="32" cy="32" r="32" fill="#081e3b"/>
          <g transform="translate(12 12)">
            <rect x="12" y="18" width="20" height="12" rx="2" fill="#fff" opacity="0.9"/>
            <circle cx="22" cy="8" r="6" fill="#fff"/>
            <circle cx="22" cy="8" r="4" fill="#081e3b"/>
            <path d="M4 34c2-6 10-8 18-8s16 2 18 8" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
            <path d="M0 8c6 0 8-6 14-6s8 6 14 6" stroke="#6fb3ff" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/>
          </g>
        </g>
      </svg>
    `;
      gallery.innerHTML = `
      <div class="no-apod-placeholder">
        <div class="svg-wrap">${svg}</div>
        <div class="no-apod-msg"><p>${message}</p><p class="hint">Note: APOD availability varies over time; older entries may be missing. We show related NASA images when APOD is unavailable.</p></div>
      </div>
    `;
  }

  // Render gallery items. items: array of objects with fields:
  // { title, url, thumbnail, media_type, date, nasa_id, description, photographer, center, keywords }
  function renderGallery(items) {
    if (!gallery) return;
    if (!items || !items.length) {
      renderPlaceholder('No images found for your query.');
      return;
    }

    // Build gallery HTML
    const container = document.createElement('div');
    container.className = 'gallery-grid';

    items.forEach((item, idx) => {
      const thumb = item.thumbnail || item.url || '';
      const title = item.title || 'Untitled';
      const date = item.date || '';
      const center = item.center || '';
      const photographer = item.photographer || item.credit || item.copyright || '';
      const desc = item.description || item.explanation || '';
      const keywords = (item.keywords || []).slice(0, 5).join(', ');

      const cardHtml = `
        <article class="gallery-item" tabindex="0" data-idx="${idx}" role="button" aria-pressed="false">
          <div class="thumb-wrap">
            <img src="${thumb}" alt="${title.replace(/"/g, '&quot;')}" loading="lazy" />
          </div>
          <div class="caption">
            <h3 class="title">${title}</h3>
            <div class="meta-line">
              ${date ? `<span class="date">${date}</span>` : ''}
              ${photographer ? `<span class="by"> — ${photographer}</span>` : ''}
              ${center ? `<span class="center"> (${center})</span>` : ''}
            </div>
            ${desc ? `<p class="desc">${desc.slice(0, 140)}${desc.length > 140 ? '…' : ''}</p>` : ''}
            ${keywords ? `<div class="keywords">${keywords}</div>` : ''}
          </div>
        </article>
      `;
      const card = nodeFromHtml(cardHtml);

      // Attach metadata on the DOM element for easy retrieval on click
      card._meta = item;

      // Robust image loading: if the src fails (not an actual image URL),
      // try falling back to meta.url, then to the NASA Images asset endpoint
      // (if nasa_id available), then show a small placeholder.
      (function enhanceImageLoading(cardEl, itemMeta) {
        try {
          const img = cardEl.querySelector('img');
          if (!img) return;

          async function handleImgError() {
            try {
              img.removeEventListener('error', handleImgError);
              // Try using the meta.url if different
              const candidate1 = itemMeta.url || '';
              if (candidate1 && candidate1 !== img.src) {
                img.src = candidate1;
                return;
              }

              // If we have a NASA id, ask our server to resolve it to a direct image/video URL
              if (itemMeta.nasa_id) {
                try {
                  const resp = await fetch(`${RESOLVE_ASSET_PATH}?nasa_id=${encodeURIComponent(itemMeta.nasa_id)}`);
                  if (resp.ok) {
                    const j = await resp.json();
                    // Server returns { best: 'url', items: [...], type: 'image'|'video' }
                    if (j && j.best) {
                      img.src = j.best;
                      return;
                    }
                    // If server returned items in the older shape, try to find images
                    if (j && j.items && Array.isArray(j.items)) {
                      const imgs = j.items.filter(i => i.href && /(jpg|jpeg|png|gif)$/i.test(i.href));
                      if (imgs.length) {
                        img.src = imgs[imgs.length - 1].href;
                        return;
                      }
                    }
                  }
                } catch (e) {
                  // ignore and continue to placeholder
                }
              }

              // As Option B (image proxy), try our server image-proxy for the candidate URL(s)
              const candidate2 = itemMeta.thumbnail || itemMeta.url || '';
              if (candidate2) {
                try {
                  // Use server-side image proxy when direct hotlinking or CORS fails.
                  const prox = `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(candidate2)}`;
                  img.src = prox;
                  return;
                } catch (e) {
                  // ignore and continue to placeholder
                }
              }

              // Ultimate fallback: small inline SVG placeholder
              img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260"><rect width="100%" height="100%" fill="%2308122a"/><text x="50%" y="50%" fill="%23fff" font-size="18" text-anchor="middle" dy=".3em">Image unavailable</text></svg>';
            } catch (err) {
              console.warn('Image fallback failed', err);
            }
          }

          // If the initial src is not an obvious image URL, preemptively set an onerror
          img.addEventListener('error', handleImgError);
          // If the src looks like a JSON / non-image (no extension), still try to load
          // and let the error handler attempt recovery.
        } catch (e) {
          // ignore
        }
      })(card, item);

      container.appendChild(card);
    });

    gallery.innerHTML = '';
    gallery.appendChild(container);

    // Attach click and keyboard handlers to open lightbox
    container.querySelectorAll('.gallery-item').forEach(el => {
      el.addEventListener('click', () => openLightbox(el._meta));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openLightbox(el._meta);
        }
      });
    });
  }

  // Lightbox helpers: open / close and render media + metadata
  function openLightbox(meta) {
    if (!lightbox || !lightboxMedia || !lightboxMeta) return;
    lastFocusedBeforeLightbox = document.activeElement;

    // Clear previous
    lightboxMedia.innerHTML = '';
    lightboxMeta.innerHTML = '';

    // Move focus and show
    lightbox.removeAttribute('aria-hidden');
    lightbox.classList.add('open');
    lightboxClose.focus();

    // Render media based on meta
    // APOD proxy responses may already contain media_type and url
    const title = meta.title || 'Preview';
    const date = meta.date || meta.date_created || '';
    const desc = meta.description || meta.explanation || '';
    const photographer = meta.photographer || meta.credit || meta.copyright || '';
    const center = meta.center || '';
    const nasaId = meta.nasa_id || meta.id || '';

    // Helper to render metadata panel
    function renderMetaExtras(extraHtml = '') {
      const metaHtml = `
        <h2 class="lb-title">${title}</h2>
        <div class="lb-line">
          ${date ? `<span>${date}</span>` : ''}
          ${photographer ? `<span> — ${photographer}</span>` : ''}
          ${center ? `<span> (${center})</span>` : ''}
        </div>
        ${desc ? `<p class="lb-desc">${desc}</p>` : ''}
        ${extraHtml}
        <div class="lb-links">
          ${nasaId ? `<a href="https://images.nasa.gov/details/${encodeURIComponent(nasaId)}" target="_blank" rel="noopener">View on NASA Images</a>` : ''}
        </div>
      `;
      lightboxMeta.innerHTML = metaHtml;
    }

    // If APOD/video cases: render differently
    if (meta.media_type === 'video') {
      // Many APOD videos are embeds (YouTube). If meta.url is an embed page, show iframe.
      const videoUrl = meta.url || meta.thumbnail_url || '';
      // Try to show an iframe safely
      const iframe = document.createElement('iframe');
      iframe.setAttribute('src', videoUrl);
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allowfullscreen', '');
      iframe.className = 'lb-video';
      lightboxMedia.appendChild(iframe);

      renderMetaExtras('');
      // Try OMDb lookup if an OMDb key is available and title looks like a movie
      const { omdbKey } = getApiKeys();
      if (omdbKey) {
        // Best-effort movie lookup by title
        fetch(`${OMDB_BASE}?apikey=${encodeURIComponent(omdbKey)}&t=${encodeURIComponent(title)}`)
          .then(r => r.json())
          .then(data => {
            if (data && data.Response === 'True') {
              const extra = `
                <div class="omdb">
                  ${data.Poster && data.Poster !== 'N/A' ? `<img class="omdb-poster" src="${data.Poster}" alt="${data.Title} poster" />` : ''}
                  <div class="omdb-meta">
                    <strong>${data.Title} (${data.Year})</strong>
                    <div>${data.Genre || ''} ${data.imdbRating ? `— IMDb: ${data.imdbRating}` : ''}</div>
                    ${data.imdbID ? `<a href="https://www.imdb.com/title/${data.imdbID}" target="_blank" rel="noopener">View on IMDb</a>` : ''}
                  </div>
                </div>
              `;
              // Append OMDb info to meta
              const omdbContainer = document.createElement('div');
              omdbContainer.innerHTML = extra;
              lightboxMeta.appendChild(omdbContainer);
            }
          })
          .catch(err => {
            console.warn('OMDb lookup failed', err);
          });
      }
    } else if (meta.media_type === 'image' || /\.(jpg|jpeg|png|gif)$/i.test(meta.url || '')) {
      // Try to show a higher-resolution image if nasa_id is present by querying the NASA asset endpoint
      const imgEl = document.createElement('img');
      imgEl.className = 'lb-image';
      if (nasaId) {
        // Try our server resolver to find better resolution or videos for this nasaId
        fetch(`${RESOLVE_ASSET_PATH}?nasa_id=${encodeURIComponent(nasaId)}`)
          .then(r => r.json())
          .then(data => {
            // Server returns { best, items, type }
            if (data && data.best) {
              if (data.type === 'video') {
                const video = document.createElement('video');
                video.controls = true;
                video.src = data.best;
                video.className = 'lb-video';
                lightboxMedia.appendChild(video);
                renderMetaExtras('');
                return;
              }
              imgEl.src = data.best;
              lightboxMedia.appendChild(imgEl);
              renderMetaExtras('');
              return;
            }
            // If the resolver returned an items array, try to find a best image
            if (data && data.items && Array.isArray(data.items)) {
              const mp4 = data.items.find(i => i.href && i.href.endsWith('.mp4'));
              if (mp4) {
                const video = document.createElement('video');
                video.controls = true;
                video.src = mp4.href;
                video.className = 'lb-video';
                lightboxMedia.appendChild(video);
                renderMetaExtras('');
                return;
              }
              const images = data.items.filter(i => i.href && i.href.match(/\.(jpg|jpeg|png|gif)$/i));
              const best = images.length ? images[images.length - 1].href : meta.url;
              imgEl.src = best || meta.url;
              lightboxMedia.appendChild(imgEl);
              renderMetaExtras('');
              return;
            }
            // Fallback: use meta.url
            imgEl.src = meta.url;
            lightboxMedia.appendChild(imgEl);
            renderMetaExtras('');
          })
          .catch(() => {
            // fallback to meta.url
            imgEl.src = meta.url;
            lightboxMedia.appendChild(imgEl);
            renderMetaExtras('');
          });
      } else {
        imgEl.src = meta.url;
        lightboxMedia.appendChild(imgEl);
        renderMetaExtras('');
      }
    } else {
      // Unknown media type: fallback text link
      lightboxMedia.innerHTML = `<p>No preview available. <a href="${meta.url}" target="_blank" rel="noopener">Open source</a></p>`;
      renderMetaExtras('');
    }

    // Setup focus trap inside lightbox
    trapFocus(lightbox);
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.setAttribute('aria-hidden', 'true');
    lightbox.classList.remove('open');
    // restore focus
    if (lastFocusedBeforeLightbox && typeof lastFocusedBeforeLightbox.focus === 'function') {
      lastFocusedBeforeLightbox.focus();
    }
  }

  // Focus trap helper for modal
  function trapFocus(modal) {
    const focusableSelectors = 'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(modal.querySelectorAll(focusableSelectors)).filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    function keyHandler(e) {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      } else if (e.key === 'Escape') {
        closeLightbox();
      }
    }

    modal.addEventListener('keydown', keyHandler, { once: false });
    // Remove the handler on close (simple approach)
    const observer = new MutationObserver(() => {
      if (modal.getAttribute('aria-hidden') === 'true') {
        modal.removeEventListener('keydown', keyHandler);
        observer.disconnect();
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['aria-hidden'] });
  }

  // Fetch APOD via our server proxy (which can call APOD API and fallback to scrapes)
  async function fetchApodForDate(dateStr) {
    const cacheKeyName = `apod_${dateStr}`;
    const cached = loadCache(cacheKeyName, APOD_CACHE_TTL_MS);
    if (cached) return cached;
    setStatus(`Fetching APOD for ${dateStr} via server proxy…`);
    try {
      // Always use the server-side proxy for APOD lookups. This avoids exposing
      // client-side API keys and keeps behavior consistent across environments.
      const resp = await fetch(`${APOD_PROXY_PATH}?date=${encodeURIComponent(dateStr)}`);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => resp.statusText || 'error');
        throw new Error(errText);
      }
      const data = await resp.json();
      saveCache(cacheKeyName, data);
      return data;
    } catch (err) {
      setStatus(`APOD proxy fetch failed: ${err.message}`);
      throw err;
    }
  }

  // Fetch images from NASA images-api for a free-text query
  // Returns an array of simplified items used by renderGallery
  async function fetchImagesForQuery(query, count = 6) {
    const q = (query || 'space').trim();
    const cacheKeyName = `search_${q}_${count}`;
    const cached = loadCache(cacheKeyName);
    if (cached) {
      return cached;
    }

    setStatus(`Searching NASA images for "${q}"…`);
    // images-api supports media_type param; include images & video
    const url = `${IMAGES_API_BASE}/search?q=${encodeURIComponent(q)}&media_type=image,video`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();

      // Parse the API response into our simplified list
      const items = (json.collection && json.collection.items ? json.collection.items : [])
        .filter(i => {
          // skip items without links
          return Array.isArray(i.links) && i.links.length;
        })
        .slice(0, count)
        .map(i => {
          // asset metadata is in i.data[0], link(s) in i.links
          const d = (i.data && i.data[0]) || {};
          const link = (i.links && i.links[0] && i.links[0].href) || '';
          const thumb = (i.links && i.links.find(l => l.rel === 'preview') && i.links.find(l => l.rel === 'preview').href) || link;
          return {
            title: d.title || d.description || '',
            url: link,
            thumbnail: thumb,
            media_type: d.media_type || (link.match(/\.(jpg|png|gif)$/i) ? 'image' : 'video'),
            date: d.date_created || '',
            nasa_id: d.nasa_id || d.identifier || '',
            description: d.description || '',
            photographer: d.photographer || d.center || '',
            center: d.center || '',
            keywords: d.keywords || []
          };
        });

      saveCache(cacheKeyName, items);
      return items;
    } catch (err) {
      setStatus(`Search failed: ${err.message}`);
      console.error(err);
      throw err;
    }
  }

  // Main action: decide APOD vs search and render results
  async function handleFetchClick() {
    console.log('handleFetchClick invoked');
    if (!queryInput || !numSelect || !dateSelect) {
      console.warn('Missing UI elements for fetch');
      return;
    }
    const selectedDateRaw = dateSelect.value;
    // Validate date format YYYY-MM-DD; some browsers may return localized or empty values.
    const selectedDate = selectedDateRaw && (/^\d{4}-\d{2}-\d{2}$/.test(selectedDateRaw) ? selectedDateRaw : '');
    if (selectedDateRaw && !selectedDate) {
      // If the user entered a date but it didn't match expected format, inform them and treat as no date
      setStatus('Invalid date format selected; please use the calendar picker or enter YYYY-MM-DD.');
    }
    const query = queryInput.value;
    const count = parseInt(numSelect.value, 10) || 6;

    // Disable fetch button while working to prevent duplicate clicks
    let buttonDisabledByUs = false;
    try {
      if (getImageBtn && !getImageBtn.disabled) {
        getImageBtn.disabled = true;
        buttonDisabledByUs = true;
        // provide feedback
        getImageBtn.dataset.prevText = getImageBtn.textContent;
          getImageBtn.textContent = 'Loading…';
        }
      // Show loading overlay and skeletons
      try { showLoading(true, count); } catch (e) {}
      if (selectedDate) {
        // APOD path via proxy
        setStatus('Fetching APOD…');
        try {
          const apod = await fetchApodForDate(selectedDate);
          // Normalize APOD response to gallery item shape
          const item = {
            title: apod.title || apod.title,
            url: apod.url || apod.hdurl || '',
            thumbnail: apod.url || apod.thumbnail_url || '',
            media_type: apod.media_type || (apod.url && apod.url.match(/\.(jpg|png|gif)$/i) ? 'image' : 'video'),
            date: apod.date || selectedDate,
            description: apod.explanation || apod.description || '',
            photographer: apod.copyright || '',
            center: apod.site || ''
          };
          // If the proxy returned an images-api fallback, show a small badge and message
          if (apod && apod.source === 'images-api-fallback') {
            setStatus(`APOD not found — showing a related NASA image (best effort).`);
            // indicate source to the user (non-sensitive)
            setSourceLabel(apod.source || 'images-api-fallback');
            renderGallery([item]);
            // Add a small banner above the gallery so users know it's a fallback
            if (statusEl) {
              const b = document.createElement('div');
              b.className = 'fallback-banner';
              b.textContent = 'APOD not available for this date — showing a related NASA image instead.';
              gallery.insertAdjacentElement('beforebegin', b);
            }
          } else {
            renderGallery([item]);
            setStatus(`APOD loaded for ${selectedDate}`);
            // indicate source when APOD loaded
            setSourceLabel(apod.source || 'apod-api');
          }
        } catch (err) {
          // On any APOD fetch failure, attempt a related NASA Images API search as a best-effort fallback
          try {
            setStatus('APOD not found — attempting a related NASA images search...');
            const year = (selectedDate || '').slice(0, 4) || '';
            const fallbackQuery = year ? `${year} apod` : 'space';
            const fallbackItems = await fetchImagesForQuery(fallbackQuery, parseInt(numSelect.value, 10) || 6);
            if (fallbackItems && fallbackItems.length) {
              // show a banner explaining this is a fallback
              renderGallery(fallbackItems);
              if (statusEl) {
                const b = document.createElement('div');
                b.className = 'fallback-banner';
                b.textContent = 'APOD not available for this date — showing related NASA images (best effort).';
                gallery.insertAdjacentElement('beforebegin', b);
              }
              setStatus('Showing related NASA images because APOD could not be retrieved.');
              setSourceLabel('images-api');
            } else {
              // Nothing found — show astronaut placeholder as gentle fallback
              renderAstronautPlaceholder('APOD not available for this date.');
              setStatus('APOD not available and no related images found.');
            }
          } catch (innerErr) {
            // If images search fails, show the astronaut placeholder
            renderAstronautPlaceholder('APOD not available for this date.');
            setStatus('APOD not available. Showing placeholder.');
          }
        }
      } else {
        // Images search path
        setStatus('Searching images…');
        const items = await fetchImagesForQuery(query || 'space', count);
        renderGallery(items);
        setStatus(`Found ${items.length} results for "${query || 'space'}"`);
        setSourceLabel('images-api');
      }
    } catch (err) {
      console.error('handleFetchClick error', err);
      renderPlaceholder('An error occurred while fetching images.');
    } finally {
      if (buttonDisabledByUs && getImageBtn) {
        getImageBtn.disabled = false;
        if (getImageBtn.dataset.prevText) {
          getImageBtn.textContent = getImageBtn.dataset.prevText;
          delete getImageBtn.dataset.prevText;
        }
      }
      // hide loading overlay in all cases
      try { showLoading(false); } catch (e) {}
    }
  }

  // Clear cache button handler
  function handleClearCache() {
    clearAllCache();
    renderPlaceholder('Cache cleared. Try fetching again.');
    setStatus('Cache cleared.');
  }

  // Debug overlay: simple panel toggled by Ctrl/Cmd+D
  function createDebugOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'debugOverlay';
    overlay.style.position = 'fixed';
    overlay.style.right = '12px';
    overlay.style.bottom = '12px';
    overlay.style.background = 'rgba(0,0,0,0.75)';
    overlay.style.color = '#fff';
    overlay.style.padding = '10px';
    overlay.style.fontSize = '12px';
    overlay.style.borderRadius = '6px';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'none';
    overlay.style.maxWidth = '320px';
    overlay.innerHTML = `<strong>Debug</strong><div id="dbgContent">loading…</div>`;
    document.body.appendChild(overlay);

    function update() {
      const keys = getApiKeys();
      const elems = [
        { id: 'getImageBtn', ok: !!getImageBtn },
        { id: 'gallery', ok: !!gallery },
        { id: 'lightbox', ok: !!lightbox },
        { id: 'funFact', ok: !!funFactEl }
      ];
      const parts = elems.map(e => `<div>${e.id}: ${e.ok ? 'OK' : 'MISSING'}</div>`).join('');
      const keyParts = `<div>APOD key: ${keys.apodKey ? (keys.apodKey === 'DEMO_KEY' ? 'DEMO_KEY' : 'SET') : 'NONE'}</div>
                        <div>OMDb key: ${keys.omdbKey ? 'SET' : 'NONE'}</div>`;
      document.getElementById('dbgContent').innerHTML = `${parts}${keyParts}`;
    }

    // Toggle on Ctrl/Cmd + D
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
        update();
      }
    });

    return { update };
  }

  // Initialize everything after DOM is ready. Use an init() function and run it immediately
  // if the document is already parsed (handles scripts inserted at different phases).
  function init() {
    console.log('Initializing NASA Space Explorer UI');
    // assign DOM refs
    getImageBtn = document.getElementById('getImageBtn');
    clearCacheBtn = document.getElementById('clearCacheBtn');
    queryInput = document.getElementById('queryInput');
    numSelect = document.getElementById('numSelect');
    dateSelect = document.getElementById('dateSelect');
    gallery = document.getElementById('gallery');
    statusEl = document.getElementById('status');
    lightbox = document.getElementById('lightbox');
    lightboxBackdrop = document.getElementById('lightboxBackdrop');
    lightboxClose = document.getElementById('lightboxClose');
    lightboxMedia = document.getElementById('lightboxMedia');
    lightboxMeta = document.getElementById('lightboxMeta');
    funFactEl = document.getElementById('funFact');
  sourceLabelEl = document.getElementById('sourceLabel');
    // key manager elements
    apodKeyInput = document.getElementById('apodKeyInput');
    omdbKeyInput = document.getElementById('omdbKeyInput');
    saveKeysBtn = document.getElementById('saveKeysBtn');
    clearKeysBtn = document.getElementById('clearKeysBtn');

    // Defensive checks
    if (!gallery) {
      console.error('Gallery element missing; aborting initialization.');
      return;
    }

    // Show a random fun fact at top (ensure it's visible)
    try {
      if (funFactEl) funFactEl.style.display = '';
      showRandomFunFact();
    } catch (e) {
      console.warn('Could not show fun fact', e);
    }

    // Note: we intentionally do NOT render API keys or masked key indicators in
    // the visible UI to avoid exposing secrets. Key management remains available
    // via the key manager inputs (saved to localStorage) and the debug overlay
    // which indicates whether keys are set (not their values).

    // Wire key manager buttons (if present)
    if (saveKeysBtn) saveKeysBtn.addEventListener('click', () => {
      const ok = saveKeysToLocalStorage();
      if (ok) updateKeyIndicator();
    });
    if (clearKeysBtn) clearKeysBtn.addEventListener('click', clearLocalKeys);

    // Event wiring
    if (getImageBtn) {
      // Attach both addEventListener and an onclick fallback to be robust
      getImageBtn.addEventListener('click', handleFetchClick);
      getImageBtn.onclick = handleFetchClick;
    }
    if (clearCacheBtn) clearCacheBtn.addEventListener('click', handleClearCache);

    // Allow Enter to trigger fetch from query input
    if (queryInput) {
      queryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleFetchClick();
        }
      });
    }

    

    // Lightbox handlers
    if (lightboxBackdrop) {
      lightboxBackdrop.addEventListener('click', closeLightbox);
    }
    if (lightboxClose) {
      lightboxClose.addEventListener('click', closeLightbox);
    }

    // Global Escape to close lightbox
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const isOpen = lightbox && lightbox.getAttribute('aria-hidden') !== 'true';
        if (isOpen) closeLightbox();
      }
    });

    // Create Debug overlay (Ctrl/Cmd+D)
    const dbg = createDebugOverlay();

    // Expose a small API for debugging in console if needed
    window.__nasaDebug = {
      clearCache: clearAllCache,
      showFunFact: showRandomFunFact,
      updateDebug: dbg.update
    };

    setStatus('Ready');
    // Clear source label initially
    try { setSourceLabel(''); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Document already parsed — initialize immediately
    init();
  }

  // Global error reporting: show in #status if available
  window.addEventListener('error', (e) => {
    try { if (statusEl) statusEl.textContent = `Error: ${e.message || e}`; } catch (err) {}
    console.error('Unhandled error', e);
  });
  window.addEventListener('unhandledrejection', (e) => {
    try { if (statusEl) statusEl.textContent = `Error: ${e.reason || e}`; } catch (err) {}
    console.error('Unhandled rejection', e);
  });

})();


    console.error('Unhandled rejection', e);
  });

})();


