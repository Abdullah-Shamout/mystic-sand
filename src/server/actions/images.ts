"use server";

import { desc, eq } from "drizzle-orm";

import { UPLOAD_PREFIX, uploadIdFromKey } from "@/lib/upload-key";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb, schema } from "@/server/db";
import { storage } from "@/server/storage";

// Admin Server Actions for the reusable image library. The upload itself is a multipart Route
// Handler (src/app/api/admin/images/route.ts, needs the raw body); listing and deleting are plain
// actions. Both gate on requireAdmin() so Phase 4 is a one-function change.

/** Every uploaded image, newest first, as `u:<id>` keys for the library dialog. */
export async function listImages(): Promise<Array<{ key: string; kind: string }>> {
  await requireAdmin();
  const rows = await getDb()
    .select({ id: schema.images.id, kind: schema.images.kind })
    .from(schema.images)
    .orderBy(desc(schema.images.createdAt));
  return rows.map((r) => ({ key: `${UPLOAD_PREFIX}${r.id}`, kind: r.kind }));
}

/** Removes an uploaded image (its file and its row). No-op if it is already gone. */
export async function deleteImage(key: string): Promise<void> {
  await requireAdmin();
  const id = uploadIdFromKey(key);
  const db = getDb();
  const [row] = await db
    .select({ storagePath: schema.images.storagePath })
    .from(schema.images)
    .where(eq(schema.images.id, id))
    .limit(1);
  if (!row) return;
  await storage.delete(row.storagePath);
  await db.delete(schema.images).where(eq(schema.images.id, id));
}
