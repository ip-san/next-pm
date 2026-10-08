import { execFile } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import type { EnvironmentFacts, InstallationFacts } from "@/application/admin/installation-info";
import { verifyPassword } from "@/domain/user/password";
import { isActiveUser } from "@/domain/user/entity";
import { db } from "@/infrastructure/db/client";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { STORAGE_DIR } from "@/infrastructure/storage/fs-attachment-store";

const run = promisify(execFile);

/** The checks AdminController#info runs, gathered from the real installation. */
export async function gatherInstallationFacts(): Promise<InstallationFacts> {
  const admin = await new DrizzleUserRepository().findByLogin("admin");
  const defaultAdminPasswordInUse = Boolean(
    admin && isActiveUser(admin) && verifyPassword("admin", admin.passwordSalt, admin.passwordHash),
  );
  return {
    defaultAdminPasswordInUse,
    storageWritable: await isWritableDirectory(STORAGE_DIR),
    pendingMigrations: await countPendingMigrations(),
  };
}

async function isWritableDirectory(path: string): Promise<boolean> {
  try {
    await mkdir(path, { recursive: true });
    await access(path, 2 /* fs.constants.W_OK */);
    return true;
  } catch {
    return false;
  }
}

/**
 * Journal entries that the database has not recorded. When the journal is not present in this
 * deployment the answer is unknown, and an unknown state is reported as pending rather than passed.
 */
async function countPendingMigrations(): Promise<number> {
  let journalEntries: number;
  try {
    const journal = JSON.parse(await readFile(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")) as {
      entries: unknown[];
    };
    journalEntries = journal.entries.length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  const result = await db.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
  const applied = Number(result.rows[0]?.n ?? 0);
  return Math.max(journalEntries - applied, 0);
}

/** The environment lines, read the way Redmine::Info.environment reads Ruby, Rails and the SCM tools. */
export async function gatherEnvironmentFacts(): Promise<EnvironmentFacts> {
  const pkg = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
    version: string;
    dependencies?: Record<string, string>;
  };
  const versionResult = await db.execute<{ v: string }>(sql`show server_version`);
  return {
    appVersion: pkg.version,
    nextVersion: pkg.dependencies?.next ?? "unknown",
    runtime: typeof Bun !== "undefined" ? `Bun ${Bun.version}` : `Node ${process.version}`,
    databaseVersion: String(versionResult.rows[0]?.v ?? "unknown"),
    scmVersions: await Promise.all([
      toolVersion("Git", "git", ["--version"]),
      toolVersion("Mercurial", "hg", ["--version"]),
      toolVersion("Subversion", "svn", ["--version", "--quiet"]),
    ]),
  };
}

async function toolVersion(name: string, command: string, args: string[]): Promise<{ name: string; version: string | null }> {
  try {
    const { stdout } = await run(command, args, { timeout: 3000 });
    return { name, version: stdout.split("\n")[0]?.trim() || null };
  } catch {
    return { name, version: null };
  }
}
