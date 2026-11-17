import { getMessages, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { AdminIntl } from "@/components/admin/admin-intl";
import { AdminShell } from "@/components/admin/admin-shell";
import { LiveProvider } from "@/lib/live";
import { verifySession } from "@/server/auth/session";
import { getAdminCatalogData } from "@/server/read/catalog";
import { getHomeData } from "@/server/read/home";
import { getSettingsData } from "@/server/read/settings";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

/**
 * The admin area has its own chrome (no storefront header or footer). The nested AdminIntl adds the
 * `admin` namespace that the root provider leaves out.
 *
 * This is the AUTHORITATIVE server-side gate: verifySession() confirms a live, non-revoked session
 * row (the Proxy's cookie check is only optimistic UX). No session → redirect to the login page.
 *
 * The admin needs the FULL catalog — hidden products and the internal `todo` notes — which the
 * storefront read (getCatalogData, wired into the [locale] layout's <LiveProvider>) now omits (A01).
 * So a nested <LiveProvider> here, fed by the requireAdmin-gated getAdminCatalogData, OVERRIDES the
 * storefront catalog for the whole admin subtree (product list / editor / stock / analysis / home
 * editor), while anonymous storefront payloads keep the hidden-stripped shape.
 */
export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await verifySession();
  if (!session || session.role !== "admin") {
    redirect(`/${locale === "ar" ? "ar" : "en"}/login/`);
  }

  // Read AFTER the gate (getAdminCatalogData's own requireAdmin would otherwise throw for a guest,
  // instead of the redirect above). settings + home round out the LiveData the provider needs.
  const [messages, catalog, settings, home] = await Promise.all([
    getMessages(),
    getAdminCatalogData(),
    getSettingsData(),
    getHomeData(),
  ]);

  return (
    <AdminIntl admin={messages.admin}>
      <LiveProvider value={{ catalog, settings, home }}>
        <AdminShell>{children}</AdminShell>
      </LiveProvider>
    </AdminIntl>
  );
}
