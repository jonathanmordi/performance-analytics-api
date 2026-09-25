// End-to-end against a real Postgres. Needs a migrated test database:
//
//   npm run test:db
//   TEST_DATABASE_URL=postgres://localhost:5432/performance_analytics_test npm test
//
// Skipped when TEST_DATABASE_URL isn't set.

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("API", () => {
  let server: Server;
  let base: string;
  let db: typeof import("./db");
  let key: string;
  let otherKey: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.API_KEY_SALT = "test-salt";
    db = await import("./db");
    const { createApp } = await import("./app");
    const { createKey } = await import("./auth");

    await db.query("TRUNCATE performances, athletes, api_keys RESTART IDENTITY CASCADE");
    // Seeded field: five men in LJ, bests 600..640 legal, plus one faster
    // wind-aided mark that must not count.
    for (const [i, best] of [600, 610, 620, 630, 640].entries()) {
      const { rows } = await db.query(
        "INSERT INTO athletes (name, gender, source) VALUES ($1, 'M', 'seed') RETURNING id",
        [`Seed ${i}`],
      );
      await db.query(
        `INSERT INTO performances (athlete_id, event, mark_cm, wind, meet_name, meet_date, season_type, source)
         VALUES ($1, 'LJ', $2, 1.0, 'Seed Meet', '2026-04-11', 'outdoor', 'seed'),
                ($1, 'LJ', $2 + 100, 3.5, 'Windy Meet', '2026-04-18', 'outdoor', 'seed')`,
        [rows[0].id, best],
      );
    }
    key = (await createKey("test")).key;
    otherKey = (await createKey("other")).key;

    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await db?.pool.end();
  });

  const get = async (path: string) => {
    const res = await fetch(base + path);
    return { status: res.status, body: (await res.json()) as any };
  };
  const post = async (path: string, body: unknown, k: string | null = key) => {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(k ? { "x-api-key": k } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  };

  it("ranks the seeded field on legal marks only", async () => {
    const { status, body } = await get("/rankings?event=LJ&gender=M");
    expect(status).toBe(200);
    expect(body.field.size).toBe(5);
    expect(body.rankings.map((r: any) => r.mark.cm)).toEqual([640, 630, 620, 610, 600]);
    expect(body.rankings[2].percentile).toBe(50);
    expect(body.rankings[2].z).toBe(0);
  });

  it("answers /target", async () => {
    const { body } = await get("/target?event=LJ&gender=M&percentile=90&units=imperial");
    expect(body.target.cm).toBe(640); // 4 below + tie/2 = 4.5 of 5
    expect(body.target.display).toBe("20-11.75");
  });

  describe("write path", () => {
    let athleteId: number;

    it("requires a valid key", async () => {
      expect((await post("/athletes", { name: "x", gender: "M" }, null)).status).toBe(401);
      expect((await post("/athletes", { name: "x", gender: "M" }, "wrong")).status).toBe(401);
    });

    it("creates an owned athlete and adds marks", async () => {
      const a = await post("/athletes", { name: "Me", gender: "M" });
      expect(a.status).toBe(201);
      athleteId = a.body.id;

      const indoor = await post("/performances", {
        athlete_id: athleteId, event: "LJ", mark: "20-08", meet_name: "Opener",
        meet_date: "2025-12-06", season_type: "indoor",
      });
      expect(indoor.status).toBe(201);
      expect(indoor.body.season).toBe("indoor-2026");
      expect(indoor.body.legal).toBe(true);

      const nwi = await post("/performances", {
        athlete_id: athleteId, event: "LJ", mark_cm: 660, meet_name: "No Gauge",
        meet_date: "2026-04-11", season_type: "outdoor",
      });
      expect(nwi.body.legal).toBe(false);

      const ok = await post("/performances", {
        athlete_id: athleteId, event: "LJ", mark_cm: 625, wind: 1.9, meet_name: "Conf",
        meet_date: "2026-05-02", season_type: "outdoor",
      });
      expect(ok.body.legal).toBe(true);
    });

    it("rejects marks on athletes the key doesn't own", async () => {
      const r = await post(
        "/performances",
        { athlete_id: athleteId, event: "LJ", mark_cm: 600, meet_name: "x", meet_date: "2026-05-02", season_type: "outdoor" },
        otherKey,
      );
      expect(r.status).toBe(403);
    });

    it("rejects wind on HJ and impossible dates", async () => {
      const base = { athlete_id: athleteId, meet_name: "x", season_type: "outdoor" };
      expect((await post("/performances", { ...base, event: "HJ", mark_cm: 190, wind: 1, meet_date: "2026-05-02" })).status).toBe(400);
      expect((await post("/performances", { ...base, event: "LJ", mark_cm: 600, meet_date: "2026-02-30" })).status).toBe(400);
    });

    it("places a user athlete against the field without joining it", async () => {
      const { body } = await get(`/athletes/${athleteId}/percentile?event=LJ&season=outdoor`);
      expect(body.mark.cm).toBe(625);
      expect(body.percentile).toBe(60);
      expect(body.would_rank).toBe(3);
      expect(body.field_size).toBe(6);

      const rankings = await get("/rankings?event=LJ&gender=M");
      expect(rankings.body.field.size).toBe(5);
    });

    it("keeps indoor and outdoor PRs apart", async () => {
      const { body } = await get(`/athletes/${athleteId}/pr?event=LJ`);
      expect(body.indoor.legal.mark.cm).toBe(630);
      expect(body.outdoor.legal.mark.cm).toBe(625);
      expect(body.outdoor.wind_aided.mark.cm).toBe(660);
    });
  });

  it("404s unknown athletes and routes", async () => {
    expect((await get("/athletes/99999/pr?event=LJ")).status).toBe(404);
    expect((await get("/athletes//pr?event=LJ")).status).toBe(404);
  });
});
