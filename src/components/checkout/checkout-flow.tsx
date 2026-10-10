"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { FormProvider, useForm, type FieldErrors } from "react-hook-form";
import { DRAFT_UPDATED_EVENT, SAMPLE_DETAILS } from "@/components/layout/demo-helpers";
import type { PaymentMethod } from "@/data/site";
import { useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getLiveAvailable, useLiveStock } from "@/lib/live-stock";
import { mockGateway } from "@/lib/payments/mock";
import { priceLines } from "@/lib/pricing";
import { checkoutSchema, emptyCheckoutForm, rememberedFields, type CheckoutForm } from "@/lib/validation";
import { useBag } from "@/store/bag";
import { useCheckout } from "@/store/checkout";
import { useUi } from "@/store/ui";
import { AddressSection } from "./address-section";
import { ApplePaySheet } from "./apple-pay-sheet";
import { ContactSection } from "./contact-section";
import { DeliverToCard } from "./deliver-to-card";
import { DeliverySection } from "./delivery-section";
import { ErrorSummary } from "./error-summary";
import { ExpressCheckout } from "./express-checkout";
import { EXPRESS_APPLE_PAY_EVENT } from "./events";
import { FIELD_ORDER, focusField, FORM_ID } from "./form-helpers";
import { MobilePayBar } from "./mobile-pay-bar";
import { buildOrderInput, detailsComplete, matchesRemembered, withoutTerms, type OrderDetails } from "./order";
import { MobileOrderSummary, OrderSummaryPanel } from "./order-summary";
import { PaymentSection } from "./payment-section";
import { RedirectOverlay } from "./redirect-overlay";
import { isTextField } from "./use-device";

const REDIRECT_MS = 800;
const SAVE_DELAY_MS = 300;
const detailFields = new Set<string>(rememberedFields);

/** Draft (which already includes remembered details) — read once, after hydration. */
function initialValues(): CheckoutForm {
  return { ...emptyCheckoutForm, ...useCheckout.getState().draft, acceptTerms: false };
}

function UnavailableNotice() {
  const t = useTranslations("checkout.unavailable");
  const openBag = useUi((s) => s.openBag);
  return (
    <div role="alert" className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border border-danger/40 px-4 py-2 text-[14px] text-danger">
      <span>{t("title")}</span>
      <button type="button" onClick={openBag} className="min-h-11 underline decoration-1 underline-offset-4">
        {t("action")}
      </button>
    </div>
  );
}

/**
 * One-page guest checkout. The form autosaves to the checkout store (so it survives reload,
 * Back and a language switch), creates or reuses the pending order on Pay, then hands over
 * to KNET / card (redirect) or opens the Apple Pay sheet.
 */
