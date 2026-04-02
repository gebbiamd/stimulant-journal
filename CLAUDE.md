# Stimulant Journal — Claude Instructions

## What this is
Personal PWA for tracking stimulant medication doses, analyzing trends, and correlating with Oura Ring health data. Solo project, not a product. Optimize for Stephen's workflow, not generality.

## Stack
- **Frontend:** Vanilla HTML/CSS/JS — no framework, no build step
- **Backend:** Supabase Edge Functions (Deno/TypeScript)
- **DB:** Supabase Postgres + RLS; localStorage is primary data store (`stimulant-journal-data-v2`)
- **Hosting:** GitHub Pages (static, push to deploy)
- **Integrations:** Oura Ring API v2, OpenAI API

## File map
```
index.html / home.js          — Home/daily tracking page
summary.html / summary.js     — Analytics & Oura data
settings.html / settings.js   — Config, auth, integrations
journal-core.js               — Shared state, calculations, Supabase/Oura helpers (~1700 lines)
styles.css                    — All styling (~2000 lines)
sw.js                         — Service worker (PWA caching, cache name: stimulant-journal-vN)
supabase/functions/           — Edge Functions (oura-*, openai-summary, shortcut-log-dose)
supabase-schema.sql           — DB schema + RLS policies
mockup-palette.html           — 12-theme color palette picker (reference only)
```

## Key conventions
- State lives in localStorage; Supabase is a secondary sync layer
- `renderX()` functions update the DOM from state; `getX()` functions compute derived values
- DOM elements cached in `els` object at page init
- All timestamps are ISO 8601 UTC strings; dates are YYYY-MM-DD
- Amounts stored in mg; tablet counts derived via `mgPerTablet`
- `persistState()` must be called after any state mutation
- User feedback via `showToast()` — never alert()
- `fetchSupabaseFunctionWithSession()` for auth-required Edge Functions; `fetchSupabaseFunctionAnon()` for public ones

## UI / Theme
- Active theme: **Copper + Sand** — bg `#ede0ca`, orb-one `#b87333`, orb-two `#a0926a`
- Tab bar: icon-only pill style (inactive = icon only; active = white pill with icon + label)
- Cards use glassmorphism (backdrop-filter blur)
- Mobile breakpoint: `@media (max-width: 520px)`

## Local dev
```sh
python3 -m http.server 4173
# or via Claude Code launch config
```

## Deploy
Push to `main` → GitHub Pages auto-deploys. No build step needed.
**Bump cache version** in `sw.js` (`stimulant-journal-vN`) when making significant changes.

## Supabase Edge Functions
Deploy with: `supabase functions deploy <function-name>`
Env vars needed: `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `OPENAI_API_KEY`, `SHORTCUT_SHARED_SECRET`, `SHORTCUT_USER_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SITE_URL`

## What NOT to do
- Don't introduce npm, a bundler, or a framework
- Don't add error handling for impossible scenarios — trust localStorage and existing guards
- Don't create abstractions for one-off operations
- Don't add comments unless logic is genuinely non-obvious
- Don't ask for confirmation on routine edits — move fast
