import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AttachmentStorage } from "@/domain/attachment/repository";

const STORAGE_DIR = process.env.ATTACHMENTS_STORAGE_PATH ?? join(process.cwd(), "storage", "attachments");

/**
 * The storage key is always a server-generated UUID (see save()) and is only ever taken from
 * our own database rows on read/delete — a client never supplies the key directly — so join()
 * here can't be steered outside STORAGE_DIR.
 */
function pathFor(key: string): string {
  return join(STORAGE_DIR, key);
}

export class FsAttachmentStore implements AttachmentStorage {
  async save(data: Buffer): Promise<string> {
    await mkdir(STORAGE_DIR, { recursive: true });
    const key = randomUUID();
    await writeFile(pathFor(key), data);
    return key;
  }

  async read(key: string): Promise<Buffer> {
    return readFile(pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await rm(pathFor(key), { force: true });
  }
}
