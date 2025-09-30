import { readdirSync, readFileSync } from "fs";
import { join } from "path";

export const runMigrations = (db) => {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    id TEXT PRIMARY KEY
  );`);
  const migrationsDir = join(process.cwd(), "migrations");
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const id = file.split("_")[0];
    const row = db.prepare("SELECT 1 FROM migrations WHERE id = ?").get(id);
    if (row) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    db.exec("BEGIN");
    db.exec(sql);
    db.prepare("INSERT INTO migrations (id) VALUES (?)").run(id);
    db.exec("COMMIT");
  }
};
