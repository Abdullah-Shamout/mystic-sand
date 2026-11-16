import { requireAdmin } from "@/server/auth/require-admin";
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
  await requireAdmin();

  let form: FormData;
  try {
    form = await request.formData();
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
