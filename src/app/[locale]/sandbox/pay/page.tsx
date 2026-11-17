import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { formatKWD } from "@/lib/money";
import { getSandboxSession, setSandboxOutcome } from "@/server/payments/sandbox";
import type { PaymentResult } from "@/server/payments/types";

// The hosted sandbox "payment page". It stands in for a provider's hosted page: the shopper lands
// here from gateway.initiate(), picks an outcome, and is sent back to the order's returnUrl.
//
// HARD RULE: no card number, PIN, CVV, OTP or any payment-credential input anywhere on this page.
// The only controls are three buttons (Approve / Decline / Cancel), each its own <form> wired to a
// button-only Server Action. (React injects its own hidden $ACTION_* fields into action forms; those
// are the framework's action plumbing, not inputs we render.)

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SHELL = "mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16 outline-none";

export default async function SandboxPayPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "sandbox" });

  const sp = await searchParams;
  const refRaw = sp.ref;
  const ref = typeof refRaw === "string" ? refRaw : undefined;
  const session = ref ? getSandboxSession(ref) : undefined;

  // Missing ref / unknown / expired session → a safe view (still buttons-and-text only, no inputs).
  if (!ref || !session) {
    return (
      <main id="main" tabIndex={-1} className={`${SHELL} text-center`}>
        <h1 className="caps font-serif text-title font-medium">{t("notFound.title")}</h1>
        <p className="mt-4 text-sm text-muted">{t("notFound.text")}</p>
      </main>
    );
  }

  // Narrow once, so the nested Server Action closes over a plain `string` (TS does not carry the
  // guard's narrowing into a nested function body).
  const activeRef = ref;

  // Server Action. A Server Action is a POST endpoint, so its bound `outcome` argument is UNTRUSTED
  // (the framework only encrypts captured closure variables, not necessarily bind args): it is
  // whitelisted at runtime below. The session is RE-LOADED from the store so a stale closure can't
  // dictate the amount or return target. redirect() throws, so it sits outside any try.
  async function decide(outcome: PaymentResult): Promise<void> {
    "use server";
    const allowed: readonly PaymentResult[] = ["CAPTURED", "NOT CAPTURED", "CANCELED"];
    const homeHref = `/${locale === "ar" ? "ar" : "en"}/`;
    if (!allowed.includes(outcome)) redirect(homeHref);

    const current = getSandboxSession(activeRef);
    if (!current) redirect(homeHref);

    // Set-once: this is a no-op if the session was already decided. Report the STORED outcome, not
    // the clicked one, so a second click (Back then a different button) can't disagree with the
    // recorded result.
    setSandboxOutcome(activeRef, outcome);
    const result = getSandboxSession(activeRef)?.outcome ?? outcome;

    const back = new URL(current.returnUrl);
    back.searchParams.set("providerPaymentId", activeRef);
    back.searchParams.set("result", result);
    redirect(back.toString());
  }

  const amount = formatKWD(session.amountFils, locale as Locale);

  return (
    <main id="main" tabIndex={-1} className={SHELL}>
      <div className="rounded-lg border border-line bg-paper p-6 shadow-sm">
        <p className="caps text-[12px] tracking-wide text-muted">{t("title")}</p>
        <p className="mt-1 text-[12px] text-muted">{t("subtitle")}</p>

        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">{t("order")}</dt>
            <dd className="font-medium">
              <bdi>{session.orderId}</bdi>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">{t("amount")}</dt>
            <dd className="font-serif text-lg font-medium">
              <bdi>{amount}</bdi>
            </dd>
          </div>
        </dl>

        <p className="mt-5 text-[12px] text-muted">{t("note")}</p>

        <div className="mt-6 flex flex-col gap-3">
          <form action={decide.bind(null, "CAPTURED")}>
            <button
              type="submit"
              className="w-full rounded-md bg-ink px-4 py-3 text-sm font-medium text-paper"
            >
              {t("approve")}
            </button>
          </form>
          <form action={decide.bind(null, "NOT CAPTURED")}>
            <button
              type="submit"
              className="w-full rounded-md border border-line px-4 py-3 text-sm font-medium"
            >
              {t("decline")}
            </button>
          </form>
          <form action={decide.bind(null, "CANCELED")}>
            <button
              type="submit"
              className="w-full rounded-md border border-line px-4 py-3 text-sm text-muted"
            >
              {t("cancel")}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
