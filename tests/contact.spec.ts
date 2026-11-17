import { expect, test, type Page } from "@playwright/test";

import { countContactMessagesForIp, readLatestContactMessage } from "./db";

// The server-backed contact form (src/components/content/contact-form.tsx → submitContact in
// src/server/actions/contact.ts). A valid submission persists a contact_messages row and fires a
// best-effort notification; the per-IP limiter (src/server/notify/contact-rate-limit.ts) blunts a
// flood.
//
// Desktop only: the limiter is a process-global, in-memory store shared by the one `next start`
// process, so running these under both the desktop AND mobile projects would double-count against it
// (and the rate-limit test's own IP would already be spent on the second project). Each test uses its
// OWN random XFF IP so it keeps a fresh limiter bucket (the limiter has no clear-on-success and
// persists for the life of the server, across a reuseExistingServer re-run).

/** A fresh, valid IPv4 per test so the per-IP limiter bucket starts empty (clientIp reads XFF). */
function randomIp(): string {
  const oct = () => 1 + Math.floor(Math.random() * 250);
  return `198.51.${oct()}.${oct()}`;
}

async function fillContact(
  page: Page,
  opts?: { name?: string; phone?: string; message?: string },
): Promise<void> {
  await page.getByLabel("Full name").fill(opts?.name ?? "Contact Tester");
  await page.getByLabel("Mobile number").fill(opts?.phone ?? "99123456");
  await page.getByLabel("Your message").fill(opts?.message ?? "Hello, I have a question about an order.");
}

test.describe("contact form submission", () => {
  test.skip(({ isMobile }) => isMobile, "Contact specs run on the desktop project (shared in-memory limiter)");

  test("a valid submission is persisted and shows the success state", async ({ page }) => {
    const ip = randomIp();
    await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await page.goto("/en/contact/");

    await fillContact(page, { name: "Dunes Tester", message: "Please tell me about delivery to Salmiya." });
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("Thank you — your message is on its way")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send another message" })).toBeVisible();

    // Exactly one row for this IP, with the server-normalized phone and the locale from the page.
    expect(await countContactMessagesForIp(ip)).toBe(1);
    const row = await readLatestContactMessage();
    expect(row?.name).toBe("Dunes Tester");
    expect(row?.phone).toBe("+96599123456");
    expect(row?.message).toContain("delivery to Salmiya");
    expect(row?.locale).toBe("en");
    expect(row?.ip).toBe(ip); // proves the XFF header reached clientIp() (not "unknown"/loopback)
  });

  test("a client-invalid submission is blocked before it reaches the server", async ({ page }) => {
    const ip = randomIp();
    await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await page.goto("/en/contact/");

    // A landline is rejected by the client validation (phoneStatus === "landline"): onSubmit focuses the
    // bad field and returns BEFORE calling the server, so nothing is persisted or counted.
    await fillContact(page, { phone: "22212345", message: "This is a valid length message." });
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("Please check the fields marked below.")).toBeVisible();
    await expect(page.getByText("Thank you — your message is on its way")).toHaveCount(0);
    expect(await countContactMessagesForIp(ip)).toBe(0);
  });

  test("the per-IP rate limit trips after the threshold", async ({ page }) => {
    const ip = randomIp();
    await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await page.goto("/en/contact/");

    // The limiter allows 5 submissions / 15 min / IP; the 6th is throttled.
    for (let i = 0; i < 5; i++) {
      await fillContact(page, { message: `Message number ${i + 1} about my recent order.` });
      await page.getByRole("button", { name: "Send message" }).click();
      await expect(page.getByText("Thank you — your message is on its way")).toBeVisible();
      await page.getByRole("button", { name: "Send another message" }).click();
      await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
    }

    // The 6th attempt is over the limit → an inline throttled error, not the success state.
    await fillContact(page, { message: "One message too many about my order." });
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByTestId("contact-server-error")).toContainText(/several messages/i);
    await expect(page.getByText("Thank you — your message is on its way")).toHaveCount(0);

    // Exactly the 5 allowed submissions were persisted — the throttled 6th wrote nothing.
    expect(await countContactMessagesForIp(ip)).toBe(5);
  });
});
