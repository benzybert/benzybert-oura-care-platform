import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "../lib/env";

export type Db = ReturnType<typeof createDb>;

export function createDb(url: string) {
  // max: 1 -> one connection per serverless instance.
  // prepare: false -> works behind transaction poolers (Neon / Supabase / pgbouncer).
  const client = postgres(url, { max: 1, prepare: false });
  return drizzle(client, { schema });
}

let cached: Db | undefined;

export function getDb(): Db {
  cached ??= createDb(env("DATABASE_URL"));
  return cached;
}

export { schema };
