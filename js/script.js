// Enhanced fetch & display with controls and caching
const getImageBtn = document.getElementById('getImageBtn');
const gallery = document.getElementById('gallery');
const queryInput = document.getElementById('queryInput');
const numSelect = document.getElementById('numSelect');

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
	const query = rawQuery.length ? rawQuery : 'space';
	const count = parseInt(numSelect.value, 10) || 6;

	const cacheKey = `nasa_cache_${query.toLowerCase()}_${count}`;
	const cached = getCache(cacheKey);
	if (cached && Array.isArray(cached) && cached.length) {
		renderImages(cached);
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
			const title = (item.data && item.data[0] && item.data[0].title) || '';
			images.push({ href: link.href, title });
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