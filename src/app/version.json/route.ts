// Static /version.json holding the build ID. Open pages compare it with their own and
// reload once when a newer version has been published (see components/layout/update-check.tsx).
export const dynamic = "force-static";

export function GET() {
  return Response.json({ id: process.env.NEXT_PUBLIC_BUILD_ID ?? "" });
}
