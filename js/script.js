// Enhanced fetch & display with controls and caching
const getImageBtn = document.getElementById('getImageBtn');
const gallery = document.getElementById('gallery');
const queryInput = document.getElementById('queryInput');
const numSelect = document.getElementById('numSelect');
const dateSelect = document.getElementById('dateSelect');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function showOrbitPlaceholder() {
	gallery.innerHTML = `
		<div class="placeholder orbit-placeholder">
			<div class="orbit-container" aria-hidden="true">
				<div class="orbit"></div>
				<div class="planet"></div>
				<div class="satellite"></div>
			</div>
			<p class="liftoff-text">Preparing For Liftoff...</p>
		</div>`;
}

function showLoading() {
	gallery.innerHTML = `
		<div class="placeholder">
			<div class="placeholder-icon">🔄</div>
			<p>Loading images…</p>
		</div>`;
}

function renderImages(images) {
	gallery.innerHTML = '';
	images.forEach(img => {
		const item = document.createElement('div');
		item.className = 'gallery-item';

		const imageEl = document.createElement('img');
		imageEl.src = img.href;
		imageEl.alt = img.title || 'NASA Image';

		const caption = document.createElement('p');
		caption.textContent = img.title || '';

		item.appendChild(imageEl);
		item.appendChild(caption);
		gallery.appendChild(item);
	});
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
		const payload = { ts: Date.now(), data };
		localStorage.setItem(key, JSON.stringify(payload));
	} catch (e) {
		console.warn('Failed to set cache', e);
	}
}

