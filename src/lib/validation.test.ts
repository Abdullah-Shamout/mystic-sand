import { describe, expect, it } from "vitest";

import { checkoutSchema, emptyCheckoutForm, noNul, type CheckoutForm } from "./validation";

// Unit coverage for the NUL-byte hardening of the user-facing text schemas. A \u0000 passes zod's
// string checks but Postgres text/jsonb THROWS on INSERT, so checkoutSchema (which has NO rate limiter)
// and the contact schema reject it up front via the shared noNul predicate. Rejecting ONLY \u0000 — not
// every control character — keeps legitimate multi-line input working. (The contact schema lives in a
// "use server" module and can't be imported here; it shares this same noNul predicate.)

/** A complete, valid checkout form (housing "house" → floor/apartment optional). */
const VALID: CheckoutForm = {
  ...emptyCheckoutForm,
  name: "Checkout Tester",
  phone: "99123456",
  areaId: "salmiya",
  block: "1",
  street: "Street 1",
  building: "5",
  acceptTerms: true,
};

describe("noNul", () => {
  it("rejects a string containing a NUL byte and accepts normal (incl. multi-line) text", () => {
    expect(noNul("hello")).toBe(true);
    expect(noNul("line one\nline two")).toBe(true); // multi-line is fine — only \u0000 is rejected
    expect(noNul("a\u0000b")).toBe(false);
    expect(noNul("\u0000")).toBe(false);
  });
});

describe("checkoutSchema NUL hardening", () => {
  it("accepts the valid form", () => {
    expect(checkoutSchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts a multi-line notes value (multi-line text must still work)", () => {
    const result = checkoutSchema.safeParse({ ...VALID, notes: "Leave at the door.\nCall on arrival." });
    expect(result.success).toBe(true);
  });

  it("rejects a NUL byte in a stored text field — cleanly via safeParse, never throwing", () => {
    for (const field of ["name", "street", "notes", "mapsLink", "areaId"] as const) {
      const result = checkoutSchema.safeParse({ ...VALID, [field]: "x\u0000y" });
      expect(result.success, `${field} carrying a NUL should be rejected`).toBe(false);
    }
  });
});
