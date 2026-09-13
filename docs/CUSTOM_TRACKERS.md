# Custom trackers

Custom trackers let you add a site without changing the extension code.

The only requirement is a normal **GET** search URL with `{q}` where the game name should go.

Example:

```text
https://example.com/search?q={q}
```

## Add one

1. Open the extension popup.
2. Go to **Custom tracker**.
3. Paste the search URL and make sure it contains `{q}`.
4. Press **Test**.
5. Save the tracker if the test finds the expected links.

The extension URL-encodes the game name automatically.

### A real example

```text
https://rutor.info/search/torrent/0/0/0/{q}
```

For a few known sites the popup can normalize the URL for you. It is still a good idea to press **Test** before saving.

## Options

**Windows-1251** — useful for older Russian sites that are encoded that way.

**Grab magnet from release pages** — if the search page only links to release pages, the extension can open the top few pages and look for a magnet there.

## What works

Custom trackers work best with server-rendered search pages where results are normal `<a href>` links.

The parser:

- resolves relative links;
- keeps only same-origin `http(s)` links;
- filters results by the game name;
- validates magnet links before showing them.

## What does not work

- JavaScript-only search results
- POST-only search forms
- CAPTCHA / anti-bot pages
- login-only pages
- sites that hide navigation in JavaScript instead of real links

Custom trackers are requested **without cookies**, so a site that only works while logged in will not work here.

## If Test finds nothing

Open the search URL in a normal browser tab first.

If you can see results there but **Test** cannot, the site probably renders them with JavaScript, uses a POST form, or returns a different page to extension requests.

If the site used to work and suddenly stopped, check it again with **Test**. Third-party sites change their HTML all the time.

For a broken built-in parser or a useful new tracker, [open an issue](https://github.com/Ga4iGnida/Steam-Torrent-Finder/issues/new).