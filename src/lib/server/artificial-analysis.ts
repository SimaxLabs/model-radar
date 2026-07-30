import type { ArtificialAnalysisArticle } from "$lib/types";

const ARTICLES_URL = "https://artificialanalysis.ai/articles";
const ARTICLE_COUNT = 6;
const CACHE_TTL = 3 * 60 * 60 * 1000;
const MAX_RESPONSE_SIZE = 1_000_000;
const ARTICLE_PATH = /^\/articles\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARTICLE_LINK = /<a\b[^>]*\bhref\s*=\s*(["'])(\/articles\/[a-z0-9]+(?:-[a-z0-9]+)*)\1[^>]*>([\s\S]*?)<\/a>/gi;
const HEADING = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i;
const PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
const PUBLICATION_DATE = /^(January|February|March|April|May|June|July|August|September|October|November|December) ([1-9]|[12]\d|3[01]), (\d{4})$/;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

let cache: { data: ArtificialAnalysisArticle[]; expiresAt: number } | null = null;
let pending: Promise<ArtificialAnalysisArticle[]> | null = null;

function decodeHtml(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#(?:x[\da-f]+|\d+)|amp|apos|gt|lt|nbsp|quot);/gi, (entity, code: string) => {
    if (!code.startsWith("#")) return namedEntities[code.toLowerCase()] ?? entity;
    const value = code[1]?.toLowerCase() === "x"
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(value);
    } catch {
      return entity;
    }
  });
}

function textContent(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function hasControlCharacter(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function parseDate(value: string) {
  const match = PUBLICATION_DATE.exec(value);
  if (!match) return null;

  const month = MONTHS.indexOf(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) return null;
  return date.toISOString().slice(0, 10);
}

export function parseArtificialAnalysisArticles(html: string) {
  const articles: ArtificialAnalysisArticle[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(ARTICLE_LINK)) {
    const path = match[2];
    const body = match[3];
    if (!ARTICLE_PATH.test(path) || seen.has(path)) continue;

    const title = textContent(HEADING.exec(body)?.[1] ?? "");
    if (!title || title.length > 240 || hasControlCharacter(title)) continue;

    let publishedDate: string | null = null;
    for (const paragraph of body.matchAll(PARAGRAPH)) {
      publishedDate = parseDate(textContent(paragraph[1]));
      if (publishedDate) break;
    }
    if (!publishedDate) continue;

    articles.push({
      title,
      url: new URL(path, ARTICLES_URL).toString(),
      publishedDate,
    });
    seen.add(path);
    if (articles.length === ARTICLE_COUNT) break;
  }

  return articles;
}

async function requestArticles() {
  const response = await fetch(ARTICLES_URL, {
    headers: { Accept: "text/html" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Artificial Analysis returned ${response.status}`);
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/html")) {
    throw new Error("Artificial Analysis returned an invalid content type");
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_SIZE) {
    throw new Error("Artificial Analysis response is too large");
  }

  const html = await response.text();
  if (html.length > MAX_RESPONSE_SIZE) throw new Error("Artificial Analysis response is too large");
  const articles = parseArtificialAnalysisArticles(html);
  if (articles.length === 0) throw new Error("Artificial Analysis returned no valid articles");

  return articles;
}

export async function getArtificialAnalysisArticles() {
  if (cache && cache.expiresAt > Date.now()) return cache.data;
  if (pending) return pending;

  pending = requestArticles();
  try {
    const data = await pending;
    cache = { data, expiresAt: Date.now() + CACHE_TTL };
    return data;
  } catch (error) {
    if (cache) return cache.data;
    throw error;
  } finally {
    pending = null;
  }
}
