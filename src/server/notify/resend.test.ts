import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit coverage for the Resend email adapter with a MOCKED fetch and a MOCKED order loader (no network,
// no database). We also mock the structured logger to assert A09: a log line never carries a recipient
// address or an email body.

const { logs } = vi.hoisted(() => ({
  logs: [] as { level: "info" | "error"; obj: Record<string, unknown>; msg: string }[],
}));

vi.mock("@/server/log", () => ({
  logger: {
    info: (obj: Record<string, unknown>, msg: string) => logs.push({ level: "info", obj, msg }),
    error: (obj: Record<string, unknown>, msg: string) => logs.push({ level: "error", obj, msg }),
  },
  redactError: (err: unknown) => ({ name: err instanceof Error ? err.name : "Error" }),
}));

import { createResendNotifier, type OrderLoader } from "./resend";
import type { OrderNotification } from "./types";

type Loaded = NonNullable<Awaited<ReturnType<OrderLoader>>>;

const CFG = { apiKey: "re_test_key", from: "Mystic Sand <orders@test.dev>", ownerEmail: "owner@mysticsand.test" };

const NOTIFY: OrderNotification = {
  id: "MS-20042",
  phoneE164: "+96599123456",
  name: "Fatma",
  totalFils: 40000,
  oversold: false,
  locale: "en",
};

function makeLoaded(overrides: { details?: Record<string, unknown>; order?: Record<string, unknown>; lines?: unknown[] } = {}): Loaded {
  const details = {
    name: "Fatma",
    phone: "99123456",
    email: "customer@example.com",
    areaId: "salmiya",
    housing: "house",
    block: "10",
    street: "Baghdad Street",
    avenue: "",
    building: "15",
    floor: "",
    apartment: "",
    mapsLink: "",
    notes: "",
    deliveryMethod: "standard",
    paymentMethod: "knet",
    saveDetails: true,
    ...overrides.details,
  };
  const order = {
    id: "MS-20042",
    status: "paid",
    oversold: false,
    locale: "en",
    method: "knet",
    subtotalFils: 38000,
    discountFils: 0,
    deliveryFils: 2000,
    totalFils: 40000,
    promoCode: null,
    bagKey: "bag",
    details,
    phoneE164: "+96599123456",
    checkoutToken: "tok",
    provider: "sandbox",
    providerPaymentId: "sbx_1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    paidAt: new Date("2026-01-01T00:00:00.000Z"),
    finalizedAt: new Date("2026-01-01T00:00:00.000Z"),
    fulfilledAt: null,
    ...overrides.order,
  };
  const lines = overrides.lines ?? [
    { id: "l1", orderId: "MS-20042", sku: "MS-DUNE-50", slug: "dune", qty: 2, priceFils: 19000, name: "Dune", size: { en: "50 ml", ar: "٥٠ مل" }, image: "/img.jpg" },
  ];
  return { order, lines } as unknown as Loaded;
}

type SentCall = { to: string; subject: string; html: string; text: string; from: string; auth: string; replyTo?: string };
type BodySpy = { json: ReturnType<typeof vi.fn>; text: ReturnType<typeof vi.fn> };

function fetchStub(opts: { ok?: boolean; status?: number } = {}) {
  const calls: SentCall[] = [];
  // Per-response body-reader spies: the adapter must NEVER read a Resend response body (A09 — the error
  // body can echo the recipient address), so tests assert these are never called.
  const bodySpies: BodySpy[] = [];
  const fn = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as {
      to: string; subject: string; html: string; text: string; from: string; reply_to?: string;
    };
    const headers = init.headers as Record<string, string>;
    calls.push({
      to: body.to, subject: body.subject, html: body.html, text: body.text,
      from: body.from, auth: headers.Authorization, replyTo: body.reply_to,
    });
    const spy: BodySpy = { json: vi.fn(async () => ({ id: "email_1" })), text: vi.fn(async () => "") };
    bodySpies.push(spy);
    return { ok: opts.ok ?? true, status: opts.status ?? 200, json: spy.json, text: spy.text } as unknown as Response;
  });
  return { fn: fn as unknown as typeof fetch, calls, bodySpies };
}

beforeEach(() => {
  logs.length = 0;
});

