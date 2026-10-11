import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import { mockApi } from "./fixtures";

for (const scenario of [
  { name: "desktop-light", width: 1440, theme: "light" },
  { name: "tablet-dark", width: 1024, theme: "dark" },
  { name: "mobile-light", width: 390, theme: "light" },
  { name: "mobile-dark", width: 360, theme: "dark" },
] as const) {
  test(`About, navigation and privacy: ${scenario.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 960 });
    await page.emulateMedia({ colorScheme: scenario.theme, reducedMotion: "reduce" });
    await page.addInitScript((theme) => localStorage.setItem("df-theme", theme), scenario.theme);
    await mockApi(page);
    await page.goto("/");
    await page.locator("footer").getByRole("link", { name: "About", exact: true }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page).toHaveTitle("About | DecisionForge AI");
    await expect(
      page.locator("footer").getByRole("link", { name: "About", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "The method behind better decisions.",
    );
    for (const title of [
      "Why build another decision tool?",
      "AI advises. You decide.",
      "One person. A considered product.",
      "Depth before more features.",
      "A few principles, made practical.",
      "Let's talk.",
    ]) {
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
    await expect(page.getByText(/DecisionForge is a solo project/)).toBeVisible();
    await expect(page.getByText("dhananjayvaidya4154@gmail.com", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () =>
      (
        await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    );
    expect(violations).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("about.png"), fullPage: true });
    await page.locator("#connect").screenshot({ path: testInfo.outputPath("contact.png") });
    await page.locator("footer").getByRole("link", { name: "Privacy", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("How your data is used.");
    await expect(page.getByText(/There is no automatic expiry/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("link", { name: "Back to About & contact" }).click();
    await expect(page).toHaveURL(/\/about#connect$/);
    await expect(page.getByRole("heading", { name: "Let's talk.", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(500);
  });
}

async function fillContact(page: Page) {
  await page.getByLabel("Name", { exact: true }).fill("Browser Test Visitor");
  await page.getByLabel("Email", { exact: true }).fill("browser-test@example.com");
  await page.getByLabel("Reason", { exact: true }).selectOption("feedback");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Please make outcome reviews easier to share.");
  await page.getByRole("checkbox").check();
}

test("contact keyboard path, public payload, loading and receipt", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockApi(page);
  let posted: unknown;
  await page.route("**/api/v1/contact", async (route) => {
    posted = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/about");
  await page.getByRole("button", { name: "Go to the form" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
  for (const label of ["Email", "Reason", "Message"]) {
    await page.keyboard.press("Tab");
    await expect(page.getByLabel(label, { exact: true })).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(page.getByRole("checkbox")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "How this data is used" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeFocused();
  for (const selector of [
    "#contact-name",
    "#contact-email",
    "#contact-reason",
    "#contact-message",
    'label[for="contact-consent"]',
  ]) {
    expect((await page.locator(selector).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("Enter your name.", { exact: true })).toBeVisible();
  expect(posted).toBeUndefined();
  await fillContact(page);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Thanks — your message is in." })).toBeVisible();
  await expect(page.locator("#contact-receipt")).toBeFocused();
  expect(posted).toEqual({
    name: "Browser Test Visitor",
    email: "browser-test@example.com",
    reason: "feedback",
    message: "Please make outcome reviews easier to share.",
    consent: true,
    website: "",
  });
  await page.getByRole("button", { name: "Send another message" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
});

test("server validation and rate limits preserve the contact message", async ({ page }) => {
  await mockApi(page);
  let attempt = 0;
  await page.route("**/api/v1/contact", async (route) => {
    attempt++;
    if (attempt === 1)
      await route.fulfill({
        status: 400,
        json: {
          error: {
            code: "validation_error",
            message: "Check the fields",
            fields: { email: ["Please check this address."] },
          },
        },
      });
    else if (attempt === 2)
      await route.fulfill({
        status: 429,
        headers: { "Retry-After": "42" },
        json: { error: { code: "rate_limited", message: "Please wait", retry_after_seconds: 42 } },
      });
    else await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/about");
  await fillContact(page);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("Please check this address.")).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await page.getByLabel("Email", { exact: true }).fill("corrected@example.com");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Please wait 42 seconds");
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    "Please make outcome reviews easier to share.",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText(/reply is needed, it will go to corrected@example.com/),
  ).toBeVisible();
});

test("onboarding opens registration, launches the landing tour and keeps Guide connected", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockApi(page);
  await page.goto("/about");
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/about");
  await page.getByRole("button", { name: "Take the tour", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Describe it", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "About DecisionForge & contact" }).click();
  await expect(page).toHaveURL(/\/about$/);
});

test("copy email uses the confirmed address", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockApi(page);
  await page.goto("/about");
  await page.getByRole("button", { name: "Copy email" }).click();
  await expect(page.getByText("Email copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "dhananjayvaidya4154@gmail.com",
  );
});
