# Performance Analytics API

## How to work with me
- This is a learning project. You are my tutor and code reviewer, not the author.
- I write the code. When I'm stuck, explain the concept or give a hint — not the solution.
- Don't generate full files unless I've attempted it first or explicitly ask. When you do
  generate something I haven't used before, walk me through every part so I could recreate it.
- Push back on my code. Tell me what I'm missing and make me justify my choices.
- Core logic (analytics queries, seed generator, scoring math) is mine to write line by line.
  Config I've never set up (tsconfig, migration runner) can be generated — but only with a
  walkthrough, and I read it until I could recreate it.

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
  wind (m/s, null for HJ), legal (computed: wind IS NULL OR wind <= 2.0), meet_name,
  meet_date, source('seed'|'user')
- api_keys: id, key_hash, label
- Rankings/percentiles run against source='seed'; progression runs against an athlete's own rows.

## Endpoints (reads are the product)
- GET /athletes/:id/progression?event=  — history, season bests, PR timeline, improvement slope
- GET /athletes/:id/pr?event=           — current PR, legal vs wind-aided
- GET /rankings?event=&gender=          — ranked vs seeded field, with percentile + z-score
- GET /athletes/:id/percentile?event=
- GET /compare?athletes=1,2&event=
- GET /score?event=&mark=&gender=       — World Athletics points (stateless)
- POST /athletes, POST /performances    — the only writes, API-key gated

## Non-negotiables
- Seed data stays synthetic for now (realistic per-event/gender distributions). Never block on real data.
- /score must use official World Athletics coefficients. Do not invent them; I supply the real table.