export function CheckoutFlow() {
  const t = useTranslations("checkout");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const announce = useUi((s) => s.announce);
  const openBag = useUi((s) => s.openBag);
  const pushToast = useUi((s) => s.pushToast);
  const stock = useLiveStock();
  const lines = useBag((s) => s.lines);
  // Missing (unknown/hidden) and out-of-stock lines both have to leave the bag before paying.
  const blocked = lines.some((l) => stock.available(l.sku) <= 0);

  const [defaults] = useState(initialValues);
  const form = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: defaults,
    shouldFocusError: false,
  });
  const {
    handleSubmit,
    reset,
    getValues,
    subscribe,
    formState: { errors },
  } = form;

  const [collapsed, setCollapsed] = useState(() => {
    const { draft, remembered } = useCheckout.getState();
    return matchesRemembered(draft, remembered);
  });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [redirect, setRedirect] = useState<{ method: "knet" | "card"; amountFils: number } | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; details: OrderDetails }>(() => ({
    open: false,
    details: withoutTerms(defaults),
  }));

  const locked = useRef(false);
  const timers = useRef<number[]>([]);
  const pendingDraft = useRef<CheckoutForm | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const expressHandled = useRef(false);

  const flushDraft = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const values = pendingDraft.current;
    pendingDraft.current = null;
    if (values) useCheckout.getState().updateDraft(withoutTerms(values));
  }, []);

  // Autosave (debounced) — the draft survives reload, Back and switching language.
  useEffect(() => {
    const unsubscribe = subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        pendingDraft.current = { ...values };
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(flushDraft, SAVE_DELAY_MS);
      },
    });
    window.addEventListener("pagehide", flushDraft);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", flushDraft);
      flushDraft();
    };
  }, [subscribe, flushDraft]);

  // Presenter tools ("Fill sample Kuwait address", "Reset demo data") rewrite the draft.
  useEffect(() => {
    const reload = () => {
      window.clearTimeout(saveTimer.current);
      pendingDraft.current = null;
      const { draft, remembered } = useCheckout.getState();
      reset({ ...emptyCheckoutForm, ...draft, acceptTerms: getValues("acceptTerms") });
      setAttempt(0);
      setCollapsed(matchesRemembered(draft, remembered));
    };
    window.addEventListener(DRAFT_UPDATED_EVENT, reload);
    return () => window.removeEventListener(DRAFT_UPDATED_EVENT, reload);
  }, [reset, getValues]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  const createOrder = useCallback(
    (details: OrderDetails, method: PaymentMethod) =>
      useCheckout
        .getState()
        .createOrReuseOrder(buildOrderInput({ details, bag: useBag.getState(), method, locale }), new Date()),
    [locale],
  );

  /** Express: the form's details when complete, otherwise the (simulated) wallet's. */
  const openExpressSheet = useCallback(() => {
    // Same rule as Pay: items that are no longer available (or short on stock) leave the bag first.
    const { priced, missing } = priceLines(useBag.getState().lines);
    const short = priced.some((l) => getLiveAvailable(l.sku) < l.qty);
    if (priced.length === 0 || missing.length > 0 || short) {
      if (short) pushToast({ title: tc("stockRefused") });
      openBag();
      return;
    }
    const values = getValues();
    const details = detailsComplete(values) ? values : { ...values, ...SAMPLE_DETAILS };
    setSheet({ open: true, details: withoutTerms(details) });
  }, [getValues, openBag, pushToast, tc]);

  // "Apple Pay" from the bag drawer or product page lands here with ?express=applepay (once).
  useEffect(() => {
    if (expressHandled.current) return;
    if (new URLSearchParams(window.location.search).get("express") !== "applepay") return;
    const timer = window.setTimeout(() => {
      expressHandled.current = true;
      const url = new URL(window.location.href);
      url.searchParams.delete("express");
      window.history.replaceState(window.history.state, "", url.toString());
      openExpressSheet();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [openExpressSheet]);

  // /checkout#payment (e.g. "Choose another method" after a declined payment) focuses the methods.
  useEffect(() => {
    if (window.location.hash !== "#payment") return;
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLInputElement>("#payment input[type=radio]:checked")?.focus({ preventScroll: true });
      document.getElementById("payment")?.scrollIntoView({ block: "start" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, []);

  // Already on this page: the drawer's Apple Pay button asks directly (after the drawer closes).
  useEffect(() => {
    let timer: number | undefined;
    const onExpress = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(openExpressSheet, 260);
    };
    window.addEventListener(EXPRESS_APPLE_PAY_EVENT, onExpress);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(EXPRESS_APPLE_PAY_EVENT, onExpress);
    };
  }, [openExpressSheet]);

  const onValid = (values: CheckoutForm) => {
    if (locked.current) return;
    const bag = useBag.getState();
    const { priced, missing } = priceLines(bag.lines);
    // Re-check stock against the live ledger: a size that sold out (or dropped) stops the payment.
    const short = priced.some((l) => getLiveAvailable(l.sku) < l.qty);
    if (priced.length === 0 || missing.length > 0 || short) {
      if (short) pushToast({ title: tc("stockRefused") });
      openBag();
      return;
    }
    setAttempt(0);
    // Save now rather than in 300ms: we are about to leave the page.
    window.clearTimeout(saveTimer.current);
    pendingDraft.current = null;
    useCheckout.getState().updateDraft(withoutTerms(values));

    const details = withoutTerms(values);
    if (values.paymentMethod === "applepay") {
      setSheet({ open: true, details });
      return;
    }

    locked.current = true;
    setBusy(true);
    const method = values.paymentMethod;
    const orderId = createOrder(details, method);
    const amountFils = useCheckout.getState().orders[orderId]?.totals.totalFils ?? 0;
    setRedirect({ method, amountFils });
    announce(method === "knet" ? t("redirect.knet") : t("redirect.card"));
    timers.current.push(
      window.setTimeout(
        () => router.push(mockGateway.initiate({ orderId, method, amountFils }).redirectPath),
        REDIRECT_MS,
      ),
    );
  };

  const onInvalid = (invalid: FieldErrors<CheckoutForm>) => {
    setAttempt((n) => n + 1);
    const first = FIELD_ORDER.find((name) => invalid[name]);
    if (!first) return;
    if (collapsed && detailFields.has(first)) flushSync(() => setCollapsed(false));
    focusField(first);
  };

  // Phones: the keyboard's "Next" key moves to the next field instead of submitting the form.
  const onFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    const target = e.target as Element;
    if (e.key !== "Enter" || e.defaultPrevented || e.nativeEvent.isComposing) return;
    if (!(target instanceof HTMLInputElement) || !isTextField(target)) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    e.preventDefault();
    const fields = Array.from(e.currentTarget.querySelectorAll("input, textarea")).filter(
      (el): el is HTMLInputElement | HTMLTextAreaElement => isTextField(el) && !el.disabled,
    );
    const next = fields[fields.indexOf(target) + 1];
    if (next) next.focus();
    else target.blur();
  };

  const errorText = (key: string) => (t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.generic"));
  const errorItems =
    attempt > 0
      ? FIELD_ORDER.flatMap((name) => {
          const key = errors[name]?.message;
          return key ? [{ name, message: errorText(key) }] : [];
        })
      : [];

  return (
    <FormProvider {...form}>
      <MobileOrderSummary />
      <div className="mx-auto max-w-[1200px] px-4 pt-8 pb-28 md:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16 lg:pt-14 lg:pb-24 xl:grid-cols-[minmax(0,1fr)_440px] xl:gap-24">
        <div className="min-w-0">
          <h1 className="caps font-serif text-title-sm font-medium md:text-title">{t("title")}</h1>
          <ExpressCheckout onApplePay={openExpressSheet} />
          {blocked && <UnavailableNotice />}
          {/* Re-mounted on every attempt so screen readers announce it again. */}
          <div key={attempt} role="alert">
            {errorItems.length > 0 && <ErrorSummary items={errorItems} />}
          </div>
          <form
            id={FORM_ID}
            noValidate
            onSubmit={(e) => handleSubmit(onValid, onInvalid)(e)}
            onKeyDown={onFormKeyDown}
            // Leaving a field saves at once (e.g. tapping the language switch right after typing).
            onBlur={flushDraft}
            className="mt-8 space-y-12 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-0"
          >
            {collapsed ? (
              <DeliverToCard
                onChange={() => {
                  flushSync(() => setCollapsed(false));
                  focusField("name");
                }}
              />
            ) : (
              <>
                <ContactSection />
                <AddressSection />
              </>
            )}
            <DeliverySection />
            <PaymentSection busy={busy} />
          </form>
        </div>
        <aside className="hidden lg:block">
          <OrderSummaryPanel />
        </aside>
      </div>
      <MobilePayBar busy={busy} />
      <ApplePaySheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        details={sheet.details}
        createOrder={() => createOrder(sheet.details, "applepay")}
      />
      {redirect && <RedirectOverlay method={redirect.method} amountFils={redirect.amountFils} durationMs={REDIRECT_MS} />}
    </FormProvider>
  );
}
