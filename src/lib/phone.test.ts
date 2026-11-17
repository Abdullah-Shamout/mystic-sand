import { describe, expect, it } from "vitest";

import { formatKuwaitPhone, normalizeKuwaitPhone, phoneStatus } from "./phone";

// Pure-function unit coverage for the Kuwaiti phone helpers (src/lib/phone.ts). No DB, no browser.

describe("normalizeKuwaitPhone", () => {
  it("strips whitespace, dashes, parens and dots", () => {
    expect(normalizeKuwaitPhone("9123 4567")).toBe("91234567");
    expect(normalizeKuwaitPhone("(912)-345.67")).toBe("91234567");
    expect(normalizeKuwaitPhone("  5123-4567  ")).toBe("51234567");
  });

  it("strips a +965 / 00965 / 965 country prefix when it fronts exactly 8 digits", () => {
    expect(normalizeKuwaitPhone("+965 9123 4567")).toBe("91234567");
    expect(normalizeKuwaitPhone("0096591234567")).toBe("91234567");
    expect(normalizeKuwaitPhone("96591234567")).toBe("91234567");
  });

  it("does NOT strip a leading 965 that is not followed by exactly 8 digits", () => {
    // "96512345" is only 8 digits total, so the 965 is part of the local number, not a country code.
    expect(normalizeKuwaitPhone("96512345")).toBe("96512345");
    // 965 followed by 9 digits: the prefix rule requires exactly 8 trailing, so nothing is stripped.
    expect(normalizeKuwaitPhone("965123456789")).toBe("965123456789");
  });

  it("converts Arabic-Indic and Persian digits to Latin", () => {
    expect(normalizeKuwaitPhone("٩١٢٣٤٥٦٧")).toBe("91234567");
    expect(normalizeKuwaitPhone("۵۱۲۳۴۵۶۷")).toBe("51234567");
  });

  it("strips bidi control marks (LRM / RLM / isolates)", () => {
    expect(normalizeKuwaitPhone("9123‎4567")).toBe("91234567");
    expect(normalizeKuwaitPhone("⁦5123⁧4567⁩")).toBe("51234567");
  });

  it("returns an empty string for empty / punctuation-only input", () => {
    expect(normalizeKuwaitPhone("")).toBe("");
    expect(normalizeKuwaitPhone("  -- () ")).toBe("");
  });
});

describe("phoneStatus", () => {
  it("is 'empty' for blank input", () => {
    expect(phoneStatus("")).toBe("empty");
    expect(phoneStatus("   ")).toBe("empty");
  });

  it("is 'valid' for 8-digit mobiles starting 5 / 6 / 9 or 41", () => {
    expect(phoneStatus("51234567")).toBe("valid");
    expect(phoneStatus("61234567")).toBe("valid");
    expect(phoneStatus("91234567")).toBe("valid");
    expect(phoneStatus("41234567")).toBe("valid"); // 41 + 6 digits
  });

  it("accepts mobiles given with a country prefix or Arabic digits", () => {
    expect(phoneStatus("+965 5123 4567")).toBe("valid");
    expect(phoneStatus("0096561234567")).toBe("valid");
    expect(phoneStatus("٩١٢٣٤٥٦٧")).toBe("valid");
  });

  it("treats '96512345' as a valid mobile (8 digits starting 9, no country code stripped)", () => {
    expect(phoneStatus("96512345")).toBe("valid");
  });

  it("is 'landline' for 8-digit numbers starting with 2", () => {
    expect(phoneStatus("22345678")).toBe("landline");
    expect(phoneStatus("24001234")).toBe("landline");
  });

  it("is 'invalid' for the wrong length or an unsupported prefix", () => {
    expect(phoneStatus("12345678")).toBe("invalid"); // starts 1
    expect(phoneStatus("71234567")).toBe("invalid"); // starts 7
    expect(phoneStatus("512345")).toBe("invalid"); // too short
    expect(phoneStatus("512345678")).toBe("invalid"); // too long
  });
});

describe("formatKuwaitPhone", () => {
  it("formats 8 local digits as '+965 XXXX XXXX'", () => {
    expect(formatKuwaitPhone("91234567")).toBe("+965 9123 4567");
    expect(formatKuwaitPhone("+965 9123 4567")).toBe("+965 9123 4567");
  });

  it("returns the normalized digits unchanged when they are not exactly 8", () => {
    expect(formatKuwaitPhone("12345")).toBe("12345");
  });
});
