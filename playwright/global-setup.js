// ABOUTME: Generates a fresh AGENT frontdoor URL via sf CLI and saves storageState.
// ABOUTME: Frontdoor OTPs are single-use and short-lived: generate and navigate back-to-back.
const { chromium } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");

module.exports = async () => {
  const env = {
    ...process.env,
    PATH: `/opt/homebrew/opt/node@20/bin:${process.env.PATH}`
  };
  const out = execFileSync(
    "sf",
    ["org", "open", "-o", "AGENT", "--url-only", "--json"],
    { env }
  );
  const url = JSON.parse(out.toString()).result.url;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(
    "one-appnav, div.slds-global-header, one-app-launcher-header",
    { timeout: 60000 }
  );
  fs.mkdirSync("playwright/.auth", { recursive: true });
  await context.storageState({ path: "playwright/.auth/agent.json" });
  await browser.close();
};
