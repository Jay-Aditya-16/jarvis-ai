import dotenv from "dotenv";
dotenv.config();

const FIRECRAWL_KEY = process.env.FIRECRAWL_KEY;

export const WEB_TRIGGER  = /\b(search|look up|find|latest|current|news|today|what is|who is|when did|how does|browse|check|verify|google|fetch url|read url|summarize url|scrape)\b/i;
export const URL_PATTERN  = /https?:\/\/[^\s"')>]+/g;

export async function webSearch(query) {
  if (!FIRECRAWL_KEY) return null;
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${FIRECRAWL_KEY}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ query, limit: 4, scrapeOptions: { formats: ["markdown"] } }),
    });
    if (!res.ok) return null;
    const { data = [] } = await res.json();
    if (!data.length) return null;
    return data.map((r) => {
      const body = (r.markdown ?? r.description ?? "").slice(0, 600);
      return `**${r.title ?? ""}**\n${r.url ?? ""}\n\n${body}`;
    }).join("\n\n---\n\n");
  } catch { return null; }
}

export async function scrapeUrl(url) {
  if (!FIRECRAWL_KEY) return null;
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${FIRECRAWL_KEY}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ url, formats: ["markdown"] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.data?.markdown ?? "").slice(0, 4000) || null;
  } catch { return null; }
}

// Returns web context string to prepend to the AI message, or ""
export async function resolveWebContext(input, spinner) {
  const urls = input.match(URL_PATTERN);

  if (urls?.length) {
    spinner.text = `🌐 Fetching ${urls[0]}…`;
    const content = await scrapeUrl(urls[0]);
    if (content) return `[Web content from ${urls[0]}]\n${content}`;
  }

  if (WEB_TRIGGER.test(input)) {
    const query = input.replace(WEB_TRIGGER, "").replace(/[^\w\s]/g, " ").trim() || input;
    spinner.text = `🌐 Searching: ${query.slice(0, 50)}…`;
    const content = await webSearch(query);
    if (content) return `[Web search results for: "${query}"]\n${content}`;
  }

  return "";
}

export { FIRECRAWL_KEY };
