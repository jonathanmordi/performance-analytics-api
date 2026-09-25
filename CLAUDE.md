# Performance Analytics API

## What this is
A REST API serving track & field performance analytics. No frontend.
A seeded reference population (events LJ/TJ/HJ, genders M/F) powers rankings, percentiles,
and scoring. One thin authenticated write path lets an athlete add their own marks and see
where they land in the field.

## Stack
TypeScript, Express, Postgres, Jest. Redis added later for caching.

## Data model
- athletes: id, name, gender(M/F), source('seed'|'user'), owner_key (null for seed)
- performances: id, athlete_id, event(LJ/TJ/HJ), mark_cm (integer cm, canonical unit),
  wind (m/s, only on outdoor LJ/TJ), meet_name, meet_date, season_type(indoor/outdoor),
  source('seed'|'user', must match the athlete's), plus computed columns:
  - season_year: indoor meets from August on count toward the next year
  - legal: HJ OR indoor OR (wind IS NOT NULL AND wind <= 2.0) — outdoor NWI is not legal
- api_keys: id, key_hash, label
- Rankings/percentiles run against source='seed'; progression runs against an athlete's own rows.

## Endpoints (reads are the product)
- GET /athletes/:id/progression?event=  — history, season bests, PR timeline, improvement slope
- GET /athletes/:id/pr?event=           — current PR, legal vs wind-aided
- GET /rankings?event=&gender=          — ranked vs seeded field, with percentile + z-score
- GET /athletes/:id/percentile?event=
- GET /compare?athletes=1,2&event=
- GET /score?event=&mark=&gender=       — World Athletics points (stateless)
- GET /target?event=&gender=&percentile= — inverse percentile: what mark do I need to hit X%
- POST /athletes, POST /performances    — the only writes, API-key gated

## Who this is for
I'm an active D3 jumper at Stevens. I'm the target user — features should reflect how
college T&F actually works, not generic analytics. Concretely:
- US meets report feet-inches. Storage stays integer cm, but output must offer imperial
  (`?units=imperial`), correct to the quarter-inch. If I have to convert in my head I won't use it.
- Indoor and outdoor are separate seasons with separate PRs. The schema needs a season
  concept — note indoor spans a calendar-year boundary.
- The question I actually ask is "what do I need to jump", not "what percentile am I" —
  hence /target.

## Interface
No web UI. Two thin layers over the API instead:
- **CLI** (laptop) — `jump pr lj`, `jump rank lj`, `jump target lj 90`. The day-to-day
  interface. Named `jump` because `/usr/bin/pr` exists.
- **iOS Shortcut** (phone) — HTTP request → parse JSON → show the result, pinned to the
  home screen. This is how I check numbers right after a meet. Built once the API is
  deployed; no app store, no framework.

A frontend stays out of scope. It's the only path that would let teammates use it, so
revisit only if they ask.

## Roadmap
Original target: 2026-09-02. Build order:
1. [x] Schema constraints (legal computed, HJ/wind, seed/owner pairing, season column)
2. [x] Seed generator — synthetic, normal distributions per event × gender
3. [x] /rankings — the flagship
4. [x] /progression + /pr
5. [x] /percentile + /compare + /target
6. [x] /score — code done; returns 503 until the official WA data is in data/wa-scoring.json
7. [x] Auth + the two POSTs
8. [ ] Deploy (hosted Postgres + a real URL), [x] the CLI, [ ] the iOS Shortcut

Deferred (do not let these expand scope):
- TFRRS ingest for real results — planned second source alongside synthetic, not a
  replacement. Adapter over my existing PR Vault scraper. `source` must have room for it.
- Projection from improvement slope ("on pace for X by conference")
- Consistency stat (stddev of my own marks, not the field's)
- Redis caching — no load justifies it yet
- Any frontend

## Non-negotiables
- Seed data stays synthetic for now (realistic per-event/gender distributions). Never block on real data.
- /score must use official World Athletics coefficients. Do not invent them; I supply the real table.
- Commits are attributed to me alone. No Co-Authored-By trailers.