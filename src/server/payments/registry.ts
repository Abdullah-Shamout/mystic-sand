import { sandboxGateway } from "./sandbox";
import type { PaymentGateway } from "./types";

/**
 * Normalizes the effective provider name from an env-shaped object. The boot assertion
 * (src/instrumentation.ts) reuses this so it and the registry always agree on which provider is in
 * effect. Pure: it reads only the object passed in (defaulting to process.env), so
 * `assertPaymentConfig` can pass its own env and stay side-effect-free.
 *
 * An empty string is treated as unset (the DB-free build passes `PAYMENT_PROVIDER=`), so both an
 * absent and a blank value resolve to the "sandbox" default.
 */
export function resolveProviderName(
  env: { [key: string]: string | undefined } = process.env,
): string {
  return (env.PAYMENT_PROVIDER ?? "").trim() || "sandbox";
}

/**
 * Resolves the active payment adapter from `process.env.PAYMENT_PROVIDER` (default "sandbox").
 * Throws on an unknown provider so a typo fails loudly rather than silently falling back.
 */
export function getGateway(): PaymentGateway {
  const name = resolveProviderName();
  switch (name) {
    case "sandbox":
      return sandboxGateway;
    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER "${name}". Supported providers: "sandbox".`,
      );
  }
}
