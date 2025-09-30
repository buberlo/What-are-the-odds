import Database from "better-sqlite3";
import { join } from "path";

const db = new Database(process.env.DATABASE_URL || join(process.cwd(), "data.db"));
db.pragma("journal_mode = WAL");

db.function("now_ts", () => new Date().toISOString());

db.exec("PRAGMA foreign_keys = ON");

export default db;
