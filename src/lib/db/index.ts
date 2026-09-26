import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// One pool per process. Next's dev server reloads modules, so stash it globally
// to avoid leaking connections on every hot reload.
const globalForDb = globalThis as unknown as { _sql?: ReturnType<typeof postgres> };

const client = globalForDb._sql ?? postgres(env.DATABASE_URL, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb._sql = client;

export const db = drizzle(client, { schema });
export { schema };
