import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { twofaBackupCodes } from "@/infrastructure/db/schema/twofa-backup-codes";
import type { TwofaBackupCodeRepository } from "@/domain/twofa/backup-code-repository";

export class DrizzleTwofaBackupCodeRepository implements TwofaBackupCodeRepository {
  async replaceForUser(userId: string, codeHashes: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(twofaBackupCodes).where(eq(twofaBackupCodes.userId, userId));
      if (codeHashes.length > 0) {
        await tx.insert(twofaBackupCodes).values(codeHashes.map((codeHash) => ({ userId, codeHash })));
      }
    });
  }

  async consumeIfMatches(userId: string, codeHash: string): Promise<boolean> {
    // A single DELETE...RETURNING is the atomicity boundary: two concurrent attempts with the
    // same code can never both succeed, since only one of them can actually delete the row.
    const deleted = await db
      .delete(twofaBackupCodes)
      .where(and(eq(twofaBackupCodes.userId, userId), eq(twofaBackupCodes.codeHash, codeHash)))
      .returning({ id: twofaBackupCodes.id });
    return deleted.length > 0;
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await db.delete(twofaBackupCodes).where(eq(twofaBackupCodes.userId, userId));
  }
}
