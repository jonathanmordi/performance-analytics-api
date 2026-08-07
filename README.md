# Performance Analytics API

A REST API serving track & field performance analytics for the horizontal and vertical
jumps. A seeded reference population powers rankings, percentiles, and World Athletics
scoring; a thin authenticated write path lets an athlete add their own marks and see where
they land in the field.

No frontend — this is the API.

## Status

Early. The schema is in place; the analytics are being built.

- [x] Project scaffolding (Express, TypeScript, Postgres, Jest)
- [x] Initial schema migration — `athletes`, `performances`, `api_keys`
- [ ] Synthetic seed generator
- [ ] Read endpoints (rankings, percentiles, progression, PRs, compare)
- [ ] World Athletics scoring
- [ ] API-key auth and the write path

## Stack

TypeScript · Express 5 · Postgres 16 · Jest · `node-pg-migrate`

## Getting started

Requires Node 20+ and a running Postgres 16.

```bash
npm install
cp .env.example .env        # then edit DATABASE_URL to match your setup
createdb performance_analytics
npm run migrate             # apply the schema
npm run dev                 # http://localhost:3000
```

Check it's alive:

```bash
curl http://localhost:3000/health
```

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the API with ts-node |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm test` | Run the Jest suite |
| `npm run migrate` | Apply pending migrations |
| `npm run migrate:down` | Roll back the most recent migration |
| `npm run migrate:create <name>` | Scaffold a new migration file |

## Data model

Three tables. Marks are stored as **integer centimetres** throughout — no floats, no unit
ambiguity, and exact comparisons for ranking.

**`athletes`** — `id`, `name`, `gender` (M/F), `source` (`seed` \| `user`), `owner_key`
(FK to `api_keys`, null for seed rows)

**`performances`** — `id`, `athlete_id`, `event` (LJ/TJ/HJ), `mark_cm`, `wind` (m/s, null
for high jump), `legal` (wind is null or ≤ 2.0), `meet_name`, `meet_date`, `source`

**`api_keys`** — `id`, `key_hash`, `label`, `created_at`. Keys are stored hashed and never
in plaintext.

Rankings and percentiles run against `source='seed'`; progression runs against an
individual athlete's own rows.

### Migrations

The schema lives in `db/migrations/` as timestamped SQL files, each with an up and a down
section. The database is the *result* of replaying them — never edit tables directly in a
GUI client. To rebuild from scratch:

```bash
dropdb performance_analytics && createdb performance_analytics && npm run migrate
```

## Endpoints

Reads are the product and are unauthenticated. Writes require an API key.

| Method | Route | Returns |
|---|---|---|
| `GET` | `/athletes/:id/progression?event=` | History, season bests, PR timeline, improvement slope |
| `GET` | `/athletes/:id/pr?event=` | Current PR, legal vs wind-aided |
| `GET` | `/athletes/:id/percentile?event=` | Where the athlete sits in the seeded field |
| `GET` | `/rankings?event=&gender=` | Ranked field with percentile and z-score |
| `GET` | `/compare?athletes=1,2&event=` | Head-to-head across two athletes |
| `GET` | `/score?event=&mark=&gender=` | World Athletics points (stateless) |
| `POST` | `/athletes` | Create an athlete you own — **API key required** |
| `POST` | `/performances` | Add a mark to an athlete you own — **API key required** |

## Seed data

The reference population is **synthetic** — athlete ability is drawn from a normal
distribution tuned per event and gender, with individual marks scattered around each
athlete's own ability across a season. This exercises every analytics query exactly as real
data would, without a scraping dependency.

Ingesting real results from TFRRS is planned but deliberately out of scope for now.

## Not doing (yet)

- Redis caching — no load to justify it
- Real-data ingest from TFRRS
- Any frontend

## License

ISC