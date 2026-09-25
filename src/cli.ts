#!/usr/bin/env node
// Day-to-day interface over the API. Run `jump help` for usage.

const USAGE = `usage:
  jump pr lj
  jump rank lj [indoor|outdoor|indoor-2026]
  jump target lj 90 [season]
  jump score lj 21-03.25
  jump add lj 21-03.25 outdoor "Stevens Invite" [--wind 1.2] [--date 2026-04-11]

configured by env vars (put them in your shell profile):
  JUMP_API      base URL             default http://localhost:3000
  JUMP_ATHLETE  your athlete id      needed for pr / rank / add, and the gap in target
  JUMP_GENDER   M or F               needed for target / score
  JUMP_UNITS    imperial | metric    default imperial
  JUMP_KEY      API key              needed for add`;

const API = (process.env.JUMP_API ?? "http://localhost:3000").replace(/\/$/, "");
const UNITS = process.env.JUMP_UNITS ?? "imperial";

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) die(`set ${name} (see: jump help)`);
  return v;
}

async function api(path: string, params: Record<string, string | undefined>, init?: RequestInit) {
  const qs = new URLSearchParams({ units: UNITS });
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, v);
  let res: Response;
  try {
    res = await fetch(`${API}${path}?${qs}`, init);
  } catch {
    die(`can't reach ${API} — is the API running?`);
  }
  const body = (await res.json()) as any;
  if (!res.ok) die(body.error ?? `HTTP ${res.status}`);
  return body;
}

const ord = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = Math.round(n) % 100;
  return `${Math.round(n)}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

function prLine(label: string, pr: any): string {
  if (!pr.legal && !pr.wind_aided) return `${label.padEnd(8)} —`;
  let line = `${label.padEnd(8)} `;
  if (pr.legal) {
    const w = pr.legal.wind !== null ? ` (${pr.legal.wind >= 0 ? "+" : ""}${pr.legal.wind})` : "";
    line += `${pr.legal.mark.display}${w}  ${pr.legal.meet_name}, ${pr.legal.meet_date}`;
  } else {
    line += "no legal mark";
  }
  if (pr.wind_aided) line += `\n${"".padEnd(9)}${pr.wind_aided.mark.display}w (${pr.wind_aided.wind === null ? "NWI" : `+${pr.wind_aided.wind}`})  ${pr.wind_aided.meet_name}`;
  return line;
}

const commands: Record<string, (args: string[]) => Promise<void>> = {
  async pr([event]) {
    if (!event) die("usage: jump pr <lj|tj|hj>");
    const r = await api(`/athletes/${env("JUMP_ATHLETE")}/pr`, { event });
    console.log(`${r.athlete.name} — ${r.event} PRs`);
    console.log(prLine("indoor", r.indoor));
    console.log(prLine("outdoor", r.outdoor));
  },

  async rank([event, season]) {
    if (!event) die("usage: jump rank <event> [season]");
    const r = await api(`/athletes/${env("JUMP_ATHLETE")}/percentile`, { event, season });
    console.log(
      `${r.mark.display}  ${ord(r.percentile)} percentile — would rank ${r.would_rank} of ${r.field_size}` +
        `  (z ${r.z >= 0 ? "+" : ""}${r.z}, ${r.season})`,
    );
  },

  async target([event, pct, season]) {
    if (!event || !pct) die("usage: jump target <event> <percentile> [season]");
    const r = await api("/target", {
      event,
      percentile: pct,
      season,
      gender: env("JUMP_GENDER"),
      athlete: process.env.JUMP_ATHLETE,
    });
    let line = `${r.target.display} for the ${ord(r.percentile)} percentile (rank ${r.would_rank} of ${r.field_size})`;
    if (r.athlete?.pr) {
      line += r.athlete.needed.cm > 0
        ? `\nyou: ${r.athlete.pr.display} — need +${r.athlete.needed.display}`
        : `\nyou: ${r.athlete.pr.display} — already there`;
    }
    console.log(line);
  },

  async score([event, mark]) {
    if (!event || !mark) die("usage: jump score <event> <mark>");
    const r = await api("/score", { event, mark, gender: env("JUMP_GENDER") });
    console.log(`${r.mark.display} = ${r.points} pts`);
  },

  async add(args) {
    const flags: Record<string, string> = {};
    const pos: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i]!;
      if (a.startsWith("--")) flags[a.slice(2)] = args[++i] ?? "";
      else pos.push(a);
    }
    const [event, mark, seasonType, ...meet] = pos;
    if (!event || !mark || !seasonType || !meet.length) {
      die('usage: jump add <event> <mark> <indoor|outdoor> "<meet name>" [--wind 1.2] [--date YYYY-MM-DD]');
    }
    const date = flags.date ?? new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
    const r = await api("/performances", {}, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env("JUMP_KEY") },
      body: JSON.stringify({
        athlete_id: Number(env("JUMP_ATHLETE")),
        event,
        mark,
        season_type: seasonType,
        meet_name: meet.join(" "),
        meet_date: date,
        wind: flags.wind !== undefined ? Number(flags.wind) : null,
      }),
    });
    console.log(`added ${r.event} ${r.mark.display}${r.legal ? "" : " (not legal)"} — ${r.meet_name}, ${r.meet_date} (${r.season})`);
  },

  async help() {
    console.log(USAGE);
  },
};

const [cmd = "help", ...rest] = process.argv.slice(2);
const run = commands[cmd];
if (!run) die(`unknown command: ${cmd} (try: jump help)`);
run(rest);
