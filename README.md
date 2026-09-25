# Performance Analytics API

A REST API serving track & field performance analytics for the horizontal and vertical
jumps. A seeded reference population powers rankings, percentiles, and World Athletics
scoring; a thin authenticated write path lets an athlete add their own marks and see where
they land in the field.

No frontend — this is the API, plus a small CLI (`jump`).

It answers the questions a college jumper actually asks after a meet:

```
$ jump pr lj
Jonathan — LJ PRs
indoor   21-03.00  Stevens Opener, 2025-12-06
outdoor  21-07.75 (+1.1)  Conference, 2026-05-02
         22-00.50w (+2.6)  Spring Open

$ jump target lj 90
24-06.25 for the 90th percentile (rank 24 of 250)
you: 21-07.75 — need +34.75 in
```

## Status

- [x] Project scaffolding (Express, TypeScript, Postgres, Jest)
- [x] Schema: computed `legal`, season columns, HJ/wind and seed/owner constraints
- [x] Synthetic seed generator
- [x] Read endpoints: rankings, percentile, target, progression, PRs, compare
- [x] World Athletics scoring — **needs the official coefficient table installed** (see [Scoring](#scoring))
- [x] API-key auth and the write path
- [x] CLI
- [ ] Deploy (hosted Postgres + a real URL) — steps in [Deploying](#deploying)
- [ ] iOS Shortcut (needs the deploy)
- [ ] TFRRS ingest for real results

## Stack

TypeScript · Express 5 · Postgres 16 · Jest · `node-pg-migrate`

## Getting started

Requires Node 20+ and a running Postgres 16.

```bash
npm install
cp .env.example .env        # then edit DATABASE_URL and API_KEY_SALT
createdb performance_analytics
npm run migrate             # apply the schema
npm run seed                # 1,500 synthetic athletes, ~24k marks
npm run dev                 # http://localhost:3000
```

```bash
curl 'http://localhost:3000/rankings?event=LJ&gender=M&limit=10&units=imperial'
```

### Adding your own marks

Reads are open; writes need an API key.

```bash
npm run create-key -- "laptop"          # prints a key once — save it

curl -X POST localhost:3000/athletes \
  -H 'content-type: application/json' -H 'x-api-key: <key>' \
  -d '{"name":"Your Name","gender":"M"}'   # → {"id": 3001, ...}

curl -X POST localhost:3000/performances \
  -H 'content-type: application/json' -H 'x-api-key: <key>' \
  -d '{"athlete_id":3001,"event":"LJ","mark":"21-03.25","wind":1.2,
       "meet_name":"Stevens Invite","meet_date":"2026-04-11","season_type":"outdoor"}'
```

Or use the [CLI](#cli), which does the same with `jump add`.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the API with ts-node |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm run seed` | Replace all seed rows with a fresh synthetic field (`SEED=<n>` to vary it) |
| `npm run create-key -- "<label>"` | Mint an API key for the write endpoints (printed once) |
| `npm test` | Run the Jest suite |
| `npm run test:db` | Create and migrate `performance_analytics_test` for the integration tests |
| `npm run migrate` | Apply pending migrations |
| `npm run migrate:down` | Roll back the most recent migration |
| `npm run migrate:create <name>` | Scaffold a new migration file |
| `npm run seed:prod`, `npm run create-key:prod` | The same, from the compiled build (for servers) |

## How it works

```
request → params.ts (validate) → repo.ts (SQL) → analytics.ts + stats.ts (math) → units.ts (format) → JSON
```

SQL only fetches rows — each seeded athlete's best legal mark, or one athlete's history.
Ranking, percentiles and PR logic are plain TypeScript, so they're unit-tested without a
database.

| File | Role |
|---|---|
| `src/index.ts`, `src/app.ts` | Start the server; routing and the JSON error handler |
| `src/params.ts` | Query validation (`event`, `gender`, `season`, `units`, …) |
| `src/repo.ts` | All read SQL |
| `src/stats.ts` | Mean, stddev, percentile, inverse percentile, regression slope |
| `src/analytics.ts` | Rankings with ties, PRs (legal vs wind-aided, indoor vs outdoor), progression |
| `src/units.ts` | cm ↔ metric / feet-inches |
| `src/routes/reads.ts`, `src/routes/writes.ts` | The endpoints |
| `src/auth.ts` | API-key hashing and checking |
| `src/scoring.ts` | World Athletics points from the supplied table |
| `src/seed.ts` | Synthetic field generator |
| `src/cli.ts` | The `jump` command |

## Data model

Marks are stored as **integer centimetres** throughout — no floats, no unit ambiguity, and
exact comparisons for ranking.

**`athletes`** — `id`, `name`, `gender` (M/F), `source` (`seed` \| `user`), `owner_key`
(FK to `api_keys`). `owner_key` is set exactly when `source = 'user'`.

**`performances`** — `id`, `athlete_id`, `event` (LJ/TJ/HJ), `mark_cm`, `wind`, `meet_name`,
`meet_date`, `season_type` (indoor/outdoor), `source`, plus two computed columns:

- `season_year` — the season a meet belongs to. Indoor meets from August on count toward
  the next year, so a December 2025 meet is part of **indoor 2026**.
- `legal` — `true` for HJ, for anything indoors, and for outdoor LJ/TJ with a wind reading
  ≤ +2.0. An outdoor LJ/TJ with **no** reading (NWI) is *not* legal.

Wind can only be set on outdoor LJ/TJ. A performance's `source` must match its athlete's
(enforced by a composite foreign key).

**`api_keys`** — `id`, `key_hash`, `label`, `created_at`. Keys are stored as an HMAC with a
server-side salt (`API_KEY_SALT`), never in plaintext.

### Migrations

The schema lives in `db/migrations/` as timestamped SQL files, each with an up and a down
section. The database is the *result* of replaying them — never edit tables directly in a
GUI client. To rebuild from scratch:

```bash
dropdb performance_analytics && createdb performance_analytics && npm run migrate && npm run seed
```

## Endpoints

Reads are unauthenticated. Writes need an API key in `X-API-Key: <key>` or
`Authorization: Bearer <key>`.

Common query parameters:

- `units=metric|imperial` — every mark comes back as `{ "cm": 648, "display": "6.48m" }` or
  `{ "cm": 648, "display": "21-03.00" }`. Imperial is rounded **down** to the quarter-inch,
  as US results do.
- `season=indoor|outdoor|indoor-2026|outdoor-2026` — restrict to a season. Omitted = all.

The "field" is every seeded athlete of that gender, scored by their best **legal** mark.
Percentile counts ties as half (the best of 200 is 99.75th), and z-scores use the field's
population standard deviation.

| Method | Route | Returns |
|---|---|---|
| `GET` | `/rankings?event=&gender=` | Ranked field with percentile and z-score (`limit`, `offset`) |
| `GET` | `/athletes/:id/percentile?event=` | Athlete's best vs. the field: percentile, z, the rank they'd hold |
| `GET` | `/target?event=&gender=&percentile=` | Smallest mark that reaches that percentile. Add `athlete=<id>` for your gap to it |
| `GET` | `/athletes/:id/pr?event=` | Legal PR and better wind-aided mark — overall, indoor, outdoor |
| `GET` | `/athletes/:id/progression?event=` | Every mark, season bests, PR timeline per season type, improvement per month |
| `GET` | `/compare?athletes=1,2&event=` | Side-by-side PRs and percentiles; head-to-head record and PR gap for a pair |
| `GET` | `/score?event=&gender=&mark=` | World Athletics points. `mark` is `6.48`, `648cm`, or `21-03.25` |
| `POST` | `/athletes` | `{ name, gender }` → an athlete owned by your key |
| `POST` | `/performances` | `{ athlete_id, event, mark_cm \| mark, wind?, meet_name, meet_date, season_type }` |

`pr_gap` in `/compare` is the first athlete's best minus the second's.

## Seed data

The reference population is **synthetic**: 250 athletes per event × gender. Each athlete's
ability is drawn from a normal distribution tuned to a mixed D1–D3 collegiate field, then
scattered meet-to-meet across four seasons (indoor/outdoor 2025 and 2026) of shared meets,
with year-on-year improvement, outdoor wind (and its effect on the mark), occasional NWI
readings, and HJ marks on a 3 cm bar progression. The generator is seeded, so
`npm run seed` produces the same field every time.

User rows are never touched by reseeding.

### Real data

Ingesting real results from TFRRS is a planned second source, not a replacement. The
owner constraint is written as `source = 'user'`, so adding a `'tfrrs'` value to the
`source` checks is the only schema change it needs.

## Scoring

`/score` converts a mark to World Athletics points — the scale that makes a long jump
comparable to a high jump. The official numbers come from World Athletics' *Scoring Tables
of Athletics* and are **not** in this repo; nothing is guessed. Until they're installed,
`/score` returns `503`.

Put them at `data/wa-scoring.json` (or point `WA_SCORING_TABLE` at another path). Each
event × gender takes either form:

- **Lookup rows**, copied from the official tables: `[points, mark]` pairs. A mark scores
  the highest points value it reaches, exactly as you'd read the printed table.
- **Coefficients** `a`, `b`, `c`, applied as `floor(a · (mark + b)² + c)`, floored at zero.
  Use these only from an official source.

```json
{
  "unit": "m",
  "events": {
    "LJ": { "M": { "table": [[1000, 7.00], [1001, 7.01]] } },
    "HJ": { "F": { "a": 0, "b": 0, "c": 0 } }
  }
}
```

The values above only show the shape — they are not real scoring data. `unit` (`m` or `cm`)
applies to every mark in the file. Events missing from the file return `503`.

## CLI

```bash
npm run build && npm link      # installs `jump` on your PATH
```

```bash
export JUMP_API=http://localhost:3000 JUMP_ATHLETE=<your id> JUMP_GENDER=M JUMP_KEY=<key>

jump pr lj                     # indoor + outdoor PRs
jump rank lj outdoor-2026      # percentile, would-rank, z
jump target lj 90              # the mark for the 90th percentile, and your gap to it
jump score lj 21-03.25
jump add lj 21-03.25 outdoor "Stevens Invite" --wind 1.2 --date 2026-04-11
```

Output is imperial unless `JUMP_UNITS=metric`. The binary is `jump` rather than `pr` because
`/usr/bin/pr` already exists; `alias pr='jump pr'` works if you want the short form.

Heads-up on entering imperial marks: storage is whole centimetres, and 1 cm is about 0.39 in,
so a mark entered as `21-03.25` is stored as 648 cm and displays as `21-03.00`. A stored mark
can read up to a quarter-inch below what was entered.

## Tests

```bash
npm test                                            # unit tests
npm run test:db                                     # once, or to reset
TEST_DATABASE_URL=postgres://localhost:5432/performance_analytics_test npm test   # + API tests
```

## Deploying

Any Node 20+ host with Postgres works (Render, Railway, Fly.io, …).

1. Create a Postgres database and copy its connection string. If the host requires SSL,
   append `?sslmode=require`.
2. Set environment variables: `DATABASE_URL`, `API_KEY_SALT` (a new long random string —
   `openssl rand -base64 32`), and `PORT` if the host doesn't set it.
3. Build command: `npm ci && npm run build`
4. Start command: `npm run migrate && npm start`. Migrating on start is safe: applied
   migrations are skipped.
5. Once, from the host's shell: `npm run seed:prod`, then `npm run create-key:prod -- "phone"`.
6. Check `https://<host>/health`.

Then point the CLI at it with `JUMP_API=https://<host>`.

### iOS Shortcut

In the Shortcuts app, three actions:

1. **Get Contents of URL** —
   `https://<host>/target?event=LJ&gender=M&percentile=90&athlete=<id>&units=imperial`
2. **Get Dictionary Value** — key `target.display` (add a second for `athlete.needed.display`)
3. **Show Result**

Add it to the home screen from the shortcut's share menu. Swap the URL for
`/athletes/<id>/pr?event=LJ&units=imperial` to make a PR shortcut.

## Not doing (yet)

- Projection from improvement slope, consistency stat
- Redis caching — no load to justify it
- Any frontend

## License

ISC
