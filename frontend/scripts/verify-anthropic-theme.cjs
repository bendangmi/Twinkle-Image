const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = "http://127.0.0.1:3100";
const results = path.resolve(__dirname, "..", "test-results");
fs.mkdirSync(results, { recursive: true });

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  const widest = Math.max(dimensions.document, dimensions.body);
  if (widest > dimensions.viewport + 1) {
    throw new Error(`${label} overflows: ${JSON.stringify(dimensions)}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await desktop.goto(baseUrl, { waitUntil: "networkidle" });
  await desktop.getByText("Twinkle Image", { exact: true }).first().waitFor();
  await assertNoHorizontalOverflow(desktop, "desktop");
  await desktop.screenshot({ path: path.join(results, "anthropic-theme-desktop.png"), fullPage: true });

  await desktop.getByRole("button", { name: "设置" }).click();
  await desktop.getByText("设置", { exact: true }).last().waitFor();
  await desktop.screenshot({ path: path.join(results, "anthropic-theme-settings.png"), fullPage: true });
  await desktop.keyboard.press("Escape");

  await desktop.getByRole("button", { name: "切换主题" }).click();
  await desktop.getByRole("menuitemradio", { name: "暗色" }).click();
  await desktop.waitForTimeout(250);
  const theme = await desktop.locator("html").getAttribute("data-theme");
  if (theme !== "dark") throw new Error(`Theme switch failed: ${theme}`);
  await desktop.screenshot({ path: path.join(results, "anthropic-theme-dark.png"), fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  await mobile.locator(".brand-mark").first().waitFor();
  await assertNoHorizontalOverflow(mobile, "mobile");
  await mobile.screenshot({ path: path.join(results, "anthropic-theme-mobile.png"), fullPage: true });

  console.log("PASS: desktop, settings, dark theme, and mobile layouts verified");
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
