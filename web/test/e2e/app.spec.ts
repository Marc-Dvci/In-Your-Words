import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

/** Demo mode replays questions recorded from real Gemini Nano runs and keeps seals in this browser. */
const DEMO = "/?demo";

async function noSeriousA11y(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}

test("the home screen says what it is and passes WCAG 2.2 AA", async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Write down what you saw");
  await expect(page.getByText("No word of ours")).toBeVisible();
  await noSeriousA11y(page);
});

test("the demo scene shows a recorded on-device question tied to the witness's words", async ({ page }) => {
  await page.goto(`${DEMO}#/demo`);
  await expect(page.locator("h2.question")).toBeVisible();
  await expect(page.locator(".qmeta")).toContainText(/Asked on this device|A fixed question/);
  await expect(page.locator(".answer-text .src").first()).toBeVisible();
  await expect.poll(async () => page.locator("svg.links path").count()).toBeGreaterThan(0);
  await noSeriousA11y(page);
});

async function fullInterview(page: Page) {
  await page.goto(DEMO);
  await page.evaluate(() => localStorage.clear());
  await page.getByRole("button", { name: "Start a new account" }).click();
  await page.getByRole("button", { name: "Begin the demo" }).click();
  await page.getByLabel("Your answer").fill("There was a sticker on the rear window, white, maybe round.");
  await page.getByRole("button", { name: /Next/ }).click();
  const seal = page.getByRole("button", { name: "Seal my account" });
  for (let i = 0; i < 12; i++) {
    await expect(page.getByLabel("Your answer").or(seal)).toBeVisible();
    if (await seal.isVisible()) break;
    await page.getByRole("button", { name: "Nothing more to add" }).click();
    await page.waitForTimeout(400);
  }
}

test("a sealed account checks as unchanged, and a single changed character is caught", async ({ page }, info) => {
  await fullInterview(page);
  await expect(page.getByText("Your account, exactly as written.")).toBeVisible();
  await noSeriousA11y(page);
  await page.getByRole("button", { name: "Seal my account" }).click();
  await expect(page.locator(".stime")).toBeVisible();
  const fp = (await page.locator(".hex").getAttribute("aria-label"))!.replace("Fingerprint ", "");
  expect(fp).toMatch(/^[0-9a-f]{64}$/);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Keep a copy" }).click()]);
  const file = info.outputPath("account.json");
  await download.saveAs(file);

  await page.getByRole("button", { name: "In Your Words, home" }).click();
  await page.getByRole("button", { name: "Check a sealed account" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Drop the account file here/ }).click();
  await (await chooser).setFiles(file);
  await expect(page.getByText("Unchanged since it was sealed.")).toBeVisible();

  const tampered = JSON.parse(readFileSync(file, "utf8"));
  tampered.account.phases[0].turns[0].answer = tampered.account.phases[0].turns[0].answer.replace("white", "black");
  const bad = info.outputPath("tampered.json");
  writeFileSync(bad, JSON.stringify(tampered));
  await page.getByRole("button", { name: "Check another file" }).click();
  const chooser2 = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Drop the account file here/ }).click();
  await (await chooser2).setFiles(bad);
  await expect(page.getByText("Changed after it was sealed.")).toBeVisible();
});

test("an account moves to another device with a code, and opens there", async ({ page, context }) => {
  await page.goto(DEMO);
  await page.evaluate(() => localStorage.clear());
  await page.getByRole("button", { name: "Start a new account" }).click();
  await page.getByRole("button", { name: "Begin the demo" }).click();
  await page.getByLabel("Your answer").fill("I saw a dark estate car drive off towards the bridge.");
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByRole("button", { name: "Continue on another device" }).click();
  await expect(page.locator(".code")).toHaveText(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/);
  const code = (await page.locator(".code").textContent())!;

  const other = await context.newPage();
  await other.goto(DEMO);
  await other.getByRole("button", { name: "Continue from another device" }).click();
  await other.getByLabel("Code from your other device").fill(code.toLowerCase());
  await other.getByRole("button", { name: "Open my account" }).click();
  await other.getByRole("button", { name: "Begin the demo" }).click();
  await expect(other.locator(".answer-text").first()).toContainText("dark estate car");
});

test("a refused code says so plainly", async ({ page }) => {
  await page.goto(DEMO);
  await page.getByRole("button", { name: "Continue from another device" }).click();
  await page.getByLabel("Code from your other device").fill("0000-0000-0000-0000-0000");
  await page.getByRole("button", { name: "Open my account" }).click();
  await expect(page.getByText(/No account waits under this code/)).toBeVisible();
});
