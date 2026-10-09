import { getMessages, setRequestLocale } from "next-intl/server";
import { AdminIntl } from "@/components/admin/admin-intl";
import { AdminShell } from "@/components/admin/admin-shell";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

/**
 * The admin area has its own chrome (no storefront header/footer and no UpdateCheck). The
 * nested AdminIntl adds the `admin` namespace that the root provider leaves out.
 */
export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <AdminIntl admin={messages.admin}>
      <AdminShell>{children}</AdminShell>
    </AdminIntl>
  );
}
