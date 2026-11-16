import { requireAdmin, UnauthorizedError } from "@/server/auth/require-admin";
import {
  ImageProcessError,
  isImageProfile,
  MAX_UPLOAD_BYTES,
  storeUploadedImage,
} from "@/server/images/process";

// POST /api/admin/images/ — admin image upload (multipart form-data).
//
// Fields: `file` (the picked image) and `profile` ("packshot" | "photo" | "story", which sets the
// re-encode caps — never client-supplied pixel numbers). The bytes are re-encoded server-side with
// sharp (src/server/images/process.ts), written to storage and recorded in the `images` table.
// Returns `{ key: "u:<id>", url }`. Errors return `{ error: <ImageError key> }` so the editor can
// reuse its existing toasts. This runs only at request time, never at build.

function fail(key: ImageProcessError["key"], status: number): Response {
  return Response.json({ error: key }, { status });
}

export async function POST(request: Request): Promise<Response> {
  // A denial must be a 401, not a 500: catch the thrown UnauthorizedError and map it here.
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError) return Response.json({ error: "unauthorized" }, { status: 401 });
    throw error;
  }

  // Cap the body BEFORE buffering it: request.formData() would read the entire (unbounded) body into
  // memory first. Stream it through a byte counter and parse only the capped buffer, bounding
  // per-request memory. The canonical body limit is the Phase 9 reverse proxy; this is defense-in-depth.
  if (!request.body) return fail("notImage", 400);
  const CAP = MAX_UPLOAD_BYTES + 1024 * 1024; // image cap + headroom for multipart framing + the profile field
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > CAP) {
        await reader.cancel();
        return fail("tooLarge", 413);
      }
      chunks.push(value);
    }
  } catch {
    return fail("notImage", 400);
  }

  let form: FormData;
  try {
    // Re-wrap the buffered bytes with the original headers (the multipart content-type + boundary) so
    // formData() parses exactly what we counted.
    const buffered = new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) });
    form = await buffered.formData();
  } catch {
    return fail("notImage", 400);
  }

  const file = form.get("file");
  const profile = form.get("profile");
  if (!(file instanceof File) || file.size === 0) return fail("notImage", 400);
  if (!isImageProfile(profile)) return fail("notImage", 400);
  if (file.size > MAX_UPLOAD_BYTES) return fail("tooLarge", 413);

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const { key, url } = await storeUploadedImage(bytes, profile);
    return Response.json({ key, url });
  } catch (error) {
    if (error instanceof ImageProcessError) return fail(error.key, error.status);
    throw error; // genuine server error → 500
  }
}
