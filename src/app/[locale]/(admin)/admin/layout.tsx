import { getMessages, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { AdminIntl } from "@/components/admin/admin-intl";
import { AdminShell } from "@/components/admin/admin-shell";
import { verifySession } from "@/server/auth/session";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

/**
 * The admin area has its own chrome (no storefront header or footer). The nested AdminIntl adds the
 * `admin` namespace that the root provider leaves out.
 *
 * This is the AUTHORITATIVE server-side gate: verifySession() confirms a live, non-revoked session
 * row (the Proxy's cookie check is only optimistic UX). No session → redirect to the login page.
 */
export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await verifySession();
  if (!session || session.role !== "admin") {
    redirect(`/${locale === "ar" ? "ar" : "en"}/login/`);
  }

  const messages = await getMessages();
  return (
    <AdminIntl admin={messages.admin}>
      <AdminShell>{children}</AdminShell>
    </AdminIntl>
  );
}
