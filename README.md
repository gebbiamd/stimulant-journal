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
- Supabase-backed account sync is scaffolded. Run `supabase-schema.sql` in your project and use email/password sign-up and sign-in from the Settings page.
- Oura is now intended to use Supabase Edge Functions instead of browser-direct fetches. Deploy the functions under `supabase/functions/` and set secrets for `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and `SITE_URL`.
- iPhone Shortcuts can post doses into the same synced journal via `supabase/functions/shortcut-log-dose`.

## iPhone Shortcut Webhook

Use the existing Supabase backend as the Shortcut webhook target:

- Endpoint:
  `https://fuobbnjqvdltxcmczwft.supabase.co/functions/v1/shortcut-log-dose`
- Method:
  `POST`
- Headers:
  `Authorization: Bearer YOUR_SHORTCUT_SHARED_SECRET`
  `Content-Type: application/json`
- JSON body:

```json
{
  "dose": 1.5,
  "timestamp": "2026-03-27T14:22:00",
  "note": "optional"
}
```

Behavior:

- `dose` is interpreted as tablets
- the function looks up your `mg_per_tablet` from `user_settings`
- if `dose > 0`, it inserts a `dose` entry
- if `dose <= 0`, it inserts a `note` entry
- response:
  `{"ok":true}`

### Deploy

Set these secrets:

```sh
supabase secrets set SHORTCUT_SHARED_SECRET=YOUR_RANDOM_SECRET
supabase secrets set SHORTCUT_USER_ID=YOUR_SUPABASE_AUTH_USER_ID
```

Then deploy:

```sh
supabase functions deploy shortcut-log-dose --no-verify-jwt
```

### Shortcut Build

Recommended Shortcut actions:

1. `Ask for Input`
   Prompt: `How many tablets?`
   Type: `Number`
2. `Current Date`
3. `Format Date`
   Format string:
   `yyyy-MM-dd'T'HH:mm:ss`
4. Optional `Ask for Input`
   Prompt: `Any note?`
   Type: `Text`
5. `Dictionary`
   Keys:
   - `dose` -> provided number
   - `timestamp` -> formatted date string
   - `note` -> optional note text
6. `Get Contents of URL`
   - URL: webhook endpoint above
   - Method: `POST`
   - Request Body: `JSON`
   - Headers:
     - `Authorization` -> `Bearer YOUR_SHORTCUT_SHARED_SECRET`
7. `Quick Look` or `Show Result`
   Inspect the JSON response

## Local preview

```sh
python3 -m http.server 4173
```
