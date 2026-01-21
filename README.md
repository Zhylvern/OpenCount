# OpenCount

OpenCount is a lightweight Firefox extension that tracks visit counts and active time by domain.

## Features
- Counts a visit when a site becomes the active tab
- Tracks active time only when the tab is active and the window is focused
- Groups stats by domain
- Stores data locally in `browser.storage.local` (no network calls)

## Install (Temporary)
1. Open Firefox and go to `about:debugging`.
2. Click "This Firefox".
3. Click "Load Temporary Add-on...".
4. Select `manifest.json` from this folder.

## Development
After editing files, reload the extension from `about:debugging`.

## Project Structure
- `manifest.json` — extension manifest
- `background.js` — tracking logic
- `popup.html` — popup UI
- `popup.js` — popup rendering
- `dashboard.html` — dashboard page
- `dashboard.css` — dashboard styles
- `dashboard.js` — dashboard data + charts
- `overlay.js` — bottom-right live timer overlay (content script)
- `assets/` — shared static assets (logos)
- `icons/` — extension icons

## Privacy
- All data stays on your machine.
- Internal pages (`about:`, `moz-extension:`) are ignored.
- Private windows are not tracked unless you enable "Run in Private Windows" in the add-on settings.

## License
MIT — see `LICENSE`.
