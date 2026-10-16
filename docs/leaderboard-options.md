# Where should the leaderboard live?

*Researched 16 Oct 2026. Provider facts come from each provider's own docs, linked at the bottom.*

## Decision (16 Oct 2026)

Rodrigo's call: **the leaderboard must never pause**, and no other app shares this Supabase project.

**So the recommendation is now: move to a Vercel Function + Neon Postgres.** Neon's free database sleeps when idle and wakes by itself on the next request, within a fraction of a second. Nothing ever needs resuming. Pinging Supabase to keep it awake isn't a dependable substitute. GitHub turns off scheduled jobs in quiet public repos after 60 days. Vercel's free cron runs once a day, and Supabase's docs only say "a few" requests a day are typically enough, so one ping a day isn't guaranteed to count. The only Supabase plan that never pauses is a paid one.

The migration also covers every fix the hardening list below was meant to make:

| Hardening item (Supabase) | Plain English | In the Neon version |
|---|---|---|
| 3-character rule on initials | Stop anyone saving a "name" that runs code for every visitor | The new function rejects anything over 3 characters, and the game escapes names when showing them |
| Pin the SDK version | Stop Supabase's library changing under the game | No Supabase library at all |
| Swap to the publishable key | Supabase retires the current key by end of 2026 | No key in the page; the database password stays on Vercel's side |
| "Leaderboard unavailable" message | Today an outage looks like "No scores yet" | Built in |

The sections below are the original research. "Keep Supabase" was the recommendation before this decision.

## Short version (original, before the decision)

**Recommendation: keep Supabase for now and spend one small session on it.** Moving elsewhere swaps one set of chores for another and doesn't make scores any harder to fake. The real risks today are fixable where the table already lives. One decision is yours: are you OK clicking "Resume" on a Supabase email now and then, or should the leaderboard never pause? If it should never pause, move to **a Vercel Function + Neon Postgres**, which is the second choice below.

**Do right away, even if nothing else changes:**

1. **Cap the initials at 3 characters in the database** (SQL below, pasted in the Supabase dashboard; no game code). The game writes each name into the page as raw HTML, and the 3-letter limit only exists in the browser. If the table accepts longer text, anyone can save a "name" that runs a script for every visitor who opens the leaderboard. Three characters are too short to carry a script, so the cap closes this.
2. **Pin the SDK**: change `supabase-js@2` to `supabase-js@2.118.0` (the current release) in `index.html` line 8. One line, and the game stops changing underneath you whenever Supabase ships.

**Before the end of 2026:** swap the old `anon` key for the new "publishable" key. Supabase is retiring the old key format by then, and the game uses it.

---

## How the game uses Supabase today

All of it is in `index.html`, lines 546–576:

| What | When | How |
|---|---|---|
| Read top 10 (`wd_leaderboard`: `initials`, `score`) | End screen, and the "View Leaderboard" page | Browser → Supabase directly |
| Insert a score | When a player types initials after a top-10 run | Browser → Supabase directly |
| `increment_wd_messages()` counter | Every game start | Browser → Supabase directly (not shown anywhere) |

- **The key** in the page is a public `anon` key in Supabase's legacy format (a JWT). Shipping it is normal. It only protects what the database's row rules (RLS) allow.
- **Scores can be faked. That's certain.** The game can only save scores if the public key is allowed to insert rows, so anyone can open the browser console and post `score: 99999999`. Supabase only checks what the database rules check, and there's no SQL in this repo, so I couldn't see whether a rule caps the score or the initials.
- **Script-injection risk (likely, unverified).** Lines 1181, 1783 and 1827 put `e.initials` into `innerHTML` unescaped. Whether this can actually be exploited depends on whether the table limits that column's length.
- **Failures look like an empty board.** `supabase-js` returns errors instead of throwing them, so if the project is paused or blocked, `data` comes back empty. Players see "No scores yet — yours could be first.", and their submitted score quietly disappears. That's the "silent" part.
- **Rows and traffic: not checked.** A read-only query against the live table was blocked by this session's permission rules, so I didn't retry. You can see both in the Supabase dashboard (Table Editor for the row count, Reports for API requests). Each game makes about 2–4 requests, which is tiny against any free tier below.
- **Pausing:** the project responded today (per the brief). The game's own reads and writes count as activity, so it only pauses after a week in which nobody plays. Commit `7e02df1` calls this a "namespaced" project (`wd_` prefix). If another app shares it, that app's traffic keeps it awake too.
- **Supabase's 30 October change doesn't affect this table.** New tables will need explicit permissions, but the changelog says "Existing tables … keep their current grants and stay reachable." No action needed.

