import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Unit coverage for the notifier registry: name resolution and the fail-safe, lazy resend construction
// (NOTIFIER=resend with a key+from → resend adapter; missing key/from → log fallback + ONE boot error).

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

import { logNotifier } from "./log";
import { __resetNotifierRegistryForTest, getNotifier, resolveNotifierName } from "./registry";

const ENV_KEYS = ["NOTIFIER", "RESEND_API_KEY", "RESEND_FROM", "OWNER_NOTIFY_EMAIL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  logs.length = 0;
  __resetNotifierRegistryForTest();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  __resetNotifierRegistryForTest();
});

describe("resolveNotifierName", () => {
  it("defaults to 'log' when unset or blank", () => {
    expect(resolveNotifierName({})).toBe("log");
    expect(resolveNotifierName({ NOTIFIER: "" })).toBe("log");
    expect(resolveNotifierName({ NOTIFIER: "   " })).toBe("log");
  });

  it("returns the configured, trimmed name", () => {
    expect(resolveNotifierName({ NOTIFIER: "resend" })).toBe("resend");
    expect(resolveNotifierName({ NOTIFIER: "  resend  " })).toBe("resend");
  });
});

describe("getNotifier", () => {
  it("returns the log adapter when unset", () => {
    expect(getNotifier()).toBe(logNotifier);
  });

  it("falls back to the log adapter for an unknown channel (fail-safe)", () => {
    process.env.NOTIFIER = "smoke-signals";
    expect(getNotifier()).toBe(logNotifier);
  });

  it("returns the resend adapter when NOTIFIER=resend and the key + from are set", () => {
    process.env.NOTIFIER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "orders@test.dev";
    const notifier = getNotifier();
    expect(notifier).not.toBe(logNotifier); // a distinct, constructed resend adapter
    expect(typeof notifier.orderPaid).toBe("function");
    expect(logs.some((l) => l.obj.event === "notify_resend_misconfigured")).toBe(false);
  });

  it("falls back to the log adapter + logs ONE boot error when the key/from is missing", () => {
    process.env.NOTIFIER = "resend"; // but no RESEND_API_KEY / RESEND_FROM
    expect(getNotifier()).toBe(logNotifier);
    // Memoized: a second call does not re-log.
    expect(getNotifier()).toBe(logNotifier);
    const errs = logs.filter((l) => l.level === "error" && l.obj.event === "notify_resend_misconfigured");
    expect(errs).toHaveLength(1);
  });
});
