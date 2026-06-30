export async function browserSnapshot(url) {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    const title = await page.title();
    const text = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    await browser.close();
    return { ok: true, title, text: text.slice(0, 4000) };
  } catch (e) {
    return { ok: false, error: "Playwright is optional. Install it with `npm install -D playwright` and run `npx playwright install chromium`.", detail: e.message };
  }
}
