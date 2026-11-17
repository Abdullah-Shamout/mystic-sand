import "server-only";

import pino from "pino";

// One process-wide structured logger (JSON to stdout). Deliberately transport-free: a bare pino
// instance writes synchronously to fd 1 with no worker thread, so it is safe in the Next server
// runtime and never pulled onto an Edge bundle (only server-only modules import it).
//
// Used for money/stock ALERTS that must never be swallowed — above all an oversold capture
// (settleOrder could not fulfil a payment it cannot un-charge) and a payment whose amount/binding
// does not match its order. Those are `logger.error(...)`: they page a human, not the shopper.

export const logger = pino({
  name: "mystic-sand",
  level: process.env.LOG_LEVEL?.trim() || "info",
});
