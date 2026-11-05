import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const OUT = new URL("../output/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/opt/meta-chromium/chrome",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--window-size=1280,760",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
page.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 300)));
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 500)));

await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded", timeout: 60000 });

// wait for engine ready
try {
  await page.waitForFunction(() => (window).__ready === true || (window).__error, { timeout: 120000 });
} catch {}
const err = await page.evaluate(() => (window).__error ?? null);
if (err) {
  console.log("PAGE_ERROR:", err);
  await page.screenshot({ path: OUT + "navara-error.png" });
  await browser.close();
  process.exit(2);
}

// let tiles stream in; poll the view stats if available, else fixed wait
await new Promise((r) => setTimeout(r, 45000));
let status = await page.evaluate(() => (window).__status ?? "");
console.log("status after load:", status);
await page.screenshot({ path: OUT + "navara-tokyo-day.png" });
console.log("shot day");

for (const key of ["sunset", "night"]) {
  await page.click(`button[data-time="${key}"]`);
  await new Promise((r) => setTimeout(r, 15000));
  status = await page.evaluate(() => (window).__status ?? "");
  console.log(`status ${key}:`, status);
  await page.screenshot({ path: OUT + `navara-tokyo-${key}.png` });
  console.log("shot", key);
}

await browser.close();
console.log("DONE");
