# Steam Torrent Finder

**Search game releases without leaving the Steam page.**

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/README-English-blue?style=for-the-badge" alt="English README"></a>
  <a href="README.ru.md"><img src="https://img.shields.io/badge/README-%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-red?style=for-the-badge" alt="Русский README"></a>
</p>

<p align="center">
  <img src="assets/hero.png" alt="Steam Torrent Finder" width="100%">
</p>

Steam Torrent Finder is a Chromium extension that adds a **Search torrents** button to Steam game pages. It searches the enabled sources in parallel and shows results as they come in.

## Contents

- [What it does](#what-it-does)
- [Screenshots](#screenshots)
- [Built-in sources](#built-in-sources)
- [Custom trackers](#custom-trackers)
- [Installation](#installation)
- [Privacy & security](#privacy--security)
- [Limitations](#limitations)
- [Testing](#testing)
- [Links](#links)

## What it does

- 5 built-in sources: PirateBay, 1337x, Rutracker, FreeTP and Online-Fix
- Custom trackers using a simple `{q}` search URL
- Folders and per-source enable/disable
- English / Russian interface
- Result filtering and version grouping
- Magnet and URL validation, HTML escaping and a small cookie whitelist
- No backend or analytics — requests go directly from your browser to the sources

> The extension does not host or distribute content. It only shows links returned by third-party sites.

## Screenshots

| | |
|---|---|
| ![Steam page](assets/screenshot-steam.png) | ![Results](assets/screenshot-results.png) |
| Search button on a Steam game page | Results from enabled sources |
| ![Popup](assets/screenshot-popup.png) | ![Custom tracker](assets/screenshot-custom-tracker.png) |
| Settings and source folders | Custom tracker setup and Test button |

[Back to contents](#contents)

## Built-in sources

| Source | What you get |
|---|---|
| **PirateBay** | Magnet results with mirror failover |
| **1337x** | Magnet results from the Games search |
| **Rutracker** | Results for users logged in to Rutracker |
| **FreeTP** | Online-fix release pages |
| **Online-Fix** | Online-fix release pages |

Rutracker is disabled by default.

Third-party sites can change or go offline at any time, so a source may stop working until its parser is updated.

[Back to contents](#contents)

## Custom trackers

Custom trackers use a **GET** search URL with `{q}` where the search term goes.

Example:

```text
https://example.com/search?q={q}
```

In the popup:

1. Open **Custom tracker**.
2. Paste the search URL with `{q}`.
3. Press **Test**.
4. Save it when the result looks right.

The Test request uses no cookies and no retries. Custom trackers also do not receive cookies.

More details: [docs/CUSTOM_TRACKERS.md](docs/CUSTOM_TRACKERS.md)

[Back to contents](#contents)

## Installation

The extension is not on the Chrome Web Store yet.

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Open a Steam game page.
6. Click **Search torrents** next to the game title.

Works with Chromium-based desktop browsers that support Manifest V3. The project is developed and tested with Chrome.

[Back to contents](#contents)

## Privacy & security

The extension has no account system, backend or analytics.

- Third-party titles, URLs and magnets are validated before they are shown.
- Custom tracker links are restricted to the same origin as the tracker.
- Cookies are only used for the built-in sources that need a logged-in session. Custom trackers never get them.
- Requests go directly from your browser, so this is **not** a VPN, proxy or anonymity tool.

[Back to contents](#contents)

## Limitations

- Tracker websites can change their HTML, block requests or go offline.
- Custom trackers work with server-rendered GET pages. JavaScript-only search pages, POST forms and CAPTCHA pages are not supported.
- Full Rutracker results require an active login in the same browser.
- The extension searches and opens links; it is not a download manager.

[Back to contents](#contents)

## Testing

There is no build step and no package manager required.

```bash
node tests/run.js
```

[Back to contents](#contents)

## Links

- [GitHub repository](https://github.com/Ga4iGnida/Steam-Torrent-Finder)
- [Latest release](https://github.com/Ga4iGnida/Steam-Torrent-Finder/releases/latest)
- [Report a bug](https://github.com/Ga4iGnida/Steam-Torrent-Finder/issues/new)
- [Support the project on Boosty](https://boosty.to/ga4ignida)

[⬆ Back to top](#steam-torrent-finder)