### SQL to check and fix (Supabase → SQL Editor)

```sql
-- 1. See what the public key may do, and which row rules exist
select grantee, privilege_type from information_schema.role_table_grants
  where table_name = 'wd_leaderboard';
select policyname, cmd, qual, with_check from pg_policies
  where tablename = 'wd_leaderboard';

-- 2. Cap initials and block negative scores
--    (if this fails, some existing rows already break the rule; worth a look)
alter table public.wd_leaderboard
  add constraint wd_initials_len check (char_length(initials) between 1 and 3),
  add constraint wd_score_nonneg check (score >= 0);
```

If step 1 shows `UPDATE` or `DELETE` allowed for `anon`, anyone can also edit or wipe the board. Revoke those (`revoke update, delete on public.wd_leaderboard from anon;`).

---

## The options side by side

A word on cheating first. The game runs entirely in the browser, so **no backend can prove a score was earned**. Every option below can only make faking harder: sanity limits, rate limits, and the ability to delete bad rows. The real difference is whether the browser writes to the database directly (Supabase, Firebase) or goes through a small function you control (Vercel, Cloudflare).

| | Free tier (what matters here) | Idle pausing | Setup and upkeep for one person | Cheat resistance | Migration effort |
|---|---|---|---|---|---|
| **Keep Supabase** *(recommended)* | 500 MB DB, 5 GB egress, 2 active projects | **Yes: paused after 7 days of low activity.** Email a week before; one-click Resume; restorable for 1 year | Already set up. Chores: legacy key retires by end of 2026; Resume when paused | Low as-is; medium with DB constraints | None, just the hardening list above |
| **Vercel Function + Neon Postgres** *(second choice)* | Neon: 1 GB per project, 100 compute-hours/month. Vercel Hobby: 1M function calls/month | **No.** Sleeps after 5 min, wakes on the next request in a few hundred ms. Data isn't deleted | One dashboard and one bill (installed via Vercel Marketplace). Adds a small `api/` function and `package.json` to a repo that's one HTML file today | Medium: checks and rate limits live in your code; no database key in the page | Moderate |
| **Vercel Function + Upstash Redis** | 500K commands/month, 250 MB | **Yes: archived after 30+ days of inactivity** (backup kept; restored into a *new* database) | Same as Neon | Medium | Moderate |
| **Cloudflare Worker + D1** | 100K requests/day; D1 5M row reads and 100K writes per day, 5 GB | **No** (docs describe none) | New account on a second platform; Worker code lives outside this repo or needs its own deploy | Medium | Moderate–high |
| **Cloudflare Worker + KV** | 100K reads, 1,000 writes per day | **No** | As above; KV is clumsy for sorted top-10 lists | Medium | Moderate–high |
| **Firebase (Firestore, Spark plan)** | 1 GiB, 50K reads and 20K writes per day (a top-10 view costs 10 reads) | **No** pausing policy found in Firebase docs | New Google project and console; no server functions on the free plan, so the browser writes directly, like today | Low–medium: Security Rules can enforce length, range, and create-only | Moderate |
| **No backend (local best only)** | n/a | n/a | Nothing to maintain, ever | Only cheats yourself | Small, but **loses the shared leaderboard**, which is the point of the end screen |

Vercel itself no longer sells first-party KV or Postgres. On Hobby, its own storage is Blob (files) and Global Config (100 writes/month, not usable for scores). Databases come from Marketplace partners like Neon and Upstash. Hobby is also "non-commercial, personal use only", which fits this game.

### What each migration involves

**Keep Supabase (hardening)**
1. Run the SQL above in the dashboard.
2. Pin `supabase-js@2.118.0`.
3. In Settings → API Keys, create a publishable key and paste it in place of `SUPA_KEY`. Once the live game works, disable the legacy key.
4. Show "Leaderboard unavailable" when the read returns an error, instead of "No scores yet".
5. *(Optional, against pausing)* A daily ping. Note that a GitHub Actions schedule **won't hold** here: GitHub turns off scheduled workflows in public repos after 60 days without commits, and this repo is public and has been quiet for 67 days. A Vercel Cron Job (once a day on Hobby) works, but it needs a function, at which point the Neon route is nearly the same work.

