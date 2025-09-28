<!-- Updated README reflecting AI Reader + SW v7 -->
# Book Shelf Explorer

Offline‑capable personal library + online discovery + intelligent AI reading assistant.

## 🚀 Highlights
1. Local-first personal library (IndexedDB) with offline access.
2. Google Books discovery (no API key required) + deep link search.
3. Advanced reader (`reader.html`): paginated / spread / scroll / PDF (A4 layout, zoom, theme & font controls).
4. Gemini AI chat (2.5 Flash / Pro) with context: current page + rolling summary + text selection.
5. Service Worker v7: smarter precache, navigation preload, no caching of AI responses.
6. 100% client-only—no backend servers or external state.

---
## ✨ Core Features

### Personal Offline Library
- Multi-file uploads with automatic title suggestion.
- IndexedDB per user (id, title, category, type, size, addedAt, userEmail, blob).
- Inline previews (text, images, audio, PDFs) + fallback downloading.

### Categorization & Filtering
- Client-side filtering + search.
- Tag & summary scaffolding (future expansion).

### Online Reading (Google Books)
- Live search (public volumes endpoint).
- Category + query deep links (`read-online.html?category=Science`, etc.).
- Light caching for revisit speed.

### AI Assistant (Gemini 2.5)
- Models: `gemini-2.5-flash`, `gemini-2.5-pro` (fallback on 404).
- Local API key management (masked display / remove / visibility toggle).
- Rich context: current page/spread, rolling document summary, optional selected text (>25 chars), truncated tail (~10k chars).
- PDF lazy text extraction (per page) inserted into summary.
- Retry loop on transient 5xx.

### Reader UX
- Modes: paginated, scroll, two-column spread, PDF canvas render.
- Zoom (Fit, 100–175%), theme (light/sepia/dark), font size.
- Keyboard: Arrows / Home / End; Esc closes chat or exits prompts.
- Rolling summary updated every 5 pages.

### Offline & PWA
- Service Worker v7: navigation preload, shell & assets caching, image aging & trimming.
- Gemini API responses never cached.
- Offline fallback HTML for navigations.
- Installable (manifest + icons).

---
## 🗂 Key Pages
| Page | Purpose |
|------|---------|
| `index.html` | Landing / discovery hub |
| `pages/my_library.html` | Personal offline library |
| `pages/reader.html` | Advanced reader + AI drawer |
| `pages/read-online.html` | Google Books search & category bridging |
| `pages/login_register.html` | Demo auth |
| `pages/admin.html` | Local users & storage diagnostics |
| Category pages (`history.html`, etc.) | Entry funnels |
| `pages/contact.html` | Contact form demo |

Optional cleanup: legacy debug/test pages if still present (`debug-api.html`, `test-search.html`).

---
## 🧱 Architecture Overview
| Layer | Tech | Notes |
|-------|------|-------|
| Storage | IndexedDB | Binary blobs + metadata |
| Auth | localStorage / sessionStorage | Demo only |
| API | Google Books | Public volumes endpoint |
| AI | Gemini (REST) | `assets/js/geminiClient.js` wrapper |
| Offline | Service Worker v7 | Precache + runtime strategies |
| UI | Vanilla JS | `main.js`, `library.js`, `reader.js`, etc. |

---
## 🔐 Data Model Example
```json
{
	"id": "...",
	"title": "...",
	"category": "...",
	"type": "mime/type",
	"size": 12345,
	"addedAt": 1690000000000,
	"userEmail": "user@example.com",
	"blob": "(binary)"
}
```

---
## � Usage Flow
1. Register / login (demo credentials ok).
2. Upload files in My Library.
3. Click a file → open `reader.html`.
4. (Optional) Paste Gemini API key in Chat drawer → Save.
5. Select text & ask a question or request a summary.
6. Navigate pages; chat adapts to current context.
7. Go offline — library & cached shell remain accessible.

Deep link search examples:
```
read-online.html?category=History
read-online.html?q=artificial+intelligence
read-online.html?category=Poetry&q=love
```

---
## 🔄 Offline & SW v7
Strategy:
- Navigations: network-first (+ preload) → fallback offline page.
- CSS/JS: stale-while-revalidate.
- Images: cache-first + age expiry + trimming.
- Google Books: network-first with TTL & entry cap.
- Gemini API: never cached (always live request).

Force update:
```js
navigator.serviceWorker.getRegistration().then(r=>r.active.postMessage('GET_VERSION'));
// Expect version: 'v7'
```
Clear old caches:
```js
navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHES' });
```

---
## ⚠ Limitations
- All data & API key stored locally (clear site data = reset).
- Demo auth (not production secure).
- Rolling summary heuristic; not semantic embedding.
- Large PDFs extract text only when pages viewed (no global pre-index yet).
- AI context limited (~10k chars tail after assembly).

---
## 🧪 Dev & Testing
Serve locally (needed for SW):
```bash
npx serve .
```
Checks:
- Open DevTools > Application > Service Workers → verify v7.
- Ask AI with/without selection; confirm different answers.
- Switch models Flash ↔ Pro; verify fallback on 404.

---
## 🌱 Roadmap
- Streaming AI responses.
- Embeddings / semantic search over library.
- Per-document persistent summaries & progress charts.
- Background PDF full extraction & indexing.
- Export/import encrypted library bundle.
- Theme auto-sync + user preference panel.

---
## 🤖 Gemini Client (`assets/js/geminiClient.js`)
API:
```js
const client = new GeminiClient(apiKey);
client.ask(question, context, { model: 'gemini-2.5-flash', temperature: 0.7 });
```
Behaviors:
- Normalizes legacy model codes (removes `-latest`).
- Fallback Flash ↔ Pro on 404 only.
- Optional temperature / thinking budget hooks.
- No response caching; caller persists chat history.

---
## 📄 Credits
- Google Books API
- Gemini API
- Pexels media assets
- Built for learning & experimentation

---
Made by Adarsh Pande — evolving into an offline + intelligent reading platform.

© Book Shelf Explorer