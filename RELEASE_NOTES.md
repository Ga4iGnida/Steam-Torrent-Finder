# Release Notes — Steam Torrent Finder

## v1.0.0 — Initial public release (2026-09-13)

First public release of Steam Torrent Finder: a Manifest V3 Chromium extension that adds a "Search torrents" button to Steam game pages and streams results from multiple sources into a side panel — without leaving the Steam store.

### Overview

- Extension version: **1.0.0** (`manifest.json`)
- Platform: Chromium-based desktop browsers with Manifest V3 (developed and tested on Google Chrome)
- Interface languages: **English / Русский**
- No build step, no dependencies, no telemetry

### Major features

- **Search button on Steam game pages** (`store.steampowered.com/app/*`) injected next to the game title.
- **Slide-in results panel** with streamed, incremental rendering: each source reports independently as soon as it answers.
- **Five built-in sources:**
  - PirateBay — multiple HTML mirrors with failover, plus a JSON API fallback; category-aware ranking; full `magnet:` links built from info-hash.
  - 1337x — Games category search with fallback to the general search; magnets fetched from result pages.
  - Rutracker — session-aware (uses your login cookies if present); graceful fallback to a plain search link when not logged in; disabled by default.
  - FreeTP / Online-Fix — online-fix release pages (game + network patch); the action opens the release page.
- **Custom trackers** — add any search page as a `{q}` URL template; parser resolves relative links, filters to same-origin, optionally fetches magnets from top release pages.
- **Folders and tabs** — create, reorder and delete folders; drag trackers between folders; enable/disable individual sources.
- **Relevance pipeline** — title normalization, smart tokenization, relevance scoring, junk filtering (video/music/books categories), version grouping per release.
- **Result rows** — title, seeds/leeches, size, date, action (magnet or open page), with color-coded seed counts.
- **Full RU/EN localization** of both the popup and the in-page panel.

### UI improvements

- Steam-flat dark styling consistent with store.steampowered.com.
- Accordion grouping of multiple versions of the same release (top 15 shown per group, with a "more versions" hint).
- Per-source status reporting: searching / results count / failed / empty, including retry attempt numbers.
- Persistent error states with actionable hints (timeout, stalled search, lost connection, nothing found).
- SPA-aware button lifecycle: survives Steam's client-side navigation and DOM redraws.

### Custom tracker support

- `{q}` search template with URL-encoding and hostname-aware normalization for well-known sites.
- **Test button**: performs a single isolated request (no retries, no cookies) and shows up to 3 extracted titles or a concrete error before saving.
- Options: Windows-1251 decoding for legacy Russian sites; "grab magnet" to fetch magnet links from top result pages.
- Defensive parser contract: recognizes "honestly empty" responses vs. unknown markup.

### Security hardening

- Strict magnet validation (40-hex / 64-hex / 32-char base32 info-hash, no quotes, angle brackets, whitespace or control tricks).
- URL validation: `http(s)` only for detail links; `javascript:`, `data:`, `file:` and protocol-relative tricks rejected.
- HTML escaping of all third-party strings before DOM insertion (including attribute contexts).
- Credentials whitelist: cookies are attached only to `rutracker.org`, `freetp.org`, `online-fix.me` (exact hostname match); everything else uses `credentials: 'omit'`. Custom trackers never receive cookies.
- Same-origin filtering of links scraped from custom tracker pages (resolved via `new URL`, compared by `.origin`).
- All findings from the independent audit were addressed; security invariants are locked by unit tests.

### Reliability improvements

- Parser contract with three states: results / honestly empty (no retries) / unknown markup (retry up to 3 attempts with pauses).
- Per-request timeouts (10 s), stall detection (12 s), activity-based idle watchdog (40 s) and a hard total cap (120 s) that cannot be exceeded.
- PirateBay mirror failover with "last known good" mirror caching and aborting of losing mirrors after a hit.
- Windows-1251 decoding for legacy sources; de-duplication of enriched fields; bounded page-enrichment (top-5/top-10) to keep request volume sane.
- Epoch guards against stale async results after starting a new search or closing the panel.

### Testing

- `node tests/run.js` — **43 passed, 0 failed** (no dependencies, plain Node.js).
- Coverage includes: magnet/URL validation, XSS fixtures for scraped attributes, custom parser (relative links, same-origin bypass attempts, inline magnets), credentials whitelist, parser state contract, size parsing, ranking regressions, RU localization escaping.
- 23 red-team vectors exercised during development, all blocked.

### Known limitations

- Third-party markup can change at any time — parsers may need updates when sources are redesigned.
- Sources can be geo-blocked, rate-limited or down; a VPN may be required in some regions.
- Rutracker returns full results only when logged in in the same browser.
- Custom trackers work only with server-rendered search pages (no JavaScript rendering, no POST forms, no CAPTCHA walls).
- The extension is not a download manager and not an anonymity tool: it opens magnet links / release pages; requests come directly from the user's browser.
- Maximum search duration is capped at ~2 minutes; slow sources are reported as failed while others still deliver.

---

## Links

- Repository: [https://github.com/Ga4iGnida/Steam-Torrent-Finder](https://github.com/Ga4iGnida/Steam-Torrent-Finder)
- Bug reports: [https://github.com/Ga4iGnida/Steam-Torrent-Finder/issues](https://github.com/Ga4iGnida/Steam-Torrent-Finder/issues)
- Support the project (optional): [https://boosty.to/ga4ignida](https://boosty.to/ga4ignida)
