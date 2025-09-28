# Changelog

All notable changes to this project will be documented in this file.
This project follows a simple chronological log (newest at top) until formal versioning is introduced.

## [Unreleased]
- (Planned) Further accessibility refinements (skip links, reduced-motion setting)
- (Planned) Public versioned tagging of releases
- (Planned) Optional metadata-only sharing links

---
## 2025-09-28
### Added
- Gemini AI assistant (chat drawer in `reader.html`) with model selector (`gemini-2.5-flash` / `gemini-2.5-pro`).
- Context-aware chat: current page/spread + rolling summary + text selection + PDF page extraction.
- `geminiClient.js` abstraction (REST, fallback logic, key management integration).
- PDF per-page text extraction (lazy) feeding reader summaries.
- Rolling document summary system (updated every 5 pages).
- Enhanced reader context pipeline (selection + summary + page view, tail truncated).

### Changed
- Service Worker bumped to v7: added reader & gemini client to precache, bypass caching for Gemini API, refined cache naming.
- README overhauled to document AI assistant, context strategy, SW update instructions.

### Fixed
- Sidebar page indicator not updating after dynamic pagination (added sync after page generation).
- Potential stale fetch of new reader/chat scripts (precache + version bump ensures fresh delivery).

### Security / Privacy
- Gemini responses not cached; API key stored only in localStorage, never sent to SW caches.

### Developer Notes
- Future: consider embeddings for semantic retrieval & streaming responses.

---
## 2025-09-27
### Added
- Dedicated `Features` page summarizing unified vision (online discovery + offline personal library) and roadmap.
- Storage usage UI: progress bar with live ARIA announcements + dynamic browser quota estimation (replaces fixed 50MB/10MB demo guards).
- Book-style paginated reader for text / JSON files with page navigation, keyboard (Arrow/Home/End) control, slider jump, mode toggle (paginated <-> scroll), and per-file page progress persistence.
 - Dedicated `reader.html` page with advanced reader toolbar (theme, font size, paginated / scroll / two-column spread modes) and PDF page navigation (pdf.js with canvas render + fallback embed).
 - A4-formatted reading layout (sheet centering, theme-aware) for text and PDF content with adaptive scaling.
 - Reader zoom control (Fit Page, 100–175%) with dynamic reflow + resize handling.
- Keyboard shortcuts: `/` focuses search, `Enter` triggers search, `Esc` closes modal.
- Accessible modal: role=dialog, aria-modal, labelled heading/description, focus trap, Esc to close, focus return.
- Color contrast improvements for tag badges & filter chips + focus visibility.

### Changed
- Navigation updated to include Features page.
- Breadcrumb enhanced with aria-label and current page semantics.
- Removed artificial per-file (10MB) and soft total (50MB) limits. Uploads now rely on native browser quota; large files permitted until quota is actually reached. User is alerted if a write fails due to quota exhaustion.

### Fixed
- Focus management issues in preview modal (now trapped and accessible).

---
## 2025-09-26
### Added
- Password hashing (SHA-256) for new/updated credentials with legacy plaintext upgrade path.
- Dynamic header & footer partials (`header.html`, `footer.html`) loaded via `layout.js`.
- Breadcrumb injection system mapping page titles automatically.
- Service worker cache version bump + precache entries for layout assets & partials.

### Changed
- Replaced inline repeated header/footer markup across pages with external partial templates for maintainability.

### Fixed
- Potential header/footer drift by centralizing navigation in partials.

---
## 2025-09-25
### Added
- Export & Import (metadata-only and full with embedded base64 file blobs) for personal library.
- Reading progress persistence for long text/PDF previews (scroll position restore).
- Tag-based filtering UI and multi-tag search highlight logic.
- Debounced advanced search with keyword highlighting in personal library.
- Install prompt handling + footer install button for PWA.

### Changed
- Refined search UX (debounce & highlight) for local library.

### Fixed
- Minor layout inconsistencies during preview modal rendering.

---
## 2025-09-24
### Added
- Offline Personal Library using IndexedDB: multi-file upload, category assignment, tagging support placeholders.
- File preview support (images, audio, text/JSON, PDF embed fallback messaging for others).
- Basic category filtering & list rendering styles.
- PWA scaffold: manifest, icons, initial service worker shell caching.

### Changed
- Standardized page styling and utility classes across category pages.

### Fixed
- Early UI inconsistency issues among content pages.

---
## 2025-09-23
### Added
- Login & registration (client-side demo) with localStorage persistence.
- Session handling & logout capability.
- Initial navigation bar and consistent site structure.

### Fixed
- Search result visibility: ensured Google Books API results render correctly in category/search contexts.

---
## 2025-09-22
### Added
- Google Books API integration for FREE online reading (search, preview links, category exploration).
- Core site structure: homepage, category pages (History, Fiction, Science, Poetry, Self-Help, Children's), contact page.

### Fixed
- Removed formatting artifacts and placeholder symbols (`^n`) from early content drafts.

---
## 2025-09-21
### Added
- Initial project bootstrap: basic HTML pages and styling foundation.

