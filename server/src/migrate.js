import Database from "better-sqlite3";
import { join } from "path";
import { runMigrations } from "./migrations.js";

const db = new Database(process.env.DATABASE_URL || join(process.cwd(), "data.db"));
db.pragma("journal_mode = WAL");
runMigrations(db);
db.close();
