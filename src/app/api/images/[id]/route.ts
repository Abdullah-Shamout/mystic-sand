import { eq } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { storage } from "@/server/storage";

// GET /api/images/<id>/ — streams an admin-uploaded image from storage.
//
// The id is content-stable (an id always maps to the same bytes), so responses are cached
// `immutable` for a year. Looks the row up by id (parameterized) and reads the file by the row's
// storagePath — the URL id never touches the filesystem path. Runs only at request time (route
// handlers are not prerendered), so the DB-free build never calls it.

const ID_RE = /^[A-Za-z0-9_]{1,80}$/;

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/images/[id]">,
): Promise<Response> {
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return new Response("Bad request", { status: 400 });

  const [row] = await getDb()
    .select({ mime: schema.images.mime, storagePath: schema.images.storagePath })
    .from(schema.images)
    .where(eq(schema.images.id, id))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });

  const bytes = await storage.get(row.storagePath);
  if (!bytes) return new Response("Not found", { status: 404 });

  // Copy into a fresh Uint8Array so the body type is a BodyInit (a node Buffer's ArrayBufferLike
  // backing is not assignable); images are small, so the copy is cheap.
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
