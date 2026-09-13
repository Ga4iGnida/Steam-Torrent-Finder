# Reddit — Final Post Package

> **Status: DRAFT — not published yet.**
> This is the final, ready-to-publish version. Before submitting to any subreddit, check its status in [REDDIT_CHECKLIST.md](REDDIT_CHECKLIST.md) and re-read the community's current rules (rules change). If the checklist says MEGATHREAD ONLY or MOD APPROVAL REQUIRED — follow that; if it says NOT ALLOWED — do not post there.
>
> Canonical repository link to use everywhere: **https://github.com/Ga4iGnida/Steam-Torrent-Finder**
> Optional support link (final line only): https://boosty.to/ga4ignida

---

## Title

Pick one depending on the community tone:

| Community | Title |
| --------- | ----- |
| Developer / extensions / open source | `I built an open-source Chromium extension that adds a torrent search panel to Steam game pages` |
| Gaming / general | `I made a free extension that searches game releases right from the Steam page` |

---

## What I built

Steam Torrent Finder — a small, free, open-source Chromium extension (Manifest V3) that adds a **"Search torrents"** button to Steam game pages. One click opens a side panel that queries multiple sources in parallel and streams results in as they respond — you never leave the Steam page.

- Repo: https://github.com/Ga4iGnida/Steam-Torrent-Finder
- Version: 1.0.0 · 43 unit tests passing · no build step · no telemetry

## Why I built it

Every time I wanted to check if there's a release for a game I was looking at, I did the same dance: copy the game name, open a tracker, paste, check, copy again, open the next tracker, paste… The Steam page already knows which game I'm looking at — the search should start there. So I built the button I wanted: one click, results from everywhere, without tab-hopping.

## How it works

- A content script injects the button on `store.steampowered.com/app/*` pages and renders the results panel.
- The background service worker (MV3) queries enabled sources in parallel and streams results back over a long-lived port — each source reports independently, so a slow site doesn't hold up the rest.
- Parsers extract results, validate them (magnet format, allowed URL protocols, escaping) and score them against the game title to filter noise.
- Results are grouped by source and by release version, with seeds/leeches, size and date.

## Main features

- 5 built-in sources: **PirateBay** (mirror failover + JSON API fallback), **1337x** (Games category first), **Rutracker** (session-aware), **FreeTP** and **Online-Fix** (online-fix release pages).
- **Custom trackers**: add any search page as a `{q}` URL template (e.g. `https://rutor.info/search/torrent/0/0/0/{q}`). A built-in **Test** button shows what the parser finds before you save it. Options: Windows-1251 decoding, "grab magnet from release pages".
- **Folders/tabs** for organizing sources, drag & drop, enable/disable per source.
- Streaming, incremental results; version accordion; color-coded seeds.
- **RU/EN** interface (switchable in the popup).
- Auto-recovers the button on Steam's SPA navigation.

## Security / privacy considerations

- Magnet links are strictly validated (40/64-hex and base32 info-hashes); hostile values are dropped.
- Detail links are restricted to `http(s)`; `javascript:`, `data:` and similar tricks are rejected.
- All strings scraped from third-party pages are HTML-escaped before rendering.
- **Cookie whitelist**: credentials are attached only to `rutracker.org`, `freetp.org`, `online-fix.me`. Everything else — including every custom tracker — goes out with `credentials: 'omit'`.
- Links found on custom tracker pages are resolved and filtered to the same origin.
- No analytics, no account, no middleman server. Requests go directly from your browser to the sources — same pages you'd otherwise open yourself.

## Custom trackers

The part I'm personally happiest with: if a site's search is a plain URL, you can add it in ~30 seconds. Paste the search URL with `{q}` instead of the search term, press **Test** (one isolated request, shows up to 3 extracted titles), and save. Parser follows plain links, resolves relative URLs, keeps only same-origin results, optionally fetches magnets from top release pages.

Limitations, honestly: it's HTML-parsing only — JavaScript-rendered searches, POST forms, CAPTCHA walls or login-gated pages won't work, and third-party markup changes can break a parser until updated.

## Open source

Plain JS/CSS/HTML, Manifest V3, no build step, no dependencies at runtime. Test suite runs with `node tests/run.js` → 43 passed, 0 failed.

**Repo: https://github.com/Ga4iGnida/Steam-Torrent-Finder**

## What feedback I am looking for

- Which sources should be built-in next (especially non-English trackers).
- Cases where a source returns garbage or nothing instead of an honest result — with the game name, so I can reproduce.
- Custom tracker setups that don't work (paste the search URL you tried).
- Anything in the MV3 architecture (streaming port, parser contract, watchdog) worth doing differently.

## Optional support link

The extension is free and stays free. If you want to support development, there's an optional Boosty link in the README — no obligation whatsoever: https://boosty.to/ga4ignida

---

## Pre-submit checklist (manual)

- [ ] Subreddit status checked in REDDIT_CHECKLIST.md (and rules re-read on the sub itself).
- [ ] Title matches the community tone (see table above).
- [ ] Body posted as a self-post (not a link post) with the GitHub link inside the body.
- [ ] Screenshots attached: `assets/screenshot-steam.png`, `assets/screenshot-results.png`.
- [ ] No claims of anonymity, "100% safe", "works everywhere", or guaranteed downloads anywhere in the text.
- [ ] Boosty mentioned only at the very end (or removed where rules are strict).
- [ ] Posting from your own account, manually; not cross-posted as identical text to multiple subs at once.
- [ ] If the subreddit requires mod approval or a megathread — follow that flow first.
