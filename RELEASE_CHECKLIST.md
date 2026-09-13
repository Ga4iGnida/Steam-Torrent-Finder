# Release Checklist — Steam Torrent Finder

Legend: `[x]` done · `[ ]` pending · statuses used in the final report: **DONE / NOT DONE / NEEDS MANUAL ACTION / BLOCKED**

---

## Project Audit

- [x] Full source audit (manifest.json, background.js, content.js, common.js, popup.html, popup.js, styles.css, tests/run.js)
- [x] Confirmed Features / Confirmed Limitations / Do-Not-Claim list established from actual code
- [x] Historical audit & implementation reports moved to `docs/dev-notes/`
- [x] No functionality invented; no working logic rewritten for presentation
- [x] Canonical repository reused (no second repo created)

## Documentation

- [x] `README.md` (English first + `## Русская версия`)
- [x] `RELEASE_NOTES.md` (v1.0.0)
- [x] `docs/CUSTOM_TRACKERS.md`
- [x] `docs/REDDIT_POST.md` (draft — Version A + Version B)
- [x] `docs/REDDIT_FINAL.md` (draft)
- [x] `docs/REDDIT_CHECKLIST.md`
- [x] `docs/dev-notes/` (AUDIT.md, IMPLEMENTATION_REPORT.md, FINAL_FIX_REPORT.md, IMPLEMENTATION_SPEC.md)

## Visual Assets

- [x] `assets/hero.png` — 1280×640
- [x] `assets/social-preview.png` — 1280×640, < 1 MB
- [x] `assets/screenshot-steam.png` — real capture
- [x] `assets/screenshot-results.png` — real capture
- [x] `assets/screenshot-results-full.png` — real capture
- [x] `assets/screenshot-popup.png` — real capture (EN)
- [x] `assets/screenshot-popup-ru.png` — real capture (RU)
- [x] `assets/screenshot-custom-tracker.png` — real capture
- [ ] GitHub social preview uploaded — **NEEDS MANUAL ACTION** (Settings → Social preview)

## GitHub Repository

- [x] Canonical repo verified: `Ga4iGnida/Steam-Torrent-Finder` (public, empty, default branch `main`)
- [x] `.gitignore` added (zip, env, node_modules, IDE/OS junk)
- [x] `git init -b main`
- [x] Initial commit
- [ ] `git push origin main` — **NEEDS MANUAL ACTION** if no stored credentials
- [ ] Repository description — **NEEDS MANUAL ACTION**
- [ ] Topics — **NEEDS MANUAL ACTION**

## GitHub Button

- [x] URL verified in popup: `https://github.com/Ga4iGnida/Steam-Torrent-Finder`
- [x] Correct label/link in RU and EN
- [ ] Live click check on the published repo — **NEEDS MANUAL ACTION** (after push)

## Boosty Button

- [x] URL exactly `https://boosty.to/ga4ignida` (unchanged)
- [x] EN label `Support the Project`
- [x] RU label `Поддержать автора`
- [x] Icon, placement and non-intrusive styling verified

## Release

- [x] Version confirmed from `manifest.json`: **1.0.0**
- [x] `RELEASE_NOTES.md` prepared
- [ ] Git tag `v1.0.0` — **NEEDS MANUAL ACTION**
- [ ] GitHub Release — **NEEDS MANUAL ACTION** (`gh` CLI unavailable; attach `RELEASE_NOTES.md` + `steam-torrent-search.zip`)

## Security

- [x] No secrets / tokens / cookies / `.env` / session data in the tree
- [x] Security logic intact (credential whitelist, same-origin check, magnet/URL validation, HTML escaping)
- [x] No validation weakened
- [x] Build artifact `*.zip` excluded via `.gitignore`
- [ ] Post-push secret verification on remote — **NEEDS MANUAL ACTION**

## Reddit

- [x] 9 subreddits researched → `docs/REDDIT_CHECKLIST.md`
- [x] Post drafts → `docs/REDDIT_POST.md`, `docs/REDDIT_FINAL.md`
- [x] ModMail draft for `r/PiratedGames`
- [ ] Publish posts — **NEEDS MANUAL ACTION**
  - `NOT ALLOWED`: r/Piracy, r/software
  - `MEGATHREAD ONLY`: r/webdev (Showoff Saturday)
  - `BLOCKED pending OSI license`: r/opensource

## Verification

- [x] `manifest.json` valid (Manifest V3, version 1.0.0)
- [x] `node --check` on all JS files — clean
- [x] `node tests/run.js` → **43 passed, 0 failed**
- [x] Image dimensions and file sizes verified
- [x] GitHub / Boosty URLs verified
- [x] Button and UI labels localized (RU/EN)

## Known Limitations

- Third-party tracker markup can change at any time; parsers may stop matching
- Custom trackers do not send cookies, so login-gated sites will not work
- JavaScript-rendered / obfuscated sites are not supported as custom trackers
- Rutracker is disabled by default and requires an active browser login
- PirateBay mirrors are hardcoded and may need updating if they change
- Overall search ceiling is bounded by `MAX_TOTAL_TIMEOUT` (120 s)

## Remaining Manual Actions

- [ ] `git push` (GitHub credentials via GCM)
- [ ] Create git tag `v1.0.0` + GitHub Release from `RELEASE_NOTES.md`
- [ ] Set repository description and topics
- [ ] Upload `assets/social-preview.png` as GitHub social preview
- [ ] (Optional) Add an OSI license to unlock r/opensource
- [ ] Publish Reddit posts according to `docs/REDDIT_CHECKLIST.md`
- [ ] Attach `steam-torrent-search.zip` to the GitHub Release