async function fetchSpaceImages() {
	const rawQuery = (queryInput.value || '').trim();
	const queryBase = rawQuery.length ? rawQuery : 'space';
	// If a date is selected, include it in the search string to bias results for that date.
	const selectedDate = (dateSelect && dateSelect.value) ? dateSelect.value : '';
	const query = selectedDate ? `${queryBase} ${selectedDate}` : queryBase;
	const count = parseInt(numSelect.value, 10) || 6;

	// include date in cache key to avoid mixing results
	const cacheKey = `nasa_cache_${(queryBase + (selectedDate ? `_${selectedDate}` : '')).toLowerCase()}_${count}`;
	const cached = getCache(cacheKey);
	if (cached && Array.isArray(cached) && cached.length) {
		renderImages(cached);
		return;
	}

	// If a specific APOD date was chosen, use the APOD API to get the exact daily image/video
	if (selectedDate) {
		await fetchAPOD(selectedDate);
		return;
	}

	showLoading();

	const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image`;
		// disable the button while we are fetching to avoid double requests or UI races
		if (getImageBtn) getImageBtn.disabled = true;
		try {
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
				const title = d.title || '';
				const photographer = d.photographer || d.secondary_creator || d.credit || d.copyright || '';
				const description = d.description || d.description_508 || d.explanation || '';
				const imgObj = {
					href: link.href,
					title,
					nasa_id: d.nasa_id,
					date_created: d.date_created,
					photographer,
					center: d.center || '',
					description,
					keywords: d.keywords || []
				};
				images.push(imgObj);
				if (images.length >= count) break;
			}

			if (images.length === 0) {
				gallery.innerHTML = `
					<div class="placeholder">
						<p>No images found for "${query}". Try a different search.</p>
					</div>`;
			} else {
				renderImages(images);
				setCache(cacheKey, images);
			}
			} catch (err) {
			console.error('Fetch error', err);
			gallery.innerHTML = `
				<div class="placeholder">
					<p>Error loading images: ${err.message}</p>
				</div>`;
		} finally {
			if (getImageBtn) getImageBtn.disabled = false;
		}
}

// Fetch the APOD (Astronomy Picture of the Day) for an exact date using NASA's APOD API
async function fetchAPOD(date) {
	const cacheKey = `nasa_cache_apod_${date}`;
	const cached = getCache(cacheKey);
	if (cached) {
		renderImages(cached);
		return;
	}

	showLoading();
	if (getImageBtn) getImageBtn.disabled = true;

	try {
		// Using DEMO_KEY for demo purposes. For production, replace with your own API key.
		const apodUrl = `https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&date=${encodeURIComponent(date)}`;
		const resp = await fetch(apodUrl);
		if (!resp.ok) throw new Error(`APOD API error: ${resp.status}`);
		const data = await resp.json();

		// Build a gallery-friendly object. For videos we try to use a thumbnail for the grid.
		const isVideo = data.media_type === 'video';
		const thumb = data.thumbnail_url || (isVideo ? null : data.hdurl || data.url);
		const hrefForGrid = thumb || (isVideo ? svgVideoPlaceholder() : (data.hdurl || data.url));

		const item = {
			href: hrefForGrid,
			title: data.title || '',
			nasa_id: data.date || '', // APOD doesn't use nasa_id; use date as identifier
			date_created: data.date || '',
			photographer: data.copyright || '',
			center: '',
			description: data.explanation || '',
			media_type: data.media_type || 'image',
			// full content url (image or embed/video link)
			content_url: data.url || data.hdurl || ''
		};

		// render and cache as an array for compatibility with renderImages
		const arr = [item];
		renderImages(arr);
		setCache(cacheKey, arr);
	} catch (err) {
		console.error('APOD fetch error', err);
		gallery.innerHTML = `\n            <div class="placeholder">\n                <p>Error loading APOD for ${date}: ${err.message}</p>\n            </div>`;
	} finally {
		if (getImageBtn) getImageBtn.disabled = false;
	}
}

// Small SVG placeholder for videos when no thumbnail is available
function svgVideoPlaceholder() {
	const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='240'><rect width='100%' height='100%' fill='#111' /><text x='50%' y='50%' fill='#fff' font-size='20' text-anchor='middle' dy='.3em'>VIDEO</text></svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Initialize UI and wire events
showOrbitPlaceholder();

// Prevent default submit behavior and call fetch
getImageBtn.addEventListener('click', (e) => {
	e.preventDefault();
	fetchSpaceImages();
});

// Allow pressing Enter in the search box to trigger a search without reloading
if (queryInput) {
	queryInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			fetchSpaceImages();
		}
	});
}

// Clear cache button
const clearCacheBtn = document.getElementById('clearCacheBtn');
const statusEl = document.getElementById('status');
const lightbox = document.getElementById('lightbox');
const lightboxBackdrop = document.getElementById('lightboxBackdrop');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxMedia = document.getElementById('lightboxMedia');
const lightboxMeta = document.getElementById('lightboxMeta');
const funFactEl = document.getElementById('funFact');

function setStatus(msg) {
	if (statusEl) statusEl.textContent = msg;
}

function clearCache() {
	const keys = Object.keys(localStorage);
	let removed = 0;
	for (const k of keys) {
		if (k && k.startsWith('nasa_cache_')) {
			localStorage.removeItem(k);
			removed++;
		}
	}
	setStatus(`Cleared ${removed} cached result(s).`);
	// show placeholder after clearing
	showOrbitPlaceholder();
}

if (clearCacheBtn) {
	clearCacheBtn.addEventListener('click', (e) => {
		e.preventDefault();
		clearCache();
	});
}

// Lightbox helpers
function openLightbox(item) {
	if (!lightbox) return;
	lightbox.setAttribute('aria-hidden', 'false');
	setStatus(`Opening preview: ${item.title || ''}`);
	// show a quick loading message
	lightboxMedia.innerHTML = `<div class="placeholder"><p>Loading preview…</p></div>`;
	lightboxMeta.textContent = '';

	// If we have a nasa_id, try the asset endpoint to find video or larger files
	(async () => {
		try {
			if (item.nasa_id) {
				const assetUrl = `https://images-api.nasa.gov/asset/${encodeURIComponent(item.nasa_id)}`;
				const resp = await fetch(assetUrl);
				if (resp.ok) {
					const data = await resp.json();
					const assetItems = (data.collection && data.collection.items) || [];
					// look for mp4 video first
					const video = assetItems.find(a => a.href && a.href.match(/\.mp4$/i));
					if (video) {
						lightboxMedia.innerHTML = `<video controls src="${video.href}"></video>`;
					} else {
						// fallback: pick the largest jpg (prefer those without ~thumb or small)
						const jpg = assetItems.reverse().find(a => a.href && a.href.match(/\.jpe?g$/i));
						if (jpg) {
							lightboxMedia.innerHTML = `<img src="${jpg.href}" alt="${item.title || ''}"/>`;
						} else {
							lightboxMedia.innerHTML = `<img src="${item.href}" alt="${item.title || ''}"/>`;
						}
					}
				} else {
					// fallback to provided href
					lightboxMedia.innerHTML = `<img src="${item.href}" alt="${item.title || ''}"/>`;
				}
			} else {
				lightboxMedia.innerHTML = `<img src="${item.href}" alt="${item.title || ''}"/>`;
			}
		} catch (err) {
			console.error('Lightbox asset error', err);
			lightboxMedia.innerHTML = `<img src="${item.href}" alt="${item.title || ''}"/>`;
		}

				// show metadata and description with a link to NASA Images details page when available
				let metaHTML = '';
				if (item.title) metaHTML += `<h3>${item.title}</h3>`;
				const smallParts = [];
				if (item.date_created) smallParts.push(`Date: ${item.date_created}`);
				if (item.photographer) smallParts.push(`By: ${item.photographer}`);
				if (item.center) smallParts.push(`Center: ${item.center}`);
				if (smallParts.length) metaHTML += `<div>${smallParts.join(' • ')}</div>`;
				if (item.description) metaHTML += `<p class="lightbox-desc">${item.description}</p>`;
				if (item.nasa_id) {
					const detailsUrl = `https://images.nasa.gov/details/${encodeURIComponent(item.nasa_id)}`;
					metaHTML += `<p><a href="${detailsUrl}" target="_blank" rel="noopener">View on NASA Images</a></p>`;
				}
				lightboxMeta.innerHTML = metaHTML;
	})();
}