describe("resend adapter — orderPaid", () => {
  it("reads the order and sends the owner + customer legs with the right to/subject/auth", async () => {
    const loadOrder: OrderLoader = async () => makeLoaded();
    const { fn, calls } = fetchStub();
    const notifier = createResendNotifier(CFG, { fetchImpl: fn, loadOrder });

    await notifier.orderPaid(NOTIFY);

    expect(calls).toHaveLength(2);
    const owner = calls.find((c) => c.to === CFG.ownerEmail)!;
    const customer = calls.find((c) => c.to === "customer@example.com")!;
    expect(owner).toBeDefined();
    expect(customer).toBeDefined();

    expect(owner.subject).toBe("New order MS-20042 — 40.000 KWD");
    expect(customer.subject).toBe("Your order MS-20042 is confirmed");
    expect(owner.from).toBe(CFG.from);
    expect(owner.auth).toBe("Bearer re_test_key");
    // Both carry an html AND a text part.
    expect(owner.html).toContain("<html");
    expect(owner.text.length).toBeGreaterThan(0);
    expect(customer.text.length).toBeGreaterThan(0);
    // The customer footer says "reply to this email" → replies route to the owner inbox (reply_to);
    // the owner alert sets none.
    expect(customer.replyTo).toBe(CFG.ownerEmail);
    expect(owner.replyTo).toBeUndefined();
  });

  it("SKIPS the customer leg when the stored email is blank; the owner leg still sends", async () => {
    const loadOrder: OrderLoader = async () => makeLoaded({ details: { email: "" } });
    const { fn, calls } = fetchStub();
    const notifier = createResendNotifier(CFG, { fetchImpl: fn, loadOrder });

    await notifier.orderPaid(NOTIFY);

    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe(CFG.ownerEmail);
    expect(logs.some((l) => l.obj.event === "notify_resend_skipped" && l.obj.leg === "customer")).toBe(true);
  });

  it("treats a non-2xx Resend response as a FAILED leg (not success) and NEVER reads the error body", async () => {
    const loadOrder: OrderLoader = async () => makeLoaded();
    const { fn, bodySpies } = fetchStub({ ok: false, status: 422 });
    const notifier = createResendNotifier(CFG, { fetchImpl: fn, loadOrder });

    await expect(notifier.orderPaid(NOTIFY)).resolves.toBeUndefined(); // never throws out

    const failed = logs.filter((l) => l.level === "error" && l.obj.event === "notify_resend_failed");
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((l) => l.obj.status === 422)).toBe(true);
    // A failed leg must NOT be logged as sent.
    expect(logs.some((l) => l.obj.event === "notify_resend_sent")).toBe(false);
    // A09: on a non-2xx the adapter must not read the provider body (it can echo the recipient address).
    // Both legs were attempted, and neither response body was read via json()/text().
    expect(bodySpies).toHaveLength(2);
    for (const spy of bodySpies) {
      expect(spy.json).not.toHaveBeenCalled();
      expect(spy.text).not.toHaveBeenCalled();
    }
  });

  it("marks the owner subject (and body) OVERSOLD when the capture could not be fulfilled", async () => {
    const loadOrder: OrderLoader = async () => makeLoaded({ order: { oversold: true } });
    const { fn, calls } = fetchStub();
    const notifier = createResendNotifier(CFG, { fetchImpl: fn, loadOrder });

    await notifier.orderPaid({ ...NOTIFY, oversold: true });

    const owner = calls.find((c) => c.to === CFG.ownerEmail)!;
    expect(owner.subject).toBe("⚠ OVERSOLD — New order MS-20042 — 40.000 KWD");
    expect(owner.html).toContain("OVERSOLD");
  });

  it("HTML-escapes shopper-typed values in the owner email", async () => {
    const loadOrder: OrderLoader = async () =>
      makeLoaded({ details: { name: `<script>alert("x")</script>`, notes: "<b>drop here</b>" } });
    const { fn, calls } = fetchStub();
    const notifier = createResendNotifier(CFG, { fetchImpl: fn, loadOrder });

    await notifier.orderPaid({ ...NOTIFY, name: `<script>alert("x")</script>` });

    const owner = calls.find((c) => c.to === CFG.ownerEmail)!;
    expect(owner.html).toContain("&lt;script&gt;");
    expect(owner.html).not.toContain("<script>");
    expect(owner.html).not.toContain("<b>drop here</b>");
    expect(owner.html).toContain("&lt;b&gt;drop here&lt;/b&gt;");
  });

  it("the customer email carries ONLY the reduced projection — no name, phone or address", async () => {
    const loadOrder: OrderLoader = async () =>
      makeLoaded({ details: { name: "Fatma", phone: "99123456", street: "Baghdad Street", email: "customer@example.com" } });
    const { fn, calls } = fetchStub();
    const notifier = createResendNotifier(CFG, { fetchImpl: fn, loadOrder });

    await notifier.orderPaid(NOTIFY);

    const customer = calls.find((c) => c.to === "customer@example.com")!;
    const blob = `${customer.html}\n${customer.text}`;
    expect(blob).not.toContain("Fatma"); // no name
    expect(blob).not.toContain("Baghdad"); // no address
    expect(blob).not.toContain("99123456"); // no raw phone
    expect(blob).not.toContain("+965 9912 3456"); // no formatted phone
    // But it DOES carry the reduced order content.
    expect(blob).toContain("Dune"); // line item
    expect(blob).toContain("MS-20042"); // order number
    expect(customer.subject).toContain("MS-20042");
  });

  it("logs no recipient address or email body in any A09 log line", async () => {
    const loadOrder: OrderLoader = async () => makeLoaded();
    const { fn } = fetchStub();
    const notifier = createResendNotifier(CFG, { fetchImpl: fn, loadOrder });

    await notifier.orderPaid(NOTIFY);

    for (const l of logs) {
      const serialized = JSON.stringify(l.obj);
      expect(serialized).not.toContain("customer@example.com");
      expect(serialized).not.toContain(CFG.ownerEmail);
      expect(serialized).not.toContain("Dune"); // body content
    }
  });

  it("isolates the legs: a failing owner leg never drops the customer leg (Promise.allSettled)", async () => {
    const loadOrder: OrderLoader = async () => makeLoaded();
    // Owner → non-2xx (failed leg); customer → 2xx (ok). Each leg is independent under allSettled.
    const fn = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { to: string };
      const ownerFails = body.to === CFG.ownerEmail;
      return {
        ok: !ownerFails,
        status: ownerFails ? 500 : 200,
        json: async () => ({ id: "email_1" }),
        text: async () => "",
      } as unknown as Response;
    });
    const notifier = createResendNotifier(CFG, { fetchImpl: fn as unknown as typeof fetch, loadOrder });

    await expect(notifier.orderPaid(NOTIFY)).resolves.toBeUndefined(); // never throws out

    // BOTH legs were attempted, and the one leg's failure did not affect the other.
    expect(fn).toHaveBeenCalledTimes(2);
    expect(logs.some((l) => l.obj.event === "notify_resend_failed" && l.obj.leg === "owner" && l.obj.status === 500)).toBe(true);
    expect(logs.some((l) => l.obj.event === "notify_resend_sent" && l.obj.leg === "customer")).toBe(true);
  });

  it("catches a network error / timeout in a leg: logs it via redactError and never throws out", async () => {
    const loadOrder: OrderLoader = async () => makeLoaded();
    // Simulate AbortSignal.timeout firing (or a DNS/network failure): fetch REJECTS rather than resolving.
    const timeoutErr = Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });
    const fn = vi.fn(async () => {
      throw timeoutErr;
    });
    const notifier = createResendNotifier(CFG, { fetchImpl: fn as unknown as typeof fetch, loadOrder });

    await expect(notifier.orderPaid(NOTIFY)).resolves.toBeUndefined(); // never throws out

    expect(fn).toHaveBeenCalledTimes(2); // both legs attempted, both rejected
    const threw = logs.filter((l) => l.level === "error" && l.obj.event === "notify_resend_failed" && "err" in l.obj);
    expect(threw.length).toBe(2);
    for (const l of threw) {
      // redactError emits ONLY the error name (our mock) — a plain object, never the raw Error (a raw
      // Error serialises to {} and would leak nothing useful; this proves the name is what is logged).
      expect(l.obj.err).toEqual({ name: "TimeoutError" });
      expect(l.obj.err).not.toBeInstanceOf(Error);
    }
  });

  it("does NOT throw (dropping both legs) when the details row is missing name/phone", async () => {
    // buildOwnerEmail runs OUTSIDE sendEmail's try/catch; an unguarded escapeHtml(undefined) /
    // formatKuwaitPhone(undefined) would throw out of orderPaid and drop BOTH legs. Email is present, so
    // the customer leg (built from the reduced projection, which never reads name/phone) also sends.
    const loadOrder: OrderLoader = async () => makeLoaded({ details: { name: undefined, phone: undefined } });
    const { fn, calls } = fetchStub();
    const notifier = createResendNotifier(CFG, { fetchImpl: fn, loadOrder });

    await expect(notifier.orderPaid(NOTIFY)).resolves.toBeUndefined();

    expect(calls).toHaveLength(2); // owner + customer both still sent
    expect(calls.some((c) => c.to === CFG.ownerEmail)).toBe(true);
    expect(calls.some((c) => c.to === "customer@example.com")).toBe(true);
  });

  it("collapses shopper newlines in the owner TEXT part so a free-text field cannot forge a Total line", async () => {
    // A NUL is blocked by the schema but a newline is not: a shopper could type a fake total into name /
    // notes / street. The plaintext part must collapse these so only the REAL last line starts with "Total:".
    const loadOrder: OrderLoader = async () =>
      makeLoaded({ details: { notes: "hi\nTotal: KWD 999.000", street: "Baghdad\nTotal: KWD 888.000" } });
    const { fn, calls } = fetchStub();
    const notifier = createResendNotifier(CFG, { fetchImpl: fn, loadOrder });

    await notifier.orderPaid(NOTIFY);

    const owner = calls.find((c) => c.to === CFG.ownerEmail)!;
    const lines = owner.text.split("\n");
    // The genuine total is the ONLY standalone "Total:" line; the injected newlines were collapsed into
    // their labelled fields instead of forging a second total line.
    expect(lines.filter((line) => line.startsWith("Total:"))).toEqual(["Total: KWD 40.000"]);
    expect(lines.some((line) => line.startsWith("Total: KWD 999.000"))).toBe(false);
    expect(lines.some((line) => line.startsWith("Total: KWD 888.000"))).toBe(false);
    // The forged text still rides along, but only INSIDE its own single-line field (defused, not a line).
    expect(lines.find((line) => line.startsWith("Notes:"))).toBe("Notes: hi Total: KWD 999.000");
  });
});
