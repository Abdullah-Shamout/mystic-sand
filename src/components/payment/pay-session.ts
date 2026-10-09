import type { DemoOutcome } from "@/components/layout/demo-helpers";

export type PayStep = "bank" | "card" | "confirm" | "otp" | "secure" | "processing";

/**
 * The simulated gateway session, kept in sessionStorage so that a refresh or a
 * language switch resumes the same step and the same countdown — as a real
 * hosted payment page would. A new attempt (or another order) starts afresh.
 */
export type PaySession = {
  /** `${orderId}|${method}|${attemptCount}` */
  key: string;
  deadline: number;
  step: PayStep;
  bankId: string | null;
  otp: string | null;
  otpDeadline: number | null;
  outcome: DemoOutcome;
};

const STORAGE_KEY = "ms-pay-session";

export function loadPaySession(key: string, now: number): PaySession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as PaySession;
    return session.key === key && session.deadline > now ? session : null;
  } catch {
    return null;
  }
}

export function savePaySession(session: PaySession) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // storage blocked — the gateway still works, it just won't resume
  }
}

export function clearPaySession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked
  }
}