**Vercel Function + Neon**
1. In Vercel, install Neon from Marketplace on the word-destroyer project. This creates the database and its environment variables.
2. Create a `scores` table (initials, score, created_at).
3. Add `api/leaderboard.js`: GET returns the top 10; POST validates initials (1–3 characters), checks a score ceiling, and inserts.
4. In `index.html`, replace the three Supabase calls with `fetch('/api/leaderboard')`, remove the Supabase script tag, and escape initials when rendering.
5. Export rows from Supabase (CSV) and import them into Neon.
6. Deploy a preview, play a round, check the board, then promote it. Pause or delete the Supabase table afterwards.

**Cloudflare Worker + D1**
1. Create a Cloudflare account, a D1 database and a Worker.
2. Write the same GET/POST logic in the Worker, with CORS allowing the Vercel domain.
3. Point `index.html` at the Worker URL. Then steps 4–6 as for Neon.

**Firebase**
1. Create a Firebase project, enable Firestore, and add the web app config to `index.html`.
2. Write Security Rules: allow read; allow create only with 1–3 character initials and a score in range; deny update and delete.
3. Swap the Supabase SDK for the Firebase SDK (pinned), rewrite the three calls, and copy scores over.

**No backend**
1. Replace the read and insert with `localStorage` (personal best only).
2. Rework the end screen's "Top Scores" card and the "View Leaderboard" page, which are product changes rather than plumbing.
3. Remove the SDK and the Supabase table.

---

## Why this recommendation

- **The pause is less of a problem than it sounds.** It only happens when nobody played for a week, which is exactly when nobody is looking at the board. Supabase warns you a week ahead, keeps the data, and restoring takes one click. The silent part is a game bug (step 4 above), not a reason to switch platforms.
- **The real risks live in the table, not the platform.** Open inserts and unescaped names would follow the game to Firebase unchanged. On any platform the fix is the same: validate on the server side and escape on render.
- **The end-of-2026 key swap means touching the code anyway.** Do the pin, the key swap, the error message and escaping the names in one small change, and the Supabase setup is in good shape.
- **When to switch:** if you'd rather never see a pause email, or Supabase forces another change you don't want to deal with, the Neon route keeps everything inside Vercel, never pauses, and takes the database key out of the page.

## Decisions

1. **Pausing:** decided: never pause, so move to Vercel + Neon.
2. **Shared Supabase project:** decided: no other app uses it, so it can be retired after the move.
3. **Next:** the Neon migration (steps under "Vercel Function + Neon" above). Rodrigo has to do two things himself: add Neon to the Vercel project (a Marketplace click that accepts Neon's terms), and export the current scores as a CSV from Supabase's Table Editor so they carry over.

## Sources

- Supabase pricing (free limits, 7-day pause): https://supabase.com/pricing
- Supabase, Project Pausing (activity, emails, 1-year restore): https://supabase.com/docs/guides/platform/free-project-pausing
- Supabase changelog, tables not exposed automatically (30 Oct 2026): https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- Supabase API keys (legacy `anon` deprecated by end of 2026): https://supabase.com/docs/guides/api/api-keys
- supabase-js latest version 2.118.0, checked with `npm view @supabase/supabase-js version` on 16 Oct 2026
- Vercel Storage overview (Blob, Global Config, Marketplace): https://vercel.com/docs/storage
- Vercel Hobby plan (included usage, non-commercial rule): https://vercel.com/docs/plans/hobby
- Vercel Cron Jobs on Hobby (once per day): https://vercel.com/docs/cron-jobs/usage-and-pricing
- Neon pricing (free plan, scale-to-zero): https://neon.com/pricing
- Neon scale to zero (wakes on next query): https://neon.com/docs/introduction/scale-to-zero
- Upstash Redis pricing: https://upstash.com/pricing/redis
- Upstash FAQ (free databases archived after 30+ days idle): https://upstash.com/docs/redis/help/faq
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare KV limits: https://developers.cloudflare.com/kv/platform/limits/
- Firebase pricing (Spark limits, no Functions): https://firebase.google.com/pricing
- GitHub, scheduled workflows disabled after 60 days in public repos: https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/disabling-and-enabling-a-workflow
