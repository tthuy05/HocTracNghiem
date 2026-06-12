import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function readEnvDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) {
    return "";
  }

  const match = readFileSync(envPath, "utf8").match(/^DATABASE_URL=(.*)$/m);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
}

function selectedSchemaPath() {
  const provider = selectedProvider();
  return path.join(root, "prisma", provider, "schema.prisma");
}

function selectedProvider() {
  const databaseUrl = readEnvDatabaseUrl();
  return /^postgres(?:ql)?:\/\//i.test(databaseUrl) ? "postgres" : "sqlite";
}

function isSqliteMigrationCommand(args) {
  return (
    (args[0] === "db" && args[1] === "push") ||
    (args[0] === "migrate" && (args[1] === "dev" || args[1] === "deploy"))
  );
}

const prismaBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");
const commandArgs = process.argv.slice(2);
const args = [...commandArgs, "--schema", selectedSchemaPath()];
const result = spawnSync(prismaBin, args, {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if ((result.status ?? 1) !== 0 && selectedProvider() === "sqlite" && isSqliteMigrationCommand(commandArgs)) {
  console.warn("Prisma CLI could not apply SQLite schema changes. Applying local SQL migrations as a fallback.");
  await applySqliteMigrations();
  process.exit(0);
}

process.exit(result.status ?? 1);

async function applySqliteMigrations() {
  const { default: Database } = await import("better-sqlite3");
  const dbPath = sqlitePathFromDatabaseUrl(readEnvDatabaseUrl() || "file:./prisma/sqlite/dev.db");
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const database = new Database(dbPath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);

  const migrationsRoot = path.join(root, "prisma", "sqlite", "migrations");
  const migrationNames = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const appliedStatement = database.prepare('SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = ?');
  const insertStatement = database.prepare(`
    INSERT INTO "_prisma_migrations"
      ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
    VALUES
      (?, ?, CURRENT_TIMESTAMP, ?, NULL, NULL, CURRENT_TIMESTAMP, 1)
  `);

  for (const migrationName of migrationNames) {
    if (appliedStatement.get(migrationName)) {
      continue;
    }

    const migrationSql = readFileSync(path.join(migrationsRoot, migrationName, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(migrationSql).digest("hex");

    if (hasApplicationTables(database)) {
      insertStatement.run(randomUUID(), checksum, migrationName);
      console.log(`Marked existing SQLite schema as migrated for ${migrationName}`);
      continue;
    }

    database.transaction(() => {
      database.exec(migrationSql);
      insertStatement.run(randomUUID(), checksum, migrationName);
    })();

    console.log(`Applied SQLite migration ${migrationName}`);
  }

  database.close();
}

function sqlitePathFromDatabaseUrl(databaseUrl) {
  const rawPath = databaseUrl.replace(/^file:/i, "");
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(root, rawPath);
}

function hasApplicationTables(database) {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'StudySet'")
    .get();
  return Boolean(row);
}
