# MaxBroadband PWA

Static, framework-free Progressive Web App for the MaxBroadband customer portal.

## Files

- `index.html` - App shell and screens
- `css/style.css` - Mobile-first production UI
- `js/app.js` - API login, rendering, PWA hooks and interactions
- `manifest.json` - PWA manifest
- `sw.js` - Offline app-shell service worker
- `offline.html` - Offline fallback page
- `assets/` - Favicon and install icons

## API

The frontend calls only the Google Apps Script endpoint:

```text
GET https://script.google.com/macros/s/AKfycbzWi2x4UZiRpmOGsx5fCsBOaH9tG3mG81Mv1aFG2BUrvxnAa3AdLWZ3X69BQLiJ2ZZ1gQ/exec?action=login&loginid=LOGINID&password=PASSWORD
```

The app never accesses Google Sheets directly and does not depend on a fixed number of columns. It displays only the customer and plan fields defined in `js/app.js`.

## Running

Open `index.html` directly for local testing.

For full PWA behavior, host the folder on HTTPS, such as GitHub Pages. Service workers and install prompts are disabled by browsers on `file://` pages.
