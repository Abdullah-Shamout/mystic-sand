"use client";

import { Info, Landmark, Lock, ShieldCheck, Timer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { readDemoOutcome } from "@/components/layout/demo-helpers";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { banks } from "@/data/banks";
import { payments, site } from "@/data/site";
import { useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { formatKWD } from "@/lib/money";
import { demoOtp, newPaymentFields } from "@/lib/order";
import { mockGateway } from "@/lib/payments/mock";
import type { PaymentRecord, PaymentResult } from "@/lib/payments/types";
import { useCheckout, type Order } from "@/store/checkout";
import { useUi } from "@/store/ui";
import { DemoControls } from "./demo-controls";
import { bankName, formatClock, groupCode } from "./format";
import { MaskedFields } from "./masked-fields";
import { MethodBadge, type GatewayMethod } from "./method-badge";
import { clearPaySession, loadPaySession, savePaySession, type PaySession, type PayStep } from "./pay-session";
import { PaymentSkeleton } from "./payment-skeleton";
import { StepIndicator } from "./step-indicator";
import { useCountdown } from "./use-countdown";
import { useTimeout } from "./use-timeout";

const SESSION_MS = payments.sessionSeconds * 1000;
const OTP_MS = payments.otpSeconds * 1000;
const LAST_DIGITS = "4821";

/** Message key of a step: the KNET and card flows word the card step differently. */
const stepKey = (step: PayStep, method: GatewayMethod) =>
  step === "card" && method === "knet" ? "knetCard" : step;

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end">{children}</dd>
    </div>
  );
}

