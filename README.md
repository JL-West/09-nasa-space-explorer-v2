# Project: NASA Space Explorer App (JSON Edition)

NASA publishes an [**Astronomy Picture of the Day (APOD)**](https://apod.nasa.gov/apod/archivepixFull.html)—images and videos with short explanations about our universe.

In this project, you’ll build a gallery that fetches APOD-style entries from a **provided JSON feed** (same field names as the real APOD API). Render a grid of items and a modal with details.

---

## Data Source (CDN)

Use this URL in your `fetch` request:

```js
https://cdn.jsdelivr.net/gh/GCA-Classroom/apod/data.json
```

- The file returns an **array** of APOD-like objects.  
- Keys mirror NASA’s APOD API: `date`, `title`, `explanation`, `media_type`, `url`, `hdurl` (images only), optional `thumbnail_url` (videos), and `service_version`.

### Example object (image)

```json
{
  "date": "2025-10-01",
  "title": "NGC 6960: The Witch's Broom Nebula",
  "explanation": "…",
  "media_type": "image",
  "url": "https://apod.nasa.gov/apod/image/2510/WitchBroom_Meyers_1080.jpg",
  "hdurl": "https://apod.nasa.gov/apod/image/2510/WitchBroom_Meyers_6043.jpg",
  "service_version": "v1",
  "copyright": "Brian Meyers"
}
```

### Example object (with video)
Not all APOD entries are images. Some are YouTube videos. Detect video entries and handle them appropriately by either embedding the video, displaying the thumbnail image, or providing a clear, clickable link to the video. 

The goal is to ensure users can easily access or clearly view content regardless of its media type.

```json
{
  "date": "2024-06-30",
  "title": "Earthrise: A Video Reconstruction",
  "explanation": "…",
  "media_type": "video",
  "url": "https://www.youtube.com/embed/1R5QqhPq1Ik",
  "thumbnail_url": "https://img.youtube.com/vi/1R5QqhPq1Ik/hqdefault.jpg",
  "service_version": "v1"
}
```

### Your Task
* **Fetch the JSON:** Request the CDN URL above and parse the returned array.
* **Display the Gallery:** For each item, show the image (or video thumbnail/player), title, and date.


## Local run & cache behavior

To run the site locally you can use a simple static server (Python 3 example):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

The app caches search results in `localStorage` using keys prefixed with `nasa_cache_` and a TTL of 6 hours. Use the "Clear Cache" button in the UI to remove cached search results immediately.

## APOD (date lookup)

When you pick an exact date the app uses NASA's APOD (Astronomy Picture of the Day) API to fetch the item published on that date. The app currently uses the public `DEMO_KEY` for the APOD API — this key is rate-limited. For reliable or high-volume use, request your own API key from https://api.nasa.gov and replace the `DEMO_KEY` string in `js/script.js` with your key.

APOD results are cached separately with keys of the form `nasa_cache_apod_YYYY-MM-DD`.

## Local config file (recommended)

If you don't want API keys visible on the page UI, create a local `config.js` next to the site files.
A sample file is included as `config.sample.js` — copy it and fill your keys:

```bash
cp config.sample.js config.js
# edit config.js and place your keys
```

`config.js` should set `window.NASA_CONFIG` with `APOD_API_KEY` and `OMDB_API_KEY`. The project already includes `config.js` in `.gitignore` so it won't be committed.

The app will load `config.js` (if present) before the main script and use those keys automatically. You can still edit keys at runtime via the settings UI if desired.

### Helper script to create `config.js`

If you prefer not to edit files by hand, a small helper script is provided to generate `config.js` from environment variables or by prompting you for input.

From the project root run:

```bash
# interactive prompts
./scripts/generate-config.sh

# or provide keys via environment variables (non-interactive)
NASA_API_KEY=your_nasa_key OMDB_API_KEY=your_omdb_key ./scripts/generate-config.sh
```

The script writes `config.js` and the file is ignored by git. Use this on your local machine only — never commit secrets.

### Start server with local `config.js`

If you have a local `config.js` (recommended for development and kept out of version control), use the helper to start the APOD proxy which reads the keys from your local config:

```bash
# make the helper executable once
chmod +x ./scripts/start-with-config.sh

# start the server (background). The script reads keys from ./config.js
./scripts/start-with-config.sh
```

The script prints a short masked notice and writes logs to `/tmp/apod-server.log`.

### Alternative: generate a `config.js` interactively

If you prefer an interactive helper to create `config.js`, run:

```bash
chmod +x ./scripts/generate-config.sh
./scripts/generate-config.sh
```

This prompts for keys (or uses environment variables if provided) and writes a private `config.js`.

### Environment-only start (no `config.js`)

If you prefer to keep keys strictly in environment variables, use the env-only starter:

```bash
export NASA_API_KEY="your_nasa_key"
export OMDB_API_KEY="your_omdb_key" # optional
chmod +x ./scripts/start-env.sh
./scripts/start-env.sh
```

This starts the server using the environment-provided keys and does not read `config.js`.



