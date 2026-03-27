# Stimulant Journal

Static mobile-friendly journal for stimulant tracking on GitHub Pages.

## Structure

- `index.html`: daily home page with dose entry, note entry, thermometer-style gauge, and quick trend
- `summary.html`: broader analytics, 30-day trend, calendar, and tablet inventory
- `settings.html`: thresholds, targets, vacation-review settings, and backup tools
- `journal-core.js`: shared local-storage model and calculations

## Notes

- Data stays in browser storage on the device you use unless you export/import it.
- GitHub Pages hosts the UI only. It does not sync your data across devices by itself.

## Local preview

```sh
python3 -m http.server 4173
```
