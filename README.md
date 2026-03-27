# Stimulant Journal

A small static web app for logging dose timing on a phone or desktop.

## What it does

- Logs dose amount with current time or a manual date/time override
- Stores entries privately in browser `localStorage`
- Shows recent history, rolling averages, and month totals
- Estimates a simple usage-pattern status from recent entries and personal thresholds
- Supports JSON export/import for backup
- Works on GitHub Pages and can be added to a phone home screen

## Important limitation

GitHub Pages can host the app, but it cannot store shared cloud data by itself. This version keeps data on the specific device/browser where you use it.

## Local preview

From this folder:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## GitHub Pages deployment

Create a repository, push this folder, and enable Pages from the root branch.
