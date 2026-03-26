import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";
import * as schema from "./schema.js";

const queryClient = postgres(config.database.url, {
  max: parseInt(process.env.DB_POOL_MAX || "20", 10),
  idle_timeout: 30,
  connect_timeout: 10,
});

export { queryClient };

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
