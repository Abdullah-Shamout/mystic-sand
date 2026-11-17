import { PHASE_PRODUCTION_BUILD } from "next/constants";

import { resolveProviderName } from "@/server/payments/registry";

// Next 16 instrumentation (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// instrumentation.md): `register()` runs once when a server instance starts, before it serves
// requests. We use it to REFUSE TO BOOT a real deployment that is still pointed at the sandbox
// payment adapter.

export type PaymentConfigEnv = {
  PAYMENT_PROVIDER?: string;
  APP_ENV?: string;
  PAYMENT_SANDBOX_OK?: string;
};

/** Environments where the sandbox adapter is allowed to run. */
const SANDBOX_SAFE_ENVS = new Set(["development", "test", "staging"]);

/**
 * Pure, side-effect-free (it only throws). Refuses the sandbox adapter outside a sandbox-safe
 * environment, so a production boot can never silently run the payment simulator. The effective
 * provider is resolved through the registry's `resolveProviderName`, so this and `getGateway` agree.
 * Exported, env-injected and free of its own process.env / I/O reads so it is unit-testable.
 */
export function assertPaymentConfig(env: PaymentConfigEnv): void {
  const provider = resolveProviderName(env);
  if (provider !== "sandbox") return;

  const appEnv = (env.APP_ENV ?? "").trim();
  const allowed = SANDBOX_SAFE_ENVS.has(appEnv) && env.PAYMENT_SANDBOX_OK === "true";
  if (allowed) return;

  throw new Error(
    `Refusing to boot: the payment provider resolves to "sandbox", but this is not a sandbox-safe ` +
      `environment (APP_ENV="${env.APP_ENV ?? ""}", PAYMENT_SANDBOX_OK="${env.PAYMENT_SANDBOX_OK ?? ""}"). ` +
      `The sandbox adapter only boots when APP_ENV is one of development|test|staging AND ` +
      `PAYMENT_SANDBOX_OK="true". Set a real PAYMENT_PROVIDER for this environment.`,
  );
}

export async function register(): Promise<void> {
  // `register` is called in every runtime; the payment config check is a Node-runtime concern.
  // (instrumentation.ts is also compiled for the Edge runtime because proxy.ts runs on Edge.)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `register` can run during `next build`; the sandbox-safety gate is about real server boots, not
  // the build, so skip it there. This also keeps the DB-free production build green.
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;

  assertPaymentConfig({
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
    APP_ENV: process.env.APP_ENV,
    PAYMENT_SANDBOX_OK: process.env.PAYMENT_SANDBOX_OK,
  });
}
