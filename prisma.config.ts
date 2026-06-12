import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return "file:./prisma/sqlite/dev.db";
  }

  const match = readFileSync(envPath, "utf8").match(/^DATABASE_URL=(.*)$/m);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : "file:./prisma/sqlite/dev.db";
}

const databaseUrl = readDatabaseUrl();
const providerFolder = /^postgres(?:ql)?:\/\//i.test(databaseUrl) ? "postgres" : "sqlite";

export default defineConfig({
  schema: `prisma/${providerFolder}/schema.prisma`,
  datasource: {
    url: databaseUrl,
  },
  migrations: {
    path: `prisma/${providerFolder}/migrations`,
  },
});