function SessionBar({ left }: { left: number | null }) {
  const t = useTranslations("payment.gateway");
  const total = payments.sessionSeconds;
  const low = left !== null && left <= 60;
  return (
    <div className="border-y border-line">
      <div className="flex min-h-11 items-center justify-between gap-3 px-5 text-[13px] sm:px-8">
        <span className="inline-flex items-center gap-2 text-muted">
          <Timer className="size-4 shrink-0" strokeWidth={1.25} aria-hidden />
          {t("session")}
        </span>
        <span role="timer" className={cn("figures font-medium", low && "text-danger")} data-testid="session-timer">
          <bdi>{left === null ? "" : formatClock(left)}</bdi>
        </span>
      </div>
      <div aria-hidden className="h-[2px] bg-line/50">
        <div
          className={cn("h-full transition-[width] duration-300 ease-linear", low ? "bg-danger" : "bg-racing")}
          style={{ width: `${((left ?? total) / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 flex items-start gap-2.5 text-[14px] leading-relaxed">
      <Info className="mt-[5px] size-4 shrink-0 text-muted" strokeWidth={1.25} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/**
 * Simulated hosted payment page. It follows the KNET sequence (bank → card details
 * → submit → confirm → SMS code from KD 25 → result) or a card + 3-D Secure flow,
 * without copying KNET's look and without a single card, PIN or code input.
 */
export function Gateway({ order, method }: { order: Order; method: GatewayMethod }) {
  const t = useTranslations("payment");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const announce = useUi((s) => s.announce);
  const { start, stop } = useTimeout();

  const amount = order.totals.totalFils;
  const needsOtp = method === "knet" && amount >= payments.otpFromFils;
  const sequence: PayStep[] =
    method === "knet" ? ["bank", "card", "confirm", ...(needsOtp ? (["otp"] as const) : [])] : ["card", "secure"];

  // Fixed at mount, so recording this attempt doesn't restart the session underneath us.
  const [sessionKey] = useState(() => `${order.id}|${method}|${order.attempts.length}`);
  const [session, setSession] = useState<PaySession | null>(null);
  const [busy, setBusy] = useState(false);
  const [bankError, setBankError] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bankListRef = useRef<HTMLUListElement>(null);
  const finished = useRef(false);
  const warned = useRef(false);

  // Start, or resume after a refresh / language switch. Reads storage and the clock, so after mount only.
  useEffect(() => {
    const id = setTimeout(() => {
      const now = Date.now();
      setSession(
        loadPaySession(sessionKey, now) ?? {
          key: sessionKey,
          deadline: now + SESSION_MS,
          step: method === "knet" ? "bank" : "card",
          bankId: null,
          otp: null,
          otpDeadline: null,
          outcome: readDemoOutcome(),
        },
      );
    }, 0);
    return () => clearTimeout(id);
  }, [sessionKey, method]);

  useEffect(() => {
    if (session && session.step !== "processing") savePaySession(session);
  }, [session]);

  const step = session?.step;
  useEffect(() => {
    if (step) headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    router.prefetch("/checkout/result");
  }, [router]);

  const update = (patch: Partial<PaySession>) => setSession((s) => (s ? { ...s, ...patch } : s));

  /** Records the outcome and leaves with replace(), so Back never returns to the gateway. */
  const finish = (result: PaymentResult, reason?: "user" | "timeout") => {
    if (finished.current) return;
    finished.current = true;
    stop();
    const now = new Date();
    const fields = newPaymentFields(now);
    const record: PaymentRecord = {
      method,
      result,
      paymentId: fields.paymentId,
      trackId: order.id,
      // The bank issues a transaction ID once it has seen the card; auth code and reference only on capture.
      tranId: result === "CANCELED" ? undefined : fields.tranId,
      ref: result === "CAPTURED" ? fields.ref : undefined,
      auth: result === "CAPTURED" ? fields.auth : undefined,
      postDate: fields.postDate,
      amountFils: amount,
      bankId: method === "knet" ? (session?.bankId ?? undefined) : undefined,
      at: now.toISOString(),
    };
    useCheckout.getState().recordAttempt(order.id, record);
    clearPaySession();
    router.replace(`${mockGateway.resultPath(record, order.id)}${reason ? `&reason=${reason}` : ""}`);
  };

  const left = useCountdown(session && session.step !== "processing" ? session.deadline : null, () =>
    finish("CANCELED", "timeout"),
  );
  const otpLeft = useCountdown(session?.step === "otp" ? session.otpDeadline : null);
  const otpExpired = otpLeft === 0;

  useEffect(() => {
    if (left !== null && left > 0 && left <= 60 && !warned.current) {
      warned.current = true;
      announce(t("gateway.sessionWarning"));
    }
  }, [left, announce, t]);

  /** Moves on after a short "network" pause; the busy button ignores repeat taps meanwhile. */
  const advance = (patch: Partial<PaySession>, ms: number) => {
    setBusy(true);
    start(() => {
      setBusy(false);
      update(patch);
    }, ms);
  };

  const process = () => {
    if (!session || busy) return;
    const outcome = session.outcome;
    update({ step: "processing" });
    start(() => finish(outcome), 1200);
  };

  const cancel = () => finish("CANCELED", "user");

  /** Going back drops any transition still in flight, so it can't jump forward afterwards. */
  const backTo = (target: PayStep) => {
    stop();
    setBusy(false);
    update({ step: target });
  };

  const continueFromBank = () => {
    if (!session?.bankId) {
      setBankError(true);
      bankListRef.current?.querySelector("input")?.focus();
      return;
    }
    advance({ step: "card" }, 350);
  };

  const confirm = () => {
    if (needsOtp) advance({ step: "otp", otp: demoOtp(), otpDeadline: Date.now() + OTP_MS }, 700);
    else process();
  };

  const resendOtp = () => {
    update({ otp: demoOtp(), otpDeadline: Date.now() + OTP_MS });
    announce(t("steps.otp.resent"));
  };

  if (!session) return <PaymentSkeleton />;

  const bank = bankName(session.bankId, locale);
  const processing = session.step === "processing";
  const current = processing ? sequence.length : sequence.indexOf(session.step);
  const key = stepKey(session.step, method);
  const price = (chunks: React.ReactNode) => <bdi className="figures whitespace-nowrap">{chunks}</bdi>;

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pt-8 pb-16 md:pt-12 md:pb-24" data-testid="gateway">
      <div className="flex items-center justify-between gap-4">
        <p className="inline-flex items-center gap-2 text-[13px] leading-snug text-muted">
          <Lock className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
          <span>
            <bdi lang="en">{site.brand}</bdi> · {t("gateway.title")}
          </span>
        </p>
        <MethodBadge method={method} />
      </div>

      <section aria-labelledby="pay-step-title" className="mt-3 border border-line bg-paper">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 bg-tile px-5 py-5 sm:grid-cols-[1fr_1fr_auto] sm:px-8">
          <div className="min-w-0">
            <dt className="text-[12px] text-muted">{t("gateway.merchant")}</dt>
            <dd className="mt-0.5 truncate text-[15px]">
              <bdi lang="en">{site.brand}</bdi>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-muted">{t("gateway.trackId")}</dt>
            <dd className="mt-0.5 text-[15px]">
              <bdi className="figures">{order.id}</bdi>
            </dd>
          </div>
          <div className="col-span-2 border-t border-line pt-4 sm:col-span-1 sm:border-0 sm:pt-0 sm:text-end">
            <dt className="text-[12px] text-muted">{t("gateway.amount")}</dt>
            {/* Serif figures in English; in Arabic the serif stack would set د.ك in the Kufi display face. */}
            <dd
              className="mt-0.5 font-serif text-[28px] leading-tight font-medium rtl:font-sans rtl:text-[25px]"
              data-testid="gateway-amount"
            >
              <Price fils={amount} />
            </dd>
          </div>
        </dl>

        {!processing && <SessionBar left={left} />}

        <div className={cn("px-5 pt-6 sm:px-8", processing && "border-t border-line")}>
          <StepIndicator
            labels={sequence.map((s) => t(`steps.${stepKey(s, method)}.label`))}
            current={current}
          />
        </div>

        <div className={cn("px-5 pt-8 pb-8 sm:px-8 sm:pb-10", processing && "text-center")}>
          <h1
            id="pay-step-title"
            ref={headingRef}
            tabIndex={-1}
            className="caps font-serif text-title-sm font-medium outline-none"
          >
            {/* The indicator shows the position visually; screen readers hear it with the focused heading. */}
            {!processing && (
              <span className="sr-only">
                {t("gateway.stepOf", { current: String(current + 1), total: String(sequence.length) })}:{" "}
              </span>
            )}
            {t(`steps.${key}.title`)}
          </h1>

          {session.step === "bank" && (
            <>
              <p className="mt-3 text-[15px] text-muted">{t("steps.bank.text")}</p>
              <fieldset className="mt-6" aria-describedby={bankError ? "bank-error" : undefined}>
                <legend className="sr-only">{t("steps.bank.title")}</legend>
                <ul ref={bankListRef} className="grid border-s border-t border-line sm:grid-cols-2">
                  {banks.map((b) => (
                    <li key={b.id} className="border-e border-b border-line">
                      <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-tile/60 has-[:checked]:bg-tile">
                        <input
                          type="radio"
                          name="bank"
                          value={b.id}
                          checked={session.bankId === b.id}
                          onChange={() => {
                            update({ bankId: b.id });
                            setBankError(false);
                          }}
                          className="size-[18px] shrink-0 cursor-pointer accent-racing"
                          data-testid={`bank-${b.id}`}
                        />
                        <span className="text-[15px] leading-snug">{b.name[locale]}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
              {bankError && (
                <p id="bank-error" role="alert" className="mt-3 text-[14px] text-danger">
                  {t("steps.bank.error")}
                </p>
              )}
              <Button size="lg" block busy={busy} onClick={continueFromBank} className="mt-8" data-testid="pay-continue">
                {t("steps.bank.continue")}
              </Button>
            </>
          )}

          {session.step === "card" && method === "knet" && (
            <>
              <p className="mt-4 flex flex-wrap items-center gap-x-2 text-[15px]">
                <Landmark className="size-4 shrink-0 text-muted" strokeWidth={1.25} aria-hidden />
                <span className="text-muted">{t("steps.knetCard.bank")}:</span>
                <span>{bank}</span>
                <button
                  type="button"
                  onClick={() => backTo("bank")}
                  className="inline-flex min-h-11 items-center px-1 text-[14px] underline underline-offset-4 hover:decoration-2"
                >
                  {t("steps.knetCard.change")}
                </button>
              </p>
              <div className="mt-3 border border-line bg-tile p-4 sm:p-5">
                <MaskedFields
                  fields={[
                    { label: t("steps.knetCard.number"), value: `•••• •••• •••• ${LAST_DIGITS}`, wide: true },
                    { label: t("steps.knetCard.expiry"), value: "•• / ••" },
                    { label: t("steps.knetCard.pin"), value: "••••" },
                  ]}
                />
              </div>
              <Note>{t("steps.knetCard.text")}</Note>
              <Button
                size="lg"
                block
                busy={busy}
                onClick={() => advance({ step: "confirm" }, 700)}
                className="mt-8"
                data-testid="pay-submit"
              >
                {t("steps.knetCard.submit")}
              </Button>
            </>
          )}

          {session.step === "confirm" && (
            <>
              <p className="mt-3 text-[15px] text-muted">{t("steps.confirm.text")}</p>
              <dl className="mt-6 divide-y divide-line border-y border-line text-[15px]">
                <SummaryRow label={t("gateway.merchant")}>
                  <bdi lang="en">{site.brand}</bdi>
                </SummaryRow>
                <SummaryRow label={t("gateway.amount")}>
                  <Price fils={amount} className="font-medium" />
                </SummaryRow>
                <SummaryRow label={t("steps.confirm.bank")}>{bank}</SummaryRow>
                <SummaryRow label={t("steps.confirm.card")}>
                  <bdi dir="ltr" className="figures">
                    •••• {LAST_DIGITS}
                  </bdi>
                </SummaryRow>
                <SummaryRow label={t("gateway.trackId")}>
                  <bdi className="figures">{order.id}</bdi>
                </SummaryRow>
              </dl>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <Button size="lg" busy={busy} onClick={confirm} data-testid="pay-confirm">
                  {t("steps.confirm.confirm")}
                </Button>
                <Button size="lg" variant="secondary" onClick={cancel}>
                  {t("steps.confirm.cancel")}
                </Button>
              </div>
            </>
          )}

          {session.step === "otp" && (
            <>
              <p className="mt-3 text-[15px] text-muted">
                {t("steps.otp.text", { bank: bank ?? t("steps.otp.yourBank") })}
              </p>
              <div className="mt-6 border border-line bg-tile px-5 py-6 text-center">
                <p className="caps text-[12px] text-muted">{t("steps.otp.code")}</p>
                {session.otp && (
                  <p className="mt-2 font-serif text-[40px] leading-none font-medium" data-testid="otp-code">
                    <bdi dir="ltr" aria-hidden className="figures">
                      {groupCode(session.otp)}
                    </bdi>
                    <span className="sr-only">{session.otp.split("").join(" ")}</span>
                  </p>
                )}
                {!otpExpired && (
                  <p className="mt-4 text-[13px] text-muted">
                    {t("steps.otp.expires")}{" "}
                    <bdi className="figures font-medium text-ink">{otpLeft === null ? "" : formatClock(otpLeft)}</bdi>
                  </p>
                )}
                {otpExpired && (
                  <p role="alert" className="mt-4 text-[13px] text-danger">
                    {t("steps.otp.expired")}
                  </p>
                )}
              </div>
              <Note>{t("steps.otp.note")}</Note>
              {otpExpired ? (
                <Button size="lg" block variant="secondary" onClick={resendOtp} className="mt-8">
                  {t("steps.otp.resend")}
                </Button>
              ) : (
                <Button size="lg" block busy={busy} onClick={process} className="mt-8" data-testid="pay-otp-confirm">
                  {t("steps.otp.confirm")}
                </Button>
              )}
            </>
          )}

          {session.step === "card" && method === "card" && (
            <>
              <div className="mt-6 border border-line bg-tile p-4 sm:p-5">
                <MaskedFields
                  fields={[
                    { label: t("steps.card.number"), value: `•••• •••• •••• ${LAST_DIGITS}`, wide: true },
                    { label: t("steps.card.expiry"), value: "•• / ••" },
                    { label: t("steps.card.cvv"), value: "•••" },
                  ]}
                />
              </div>
              <Note>{t("steps.card.text")}</Note>
              <Button
                size="lg"
                block
                busy={busy}
                onClick={() => advance({ step: "secure" }, 700)}
                className="mt-8"
                data-testid="pay-card"
              >
                {t.rich("steps.card.pay", { amount: formatKWD(amount, locale), price })}
              </Button>
            </>
          )}

          {session.step === "secure" && (
            <>
              <p className="mt-3 text-[15px] text-muted">{t("steps.secure.text")}</p>
              <div className="mt-6 border border-line bg-tile px-5 py-7 text-center">
                <ShieldCheck className="mx-auto size-8 text-racing" strokeWidth={1} aria-hidden />
                <p className="mt-3 text-[12px] text-muted">
                  <bdi lang="en">3-D Secure</bdi>
                </p>
                <p className="mx-auto mt-2 max-w-sm text-[17px] leading-snug">
                  {t.rich("steps.secure.request", {
                    amount: formatKWD(amount, locale),
                    price,
                    brand: (chunks) => <bdi lang="en">{chunks}</bdi>,
                  })}
                </p>
              </div>
              <Note>{t("steps.secure.note")}</Note>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <Button size="lg" busy={busy} onClick={process} data-testid="pay-approve">
                  {t("steps.secure.approve")}
                </Button>
                <Button size="lg" variant="secondary" onClick={cancel}>
                  {t("steps.secure.cancel")}
                </Button>
              </div>
            </>
          )}

          {processing && (
            <div role="status" className="flex flex-col items-center pt-6">
              <span
                aria-hidden
                className="size-10 animate-spin-slow rounded-full border-2 border-racing border-t-transparent"
              />
              <p className="mt-6 max-w-sm text-[15px] text-muted">{t("steps.processing.text")}</p>
            </div>
          )}
        </div>

        {!processing && (
          <div className="flex flex-col gap-2 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8">
            <button
              type="button"
              onClick={cancel}
              className="inline-flex min-h-11 items-center self-start text-[14px] underline underline-offset-4 hover:text-danger sm:self-auto"
              data-testid="pay-cancel"
            >
              {t("gateway.cancel")}
            </button>
            <p className="flex items-start gap-2 text-[12px] leading-snug text-muted sm:max-w-[62%]">
              <ShieldCheck className="mt-px size-4 shrink-0" strokeWidth={1.25} aria-hidden />
              {t("gateway.secureNote")}
            </p>
          </div>
        )}
      </section>

      {!processing && <DemoControls value={session.outcome} onChange={(outcome) => update({ outcome })} />}
    </div>
  );
}
