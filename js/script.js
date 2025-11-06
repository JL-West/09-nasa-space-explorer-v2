// Fetch & display space images from NASA Images API when the user clicks the button.
// We use the public Images API at images-api.nasa.gov which doesn't require an API key.

const getImageBtn = document.getElementById('getImageBtn');
const gallery = document.getElementById('gallery');

// Fetch images from NASA and render the first 6 results.
async function fetchSpaceImages() {
	const url = 'https://images-api.nasa.gov/search?q=space&media_type=image';
	try {
		// show a small loading placeholder
		gallery.innerHTML = `
			<div class="placeholder">
				<div class="placeholder-icon">🔄</div>
				<p>Loading images…</p>
			</div>`;

		const resp = await fetch(url);
		if (!resp.ok) throw new Error(`Network error: ${resp.status}`);
		const data = await resp.json();

		const items = (data.collection && data.collection.items) || [];
		const images = [];

		// collect up to 6 image links with titles
		for (const item of items) {
			if (!item.links || !item.links.length) continue;
			// pick a link that looks like an image
			const link = item.links.find(l => l.render === 'image') || item.links[0];
			if (!link || !link.href) continue;
			const title = (item.data && item.data[0] && item.data[0].title) || 'NASA Image';
			images.push({ href: link.href, title });
			if (images.length >= 6) break;
		}

		if (images.length === 0) {
			gallery.innerHTML = `
				<div class="placeholder">
					<p>No images found. Try again later.</p>
				</div>`;
			return;
		}

		// render images into the gallery
		gallery.innerHTML = '';
		images.forEach(img => {
			const item = document.createElement('div');
			item.className = 'gallery-item';

			const imageEl = document.createElement('img');
			imageEl.src = img.href;
			imageEl.alt = img.title;

			const caption = document.createElement('p');
			caption.textContent = img.title;

			item.appendChild(imageEl);
			item.appendChild(caption);
			gallery.appendChild(item);
		});
	} catch (err) {
		console.error('Failed to fetch images', err);
		gallery.innerHTML = `
			<div class="placeholder">
				<p>Error loading images: ${err.message}</p>
			</div>`;
	}
}

// Wire up the button
getImageBtn.addEventListener('click', fetchSpaceImages);