import { Pool, types } from "pg";

// Return DATE columns as 'YYYY-MM-DD' strings instead of JS Dates, which pg
// would build at local midnight and shift when serialised as UTC.
types.setTypeParser(1082, (v) => v);
// numeric (wind) and bigint (count(*)) as JS numbers. Both stay far inside
// the safe-integer range here.
types.setTypeParser(1700, (v) => Number(v));
types.setTypeParser(20, (v) => Number(v));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const query = (text: string, params?: unknown[]) =>
  pool.query(text, params);
