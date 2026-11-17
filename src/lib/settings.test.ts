import { describe, expect, it } from "vitest";

import {
  cleanTickerList,
  defaultSettings,
  feeFor,
  resolveSettings,
  TICKER_CHARS,
  TICKER_MAX,
} from "./settings";

// Pure-function unit coverage for the store-settings validators (src/lib/settings.ts). No DB.

describe("cleanTickerList", () => {
  it("trims each message and drops the empty ones", () => {
    expect(cleanTickerList(["  hello  ", "", "   ", "world"])).toEqual(["hello", "world"]);
  });

  it("drops messages longer than TICKER_CHARS but keeps ones exactly at the cap", () => {
    const atCap = "a".repeat(TICKER_CHARS);
    const overCap = "a".repeat(TICKER_CHARS + 1);
    expect(cleanTickerList([atCap, overCap])).toEqual([atCap]);
  });

  it("filters first, THEN caps the survivors to TICKER_MAX", () => {
    // Six entries, one blank: the blank is removed first, then the rest are capped to TICKER_MAX.
    const out = cleanTickerList(["1", "", "2", "3", "4", "5"]);
    expect(out).toEqual(["1", "2", "3", "4"]);
    expect(out).toHaveLength(TICKER_MAX);
  });

  it("always returns an array, even for an empty input", () => {
    expect(cleanTickerList([])).toEqual([]);
  });
});

describe("resolveSettings", () => {
  it("returns the defaults for undefined / null / empty overrides", () => {
    expect(resolveSettings(undefined)).toEqual(defaultSettings);
    expect(resolveSettings(null)).toEqual(defaultSettings);
    expect(resolveSettings({})).toEqual(defaultSettings);
  });

  it("keeps an in-range integer fee and falls back otherwise", () => {
    expect(resolveSettings({ standardFeeFils: 1500 }).standardFeeFils).toBe(1500);
    expect(resolveSettings({ standardFeeFils: 0 }).standardFeeFils).toBe(0);
    expect(resolveSettings({ standardFeeFils: -5 }).standardFeeFils).toBe(defaultSettings.standardFeeFils);
    expect(resolveSettings({ standardFeeFils: 50001 }).standardFeeFils).toBe(defaultSettings.standardFeeFils);
    expect(resolveSettings({ standardFeeFils: 1500.5 }).standardFeeFils).toBe(defaultSettings.standardFeeFils);
  });

  it("normalizes a valid whatsapp mobile to '965XXXXXXXX' and rejects a non-mobile", () => {
    expect(resolveSettings({ whatsapp: "51234567" }).whatsapp).toBe("96551234567");
    expect(resolveSettings({ whatsapp: "+965 5123 4567" }).whatsapp).toBe("96551234567");
    // A landline is not a valid whatsapp number → default.
    expect(resolveSettings({ whatsapp: "22345678" }).whatsapp).toBe(defaultSettings.whatsapp);
    expect(resolveSettings({ whatsapp: "nope" }).whatsapp).toBe(defaultSettings.whatsapp);
  });

  it("accepts any normalized 8-digit phone (including a landline) and rejects the rest", () => {
    expect(resolveSettings({ phone: "51234567" }).phone).toBe("51234567");
    expect(resolveSettings({ phone: "+96551234567" }).phone).toBe("51234567");
    expect(resolveSettings({ phone: "22345678" }).phone).toBe("22345678"); // isPhone only checks 8 digits
    expect(resolveSettings({ phone: "123" }).phone).toBe(defaultSettings.phone);
  });

  it("cleans the ticker lists per locale and defaults each missing one", () => {
    const out = resolveSettings({ ticker: { en: ["  Free delivery  ", ""], ar: [] } });
    expect(out.ticker.en).toEqual(["Free delivery"]);
    expect(out.ticker.ar).toEqual([]);
  });

  it("drops non-string ticker entries before cleaning", () => {
    const overrides = { ticker: { en: ["ok", 5, null, "two"] } } as unknown as Parameters<typeof resolveSettings>[0];
    expect(resolveSettings(overrides).ticker.en).toEqual(["ok", "two"]);
  });
});

describe("feeFor", () => {
  it("returns the single standard delivery fee", () => {
    expect(feeFor({ ...defaultSettings, standardFeeFils: 1500 })).toBe(1500);
  });
});
