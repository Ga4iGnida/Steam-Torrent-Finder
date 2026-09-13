# Custom Trackers — Steam Torrent Finder

This document explains how custom trackers work: what a search template is, how the built-in **Test** button behaves, what the parser can and cannot do, and how to troubleshoot a tracker that returns nothing.

---

## What is a custom tracker?

A custom tracker is any website the extension can query through a **plain GET search URL**. Instead of relying on a built-in parser, the extension:

1. takes your search URL template,
2. replaces `{q}` with the URL-encoded game name,
3. downloads the resulting page,
4. collects links from it, filters them for relevance to the game title,
5. shows them in the results panel (optionally fetching magnet links from the linked pages).

Custom trackers never receive your cookies — all custom tracker requests are sent with `credentials: 'omit'`.

---

## The `{q}` template

`{q}` is a placeholder for the search query (the game name). Everything else in the URL stays as you typed it.

| You paste | The extension requests (for game "Deep Rock Galactic") |
| --------- | ----------------------------------------------------- |
| `https://example.com/?s={q}` | `https://example.com/?s=Deep%20Rock%20Galactic` |
| `https://rutor.info/search/torrent/0/0/0/{q}` | `https://rutor.info/search/torrent/0/0/0/Deep%20Rock%20Galactic` |

The query is URL-encoded automatically. A template **must** contain `{q}` — otherwise the tracker cannot be saved and the Test button reports an error.

### Known templates (auto-normalized)

For well-known sites the popup can rewrite your URL to a verified search template automatically. Currently recognized hosts:

| Site | Verified template |
| ---- | ----------------- |
| rutor.info | `https://rutor.info/search/torrent/0/0/0/{q}` |
| byxatab.com | `https://byxatab.com/?do=search&subaction=search&story={q}` |
| thelastgame.ru | `https://thelastgame.ru/?s={q}` |
| small-games.info | `https://small-games.info/?go=search&search_text={q}` |

If the host is not recognized, the popup tries a best-effort normalization: it takes the last query parameter with the longest value and replaces it with `{q}`. Always verify the result with the **Test** button.

---

## The Test button

**Test** performs a **single** search request with a test query — no retries, no cookies — and shows:

- up to **3 extracted titles** from the results page, or
- a concrete error (e.g. HTTP status, empty template, no links found).

Use it to check a tracker before saving. Note that the test query is a fixed word, not a real game title, so what matters is whether titles are extracted at all — not how many.

---

## Options

| Option | What it does | When to use |
| ------ | ------------ | ----------- |
| **Windows-1251** | Decodes the response using windows-1251 instead of UTF-8 | Old Russian sites that display mojibake (`Ðèòóàë`) |
| **Grab magnet from release pages** (on by default) | Fetches up to 5 top result pages to extract `magnet:` links | Trackers that show magnets on release pages, not in the search list |
| **Folder** | Which folder/tab the tracker appears in | Organize sources, e.g. a custom folder for one site |

---

## How the parser works

- It collects `<a href>` links whose visible text is at least 4 characters long.
- Relative links are resolved against the search URL; only **same-origin** `http(s)` links are accepted as results (a link must point to the same site).
- Links that already are `magnet:` are picked up directly and validated.
- Results are scored against the game title (the same relevance pipeline used for built-in sources, threshold 65) and limited to the **top 10**.
- If the page contains links but none are relevant, the result is an honest "nothing found" — but if the page contains no usable links at all, the result is "unknown layout" (which is retried).
- With **Grab magnet** enabled, the top 5 result pages are fetched to extract magnet links and dates. The step is bounded so a single search never storms a site.

---

## Limitations — when a custom tracker will NOT work

| Situation | Why it fails |
| --------- | ------------ |
| Results rendered by JavaScript | The extension does not execute page scripts; it parses the HTML it receives. |
| Search form uses POST | A search template must be a plain GET URL. |
| CAPTCHA / anti-bot wall | There is no interactive browser session behind the request. |
| Site requires login | Custom trackers are always requested **without cookies**, so members-only pages return the guest version. |
| Redirect chains ending in a different host | Only same-origin links become results; the final page is what gets parsed, but cross-host links are dropped. |
| Catalog-style pages with dynamic filters | The parser follows links; it cannot fill forms or click buttons. |
| Onclick-based navigation (`href="#"`) | There is no real URL to follow. |

Third-party sites change their markup at any time. While built-in parsers are covered by unit tests, a custom tracker depends entirely on the target site's current HTML — it can stop working without any changes on our side.

---

## Troubleshooting

| Symptom | What to try |
| ------- | ----------- |
| "Template must contain `{q}`" | Add `{q}` where the search term goes. |
| Test returns 0 titles, no error | Open the search URL manually in a browser tab. If you see results there but the test finds nothing, the page likely renders via JavaScript or uses a POST form. |
| Test returns an HTTP error | The site blocks datacenter/extension requests, requires login, or is down. |
| Titles are garbled (`Ðèòóàë`) | Enable **Windows-1251**. |
| Tracker finds pages but no magnets | Enable **Grab magnet from release pages**; if the site shows magnets only behind login, the tracker will not work. |
| Random unrelated results | The site's search is fuzzy. Relevance filtering (threshold 65) cuts most noise; consider a more precise search URL if the site offers one. |
| Everything worked yesterday, nothing today | The site changed its markup or started blocking requests. Re-check with **Test**; if the site itself is fine, report an issue. |

---

## Security notes

- Custom tracker pages are treated as **untrusted input**: all extracted strings are validated and escaped before being shown (see the Security section of the main [README](../README.md)).
- Only `http(s)` links of the **same origin** as the tracker become results; `javascript:`, `data:`, protocol-relative and cross-origin links are dropped.
- Magnet links are validated against a strict format before rendering.
- Custom trackers never receive cookies, and the Test request is fully isolated (no retries, no cookies).
