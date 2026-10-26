import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseUrl, env } from "../lib/env";

export type Db = ReturnType<typeof createDb>;

export function createDb(url: string) {
  // max: 5 -> a page's parallel queries (Promise.all) really run in parallel; with 1 they queued one by one.
  //   Safe behind the Supabase transaction pooler, which multiplexes these onto few server connections.
  // prepare: false -> works behind transaction poolers (Neon / Supabase / pgbouncer).
  // idle_timeout -> release idle connections of a warm instance instead of holding pooler slots.
  const client = postgres(url, { max: 5, prepare: false, idle_timeout: 20 });
  return drizzle(client, { schema });
}

let cached: Db | undefined;

export function getDb(): Db {
  cached ??= createDb(databaseUrl() ?? env("DATABASE_URL"));
  return cached;
}

export { schema };