function closeLightbox() {
	if (!lightbox) return;
	lightbox.setAttribute('aria-hidden', 'true');
	lightboxMedia.innerHTML = '';
	lightboxMeta.textContent = '';
	setStatus('Closed preview.');
}

if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);
document.addEventListener('keydown', (e) => {
	if ((e.key === 'Escape' || e.key === 'Esc') && lightbox && lightbox.getAttribute('aria-hidden') === 'false') {
		closeLightbox();
	}
});

// Render images now attaches click handlers for lightbox
const originalRenderImages = renderImages;
function renderImages(images) {
	gallery.innerHTML = '';
	images.forEach(img => {
		const item = document.createElement('div');
		item.className = 'gallery-item';

		const imageEl = document.createElement('img');
		imageEl.src = img.href;
		imageEl.alt = img.title || 'NASA Image';

		const caption = document.createElement('p');
		caption.textContent = img.title || '';

		const meta = document.createElement('div');
		meta.className = 'meta';
		const metaParts = [];
		if (img.date_created) metaParts.push(`Date: ${img.date_created}`);
		if (img.photographer) metaParts.push(`By: ${img.photographer}`);
		if (img.center) metaParts.push(`Center: ${img.center}`);
		meta.textContent = metaParts.join(' • ');

		item.appendChild(imageEl);
		item.appendChild(caption);
		if (meta.textContent) item.appendChild(meta);
		gallery.appendChild(item);

		// open lightbox when clicked
		item.addEventListener('click', () => openLightbox(img));
	});
}

// Fun facts
const FUN_FACTS = [
	'A day on Venus is longer than a year on Venus.',
	'One million Earths could fit inside the Sun.',
	'There are more trees on Earth than stars in the Milky Way.',
	'Jupiter’s magnetic field is 20,000 times stronger than Earth’s.',
	'Neutron stars can spin 600 times per second.'
];
function showFunFact() {
	if (!funFactEl) return;
	const f = FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
	funFactEl.textContent = `Fun space fact: ${f}`;
}
showFunFact();

// Populate the date dropdown with dates from 1995-06-16 (first APOD) up to 2025-10-01 (newest first)
// Note: this will generate a large list (~30 years daily) — if you'd prefer a compact UI
// we can switch to an <input type="date"> with max="2025-10-01" instead.
if (dateSelect) {
	const start = new Date('1995-06-16');
	const end = new Date('2025-10-01');
	for (let d = end; d >= start; d.setDate(d.getDate() - 1)) {
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		const val = `${yyyy}-${mm}-${dd}`;
		const opt = document.createElement('option');
		opt.value = val;
		opt.textContent = val;
		dateSelect.appendChild(opt);
	}
}