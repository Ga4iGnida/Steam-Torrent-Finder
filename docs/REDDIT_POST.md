# Reddit Promotion — Draft Posts

> **Status: DRAFT — not published.**
> Before posting anywhere, read [REDDIT_CHECKLIST.md](REDDIT_CHECKLIST.md) — some communities restrict self-promotion, GitHub links, or torrent-related topics, and several require moderator approval.
> Post different versions to different communities; do not mass-post identical text.
> Canonical link — the GitHub repository: **https://github.com/Ga4iGnida/Steam-Torrent-Finder**
> Optional support link (keep it at the very end, never lead with it): https://boosty.to/ga4ignida

---

## Version A — Developer / Open Source

**Best fit:** r/chrome_extensions, r/SideProject, r/opensource, r/coolgithubprojects, developer-focused threads.
**Tone:** technical, honest about limitations, invites code-level feedback.

### Suggested title

> I built an open-source Chromium extension that adds a torrent search panel to Steam game pages

Alternative titles:

- Open-sourced my first Manifest V3 extension: search multiple release trackers without leaving the Steam page
- Steam Torrent Finder — an MV3 extension that streams tracker results into a panel on Steam pages (open source)

### Body

```text
Hi! I made a small open-source Chromium extension called Steam Torrent Finder.

What it does:
It adds a "Search torrents" button to any Steam game page (store.steampowered.com/app/*).
Clicking it opens a side panel that queries several sources in parallel and streams
results in as they answer — each source reports independently, so you're not waiting
for the slowest one.

Why I built it:
I got tired of the loop "copy game name → open tracker → paste → close tab → copy name
again for the next tracker". The Steam page already tells me which game I'm looking at,
so the search should start there.

What's inside (facts, not marketing):
- 5 built-in sources: PirateBay (mirror failover + JSON API fallback), 1337x, Rutracker,
  FreeTP, Online-Fix (the last two are release pages with online-fix patches, not magnets).
- Custom trackers: any search page that can be expressed as a URL with {q}.
  There's a Test button that performs a single isolated request and shows you what the
  parser extracts before you save the tracker.
- Folders/tabs for organizing sources, drag & drop, enable/disable per source.
- RU/EN UI.
- Manifest V3, no build step, no dependencies, no telemetry.

Security bits I paid attention to (they have unit tests):
- strict magnet validation (40-hex/64-hex/base32 info-hashes; hostile values dropped),
- http(s)-only URL validation for links,
- HTML escaping of everything scraped before it touches the DOM,
- cookie whitelist: credentials are attached only to rutracker.org / freetp.org /
  online-fix.me; all other requests — including every custom tracker — use
  credentials: 'omit',
- same-origin filtering for links found on custom tracker pages.
- Parsers distinguish "site honestly returned nothing" from "markup changed"
  (retry vs. no-retry semantics).

Test suite: node tests/run.js → 43 passed, 0 failed (plain Node, no deps).

Honest limitations:
- Third-party markup changes → a parser can break until updated.
- Sources can be geo-blocked or down; some need a VPN depending on region.
- Rutracker needs a logged-in browser session; otherwise you get a fallback search link.
- Custom trackers work only with server-rendered search pages
  (no JavaScript rendering, no POST forms, no CAPTCHA walls).
- It's not anonymity software and not a download manager — it opens magnet links/pages.

Repo (code, docs, release notes): https://github.com/Ga4iGnida/Steam-Torrent-Finder

Feedback I'm looking for:
- Which sources would you want as built-ins next?
- Edge cases where the parsers return garbage instead of an honest empty result.
- Anything in the MV3 architecture you'd do differently (streaming port, watchdog,
  parser contract) — I'm happy to learn.

If the project is useful to you, there's an optional Boosty link in the README —
but it's completely optional, the extension is free either way.
```

**Assets to attach:** `assets/screenshot-steam.png` + `assets/screenshot-results.png` (real captures).
**Do not:** ask for stars, exaggerate the feature set, or claim anonymity/safety guarantees.

---

## Version B — Steam / Gaming

**Best fit:** gaming-adjacent communities where project showcases are allowed (check the checklist first; many gaming subs forbid torrent topics entirely).
**Tone:** user-first, plain language, no legal noise but no false claims either.

### Suggested title

> I made a free extension that searches game releases right from the Steam page

Alternative titles:

- Steam Torrent Finder — a free extension that adds a source search to Steam game pages
- I built a tool so you don't have to copy a game's name into five different sites anymore

### Body

```text
Hey! I've been building a small free extension for Chrome/Chromium called
Steam Torrent Finder, and I think some of you might find it useful.

The idea is simple: you're already on a game's Steam page, so why not search for
its releases from there? The extension adds a green "Search torrents" button next
to the game title. One click opens a panel on the left side of the page and results
start appearing as the sources respond — PirateBay, 1337x, Rutracker, FreeTP and
Online-Fix are built in.

A few things it does that I ended up caring about a lot:
- Results stream in per source, so one slow site doesn't hold up the rest.
- Versions of the same release are grouped into an accordion (top 15 per group),
  with seeds, size and date at a glance.
- You can add your own source: paste its search URL with {q} instead of the search
  term, hit Test to see if it works, and save it into a folder. I tested this with
  a few popular RU sites out of the box (rutor.info, byxatab.com, thelastgame.ru,
  small-games.info are recognized automatically).
- The whole UI is RU/EN.
- It's just HTML-parsing under the hood — no account, no telemetry, no "cloud".

What it is NOT: it doesn't host anything, doesn't download anything for you, and
it doesn't hide your IP — it's a search helper that opens magnet links or release
pages in the sites it finds. Some trackers need a VPN in some regions, and if a
site changes its markup, its parser can break until fixed.

It's fully open source (Manifest V3, no build step, 43 unit tests): 
https://github.com/Ga4iGnida/Steam-Torrent-Finder

If you try it and something feels off — a source returning nothing, weird parsing,
missing UI language — tell me and I'll try to fix it. There's also an optional
Boosty link in the README if you want to support development; totally optional.

(Mods: if this kind of post isn't allowed here, let me know and I'll remove it /
move it to the appropriate thread.)
```

**Assets to attach:** `assets/screenshot-steam.png` + `assets/screenshot-results.png` en `assets/screenshot-popup.png`.
**Do not:** promise "all games", "working torrents", or anything about safety/legality of third-party content.

---

## Posting discipline (both versions)

- One subreddit = one tailored post. Reuse the body only where rules allow it.
- Post manually, from your own account, with your own voice; no automation, no vote requests.
- Never start with the donation link. GitHub first, Boosty — one soft line at the end (or omit entirely where rules are strict).
- If a community bans torrent topics: do not post there at all (see checklist statuses).
