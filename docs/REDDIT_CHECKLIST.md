# Reddit Posting — Subreddit Rules Checklist

**Project:** Steam Torrent Finder — `https://github.com/Ga4iGnida/Steam-Torrent-Finder`
**Checklist compiled:** 2026-09-13
**Purpose:** decide — per community — whether the project can be shared at all, and how.

> ### Important method note
> Direct access to `reddit.com` (and `old.reddit.com`, `api.reddit.com`) returned **HTTP 403** from the network this checklist was compiled on. Bright Data scraping and redlib mirrors returned empty content. The rules below were therefore assembled from **secondary sources** (search snippets, mirror/aggregator snapshots: willitstay.com, gofindevo.com, rankhog.com, intoru.ai, leadsrover.io) with the **dates those snapshots were taken**. Where no reliable text was found, the entry is marked **UNKNOWN** — nothing here is invented.
>
> **Before actually posting, re-read the live rules of the target subreddit with your own logged‑in account.** Rules change, and the final decision belongs to that community's moderators.

---

## Status table

| Subreddit | Rules checked | Self-promo | Torrent topic | Posting method | Status |
| --- | --- | --- | --- | --- | --- |
| r/chrome_extensions | Rules 1–5 (Reddiquette / constructive / about extensions / **No Spam** / **No Piracy**) — full text of No Piracy not retrieved | Historically tolerated; a mod once suggested "one self-promo per user per project per month" (never codified) | **High risk** — rule 5 "No Piracy" may cover this | Self-post, after reading the full No Piracy / No Spam text; be explicit that the tool hosts nothing | **ALLOWED WITH CONDITIONS** |
| r/SideProject | No formal rules; ~620K members; show-and-tell is the norm; site-wide 9:1 guidance applies | Allowed (built + feedback request) | Not restricted by any listed rule | Self-post | **ALLOWED** |
| r/opensource | Flair **"Promotional"** mandatory; repo **must carry an OSI-approved license**; No Drive-By Posting / Karma Farming; No Sensationalized Titles; <10% self-promo | Allowed within those limits | Not addressed | Self-post **with flair**, only if a license exists | **ALLOWED WITH CONDITIONS** — currently **blocked** (repo has no `LICENSE`) |
| r/Piracy | Rule 2 "Don't request invites, trade, sell, or self-promote"; rule 3 "Don't request or link to specific pirated titles" | Prohibited | Prohibited | — | **NOT ALLOWED** |
| r/PiratedGames | Rule 3 (sidebar + wiki): a tool/guide that can enable piracy → **message the moderators via ModMail first**; magnet/.torrent links forbidden; account <7 days cannot post | Only via moderator approval | Allowed **only** through the mods; no direct links | **ModMail first**, then follow mod instructions | **MOD APPROVAL REQUIRED** |
| r/Steam | Full `r/Steam/wiki/subrules` text not retrieved; only violation reasons (incl. #5 "Advertising & Spam, User-Generated Content, Surveys") | UNKNOWN | UNKNOWN | UNKNOWN | **UNKNOWN** — do not post blind |
| r/webdev | Showcase only on **"Showoff Saturday"**; standalone weekday showcase posts are removed; commercial promotion/solicitation prohibited; 9:1 | Restricted to the weekly thread | Not addressed | **Megathread (Saturday) only** | **MEGATHREAD ONLY** |
| r/coolgithubprojects | GitHub links only (external marketing forbidden); descriptive title; repost only after 6+ months and new features; 9:1 | Allowed | Not addressed | Self-post with a **direct GitHub link** | **ALLOWED WITH CONDITIONS** |
| r/software | Rule 1 "Piracy" forbids "software that is primarily intended or used to download, copy, or facilitate piracy"; hidden karma threshold + AutoModerator; self-promo violations → permanent ban | Effectively prohibited for this project | Effectively prohibited | — | **NOT ALLOWED** |

### Legend
`ALLOWED` · `ALLOWED WITH CONDITIONS` · `MEGATHREAD ONLY` · `MOD APPROVAL REQUIRED` · `NOT ALLOWED` · `UNKNOWN`

---

## Practical conclusions

- **Best first target:** `r/SideProject` (open showcase, feedback-oriented) and `r/coolgithubprojects` (GitHub-link-friendly).
- **`r/chrome_extensions`** is the most on-topic audience, but read the live **"No Piracy"** text first — the topic is the main risk, not the promotion.
- **`r/opensource` is blocked until the project has a real OSI license.** The repository currently has **no `LICENSE` file**, and the README deliberately does **not** invent one. Add a license only if the author chooses to — then this subreddit opens up.
- **Do not post** to `r/Piracy` or `r/software`.
- **`r/PiratedGames`** requires a ModMail conversation before anything is posted.
- **`r/Steam`** is unknown — check manually while logged in.
- **`r/webdev`** accepts showcases only in the **Showoff Saturday** megathread.

### Suggested order (highest chance first)
1. r/SideProject
2. r/coolgithubprojects
3. r/chrome_extensions (after reading No Piracy)
4. r/PiratedGames (only after ModMail approval)
5. r/webdev (Saturday megathread only)
6. r/opensource (only after a license is added)

---

## ModMail draft — r/PiratedGames

> **Subject:** Mod approval request — open-source browser extension (search panel on Steam pages)
>
> Hi mods,
>
> Before posting anything, I'd like your approval per rule 3. I built a free, open-source Chromium extension called **Steam Torrent Finder** that adds a "Search torrents" button to a Steam game page and shows results from several sources in a side panel. The extension **hosts no content itself** and contains no magnet/.torrent links — it only performs a search on third-party sites the user can also use directly (and supports user-defined custom trackers).
>
> Repository: `https://github.com/Ga4iGnida/Steam-Torrent-Finder` (source in the open, license intentionally not declared yet).
>
> I will not post any magnet or .torrent links, and I will follow any formatting or content rules you specify. Could you confirm whether a single, non-repetitive "I built this / feedback welcome" post is acceptable here, and if so, under what constraints?
>
> Thank you for your time.

---

## Notes on discipline

- One tailored post per community — never the same text mass-posted.
- Lead with the GitHub repository link; the optional Boosty support link goes only at the very end (and can be omitted per subreddit).
- No clickbait, no "free games", no safety guarantees, no fake metrics.
- If a subreddit's rules forbid the post — **do not post**, and do not try to work around the rules.
- Reddit publishing is a **manual action**: nothing here is auto-published.
