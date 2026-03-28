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
- Oura can be connected client-side with an Oura developer app and client ID.
- OpenAI summaries should use a secure relay, not a browser-exposed API key. A starter relay example is in `openai-relay-example.js`.
- Supabase-backed account sync is scaffolded. Run `supabase-schema.sql` in your project and sign in with magic-link email from the Settings page.
- Oura is now intended to use Supabase Edge Functions instead of browser-direct fetches. Deploy the functions under `supabase/functions/` and set secrets for `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and `SITE_URL`.

## Local preview

```sh
python3 -m http.server 4173
```
