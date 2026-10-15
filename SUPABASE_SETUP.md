# Supabase setup

## Status — DONE on 2026-09-11 (set up by Claude in Chrome)
- Organization **Aziz RE Fund** (free plan) → project **re-fund-platform**, ref `hzvdsfyjbktanqdvojqb`, region Asia-Pacific.
- Dashboard: https://supabase.com/dashboard/project/hzvdsfyjbktanqdvojqb
- `.env` in the repo already holds the project URL and the publishable (anon) key. The database password was generated in the dashboard
  and is NOT stored here — reset it under Settings → Database if you ever need it (the app never uses it).
- `supabase/schema.sql` applied (projects, project_versions, actuals + RLS). Automatic RLS is on for new tables.
- Email provider on, magic link / OTP available. Site URL `https://abdulazizssr-code.github.io/re-fund-platform/`; redirect URLs: that + `/**` and `http://localhost:5173/**`.
- Hosting: GitHub Pages, repo `abdulazizssr-code/re-fund-platform` (public), file `index.html` at the root = `dist/index.html` from `python3 scripts/build-static.py`.
- First user invited by email from the dashboard — accept the invitation email once.

The original step-by-step guide is kept below for reference / a second project.

---
# Supabase setup — do this once, ~15 minutes

You only need to do steps 1–5 yourself. Everything after that is code, which Claude writes.

## 1. Create the project
1. Go to https://supabase.com → Sign in (GitHub or email) → **New project**.
2. Organization: your personal one. Name: `re-fund-platform`. Database password: generate one and save it in your password manager (you rarely need it). Region: **Frankfurt (eu-central-1)** — closest to Riyadh with the free tier.
3. Wait ~2 minutes for provisioning.

## 2. Copy the two keys into the repo
Project → **Settings → API**:
- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** key → `VITE_SUPABASE_ANON_KEY`

Copy `.env.example` to `.env` in the repo root and paste them in. `.env` is git-ignored; never commit it. The anon key is safe in the browser *because* row-level security (step 3) is what protects data — the `service_role` key is NOT safe in the browser; never copy that one anywhere in the frontend.

## 3. Create the tables
Project → **SQL Editor → New query** → paste the whole of `supabase/schema.sql` → **Run**. You should see "Success. No rows returned".
Check: **Table Editor** now shows `projects`, `project_versions`, `actuals`, each with the RLS shield icon on.

## 4. Turn on email login
Project → **Authentication → Providers**: **Email** is on by default. Recommended settings:
- **Confirm email**: ON (users click a link once at signup).
- **Enable Magic Link / OTP**: ON — this is the "no password" login; users receive a 6-digit code or link by email. Passwordless is fine for a handful of internal users and removes the whole username/password mess of the old app.

Project → **Authentication → URL Configuration**:
- **Site URL**: where the app will live, e.g. `https://<your-github-username>.github.io/re-fund-platform/` (use `http://localhost:5173` while developing).
- **Redirect URLs**: add both the localhost and the production URL.

Optional but recommended for a professional feel: **Authentication → Email Templates** — change the sender name to your fund/company name and add an Arabic line.

## 5. Add yourself as the first user
**Authentication → Users → Add user → Create new user**: your email, tick "Auto Confirm User". That's your login for testing.

## 6. What Claude does next (no action from you)
- `src/lib/supabase.js` — client created from the two env vars.
- Login screen: email → magic link / OTP. No usernames.
- Project list / save / load / "save as version" against the three tables.
- Actuals import writes to `actuals` with `quarter_idx` stored, so the cutoff never depends on today's date.

## 7. Later — AI features (needs one more key)
When we add the AI classifier for imported payments and the variance commentary:
1. Get an Anthropic API key at https://console.anthropic.com → API Keys.
2. In Supabase: **Edge Functions → Secrets** → add `ANTHROPIC_API_KEY`. The key lives only on the server; the browser calls the edge function, never Anthropic directly.
3. Install the Supabase CLI once (`npm i -g supabase`), `supabase login`, `supabase link --project-ref <ref>` (ref is in Settings → General), then `supabase functions deploy` deploys whatever is in `supabase/functions/`.

## Free tier limits (fine for this project)
500 MB database, 50,000 monthly active users, 500K edge-function calls/month. The project **pauses after 7 days of inactivity** on the free tier — open the dashboard once a week, or upgrade to Pro ($25/mo) when real users depend on it.

## Sketch AI (Edge Function `sketch-ai`)
The Sketch tab's "Turn the idea above into rules" button calls `https://<project>.supabase.co/functions/v1/sketch-ai` with the user's session token. The function holds the Anthropic key; the browser never sees it. Rules come back as a small script the user reviews, then runs in the platform's sandbox.

Setup (once, from a machine with the Supabase CLI logged in to the project):
1. `supabase functions deploy sketch-ai` (source: `supabase/functions/sketch-ai/index.ts`).
2. `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...` — optional: `SKETCH_AI_MODEL=claude-sonnet-4-5`.
   Also set `SKETCH_AI_ALLOWED=you@example.com,other@example.com` (comma-separated emails). When this secret is set, only those signed-in users can call the function; anyone else gets 403. Leave it unset only while testing.
   Also put a monthly spend limit on the key in the Anthropic console (Settings → Limits) so abuse is capped.
3. Dashboard → Edge Functions → sketch-ai → keep "Verify JWT" on (the function also checks the user itself).
Cost: one model call per click (a few cents). Remove: delete the function and the secret; the button then reports "AI service failed" and everything else keeps working.
To point the app at a different URL (e.g. a self-hosted function) set `localStorage.sketchAiUrl` in the browser.
