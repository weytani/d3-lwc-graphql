// ABOUTME: Live-org sweep: for every chart instance on the graphql showcase pages,
// ABOUTME: assert SVG marks rendered, zero console errors, and a stable visual baseline.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const manifest = JSON.parse(
  fs.readFileSync("playwright/chart-manifest.json", "utf8")
);

function orgBaseFromState() {
  const state = JSON.parse(
    fs.readFileSync("playwright/.auth/agent.json", "utf8")
  );
  const c =
    state.cookies.find(
      (k) => k.name === "sid" && k.domain.includes("lightning.force.com")
    ) || state.cookies.find((k) => k.name === "sid");
  return `https://${c.domain.replace(/^\./, "")}`;
}

for (const pageDef of manifest.pages) {
  test.describe(`page ${pageDef.tab}`, () => {
    test(`renders all charts cleanly`, async ({ page }) => {
      const consoleErrors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(String(err)));
      await page.goto(`${orgBaseFromState()}/lightning/n/${pageDef.tab}`, {
        waitUntil: "load"
      });
      await page.waitForTimeout(8000); // Lightning + graphql wire + d3 draw
      for (const chart of pageDef.charts) {
        const host = page.locator(chart.element).first();
        await expect(host, `${chart.name} present`).toBeVisible({
          timeout: 30000
        });
        const svgCount = await host.locator("svg *").count();
        expect(
          svgCount,
          `${chart.name} rendered ${svgCount} svg nodes`
        ).toBeGreaterThanOrEqual(chart.minSvgDescendants);
        await page.waitForTimeout(1500); // let d3 transitions settle before pixels
        await expect(host).toHaveScreenshot(`${chart.name}-${pageDef.tab}.png`);
      }
      expect(consoleErrors, `console errors on ${pageDef.tab}`).toEqual([]);
    });
  });
}
