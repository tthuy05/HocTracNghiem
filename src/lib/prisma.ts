import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? "file:./prisma/sqlite/dev.db";
}

function createAdapter() {
  const databaseUrl = getDatabaseUrl();

  if (/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    return new PrismaPg({ connectionString: databaseUrl });
  }

  return new PrismaBetterSqlite3({ url: databaseUrl });
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
