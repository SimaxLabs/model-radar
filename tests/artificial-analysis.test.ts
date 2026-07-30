import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArtificialAnalysisArticles } from "$lib/server/artificial-analysis";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Artificial Analysis articles", () => {
  it("extracts article titles, dates, and canonical URLs", () => {
    const html = `
      <a class="article" href="/articles/new-model-results">
        <img alt="ignored">
        <div>
          <h3>New Model &amp; benchmark results</h3>
          <p>July 29, 2026</p>
        </div>
      </a>
      <a href="/articles/second-story">
        <h3>Lab&#x27;s second story</h3>
        <p>July 24, 2026</p>
      </a>
      <a href="/articles?page=2">Next</a>
    `;

    expect(parseArtificialAnalysisArticles(html)).toEqual([
      {
        title: "New Model & benchmark results",
        url: "https://artificialanalysis.ai/articles/new-model-results",
        publishedDate: "2026-07-29",
      },
      {
        title: "Lab's second story",
        url: "https://artificialanalysis.ai/articles/second-story",
        publishedDate: "2026-07-24",
      },
    ]);
  });

  it("rejects duplicate, malformed, and invalid-date cards", () => {
    const html = `
      <a href="/articles/valid-story"><h3>Valid story</h3><p>February 28, 2026</p></a>
      <a href="/articles/valid-story"><h3>Duplicate story</h3><p>February 28, 2026</p></a>
      <a href="https://example.com/articles/external"><h3>External</h3><p>February 28, 2026</p></a>
      <a href="/articles/bad-date"><h3>Bad date</h3><p>February 30, 2026</p></a>
      <a href="/articles/missing-title"><p>February 28, 2026</p></a>
    `;

    expect(parseArtificialAnalysisArticles(html)).toEqual([
      {
        title: "Valid story",
        url: "https://artificialanalysis.ai/articles/valid-story",
        publishedDate: "2026-02-28",
      },
    ]);
  });

  it("reuses cached headlines for three hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T00:00:00Z"));
    const fetchMock = vi.fn(async () => new Response(
      '<a href="/articles/new-story"><h3>New story</h3><p>July 30, 2026</p></a>',
      { headers: { "Content-Type": "text/html" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { getArtificialAnalysisArticles } = await import("$lib/server/artificial-analysis");

    await getArtificialAnalysisArticles();
    await getArtificialAnalysisArticles();
    vi.advanceTimersByTime(3 * 60 * 60 * 1000 - 1);
    await getArtificialAnalysisArticles();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await getArtificialAnalysisArticles();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
