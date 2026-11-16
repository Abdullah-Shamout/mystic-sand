import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { verifySession } from "@/server/auth/session";

// The admin sign-in page. The admin layout redirects here when there is no live session; a visitor
// who already has one is bounced straight to the admin. The session cookie is set by the `login`
// Server Action the form submits to. Rendered outside the admin layout, so it has no admin chrome.
export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await verifySession();
  if (session?.role === "admin") redirect(`/${locale === "ar" ? "ar" : "en"}/admin/`);

  const sp = await searchParams;
  const nextRaw = sp?.next;
  const next = typeof nextRaw === "string" ? nextRaw : undefined;

  const t = await getTranslations("common");
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16 outline-none"
    >
      <h1 className="caps font-serif text-title font-medium">{t("login.title")}</h1>
      <div className="mt-8">
        <LoginForm autoFocus next={next} />
      </div>
    </main>
  );
}
