<script lang="ts">
  import { base } from "$app/paths";
  import {
    Activity,
    BrainCircuit,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Database,
    ExternalLink,
    Gauge,
    Newspaper,
    Plus,
    RefreshCw,
    Scale,
    Search,
    Sparkles,
    X,
  } from "@lucide/svelte";
  import ModelComparison from "$lib/components/ModelComparison.svelte";
  import ModelDetail from "$lib/components/ModelDetail.svelte";
  import PriceChange from "$lib/components/PriceChange.svelte";
  import ProviderLogo from "$lib/components/ProviderLogo.svelte";
  import RecommendationCard from "$lib/components/RecommendationCard.svelte";
  import SourcePill from "$lib/components/SourcePill.svelte";
  import { formatPrice, money } from "$lib/format";
  import { rankBudgetModels } from "$lib/scoring";
  import type { RadarData, RadarModel } from "$lib/types";
  import type { PageData } from "./$types";

  type Filter = "all" | "cheap" | "state-of-the-art" | "changed";
  type Sort = "rank" | "value" | "price";
  const RECOMMENDATION_COUNT = 5;
  const COMPARISON_LIMIT = 4;
  const PAGE_SIZE = 25;
  const articleDate = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  let { data }: { data: PageData } = $props();
  let refreshedRadar = $state<RadarData | null>(null);
  let radar = $derived(refreshedRadar ?? data.radar);
  let filter = $state<Filter>("all");
  let sort = $state<Sort>("rank");
  let search = $state("");
  let pageNumber = $state(1);
  let modelTable: HTMLDivElement;
  let inputMillions = $state(10);
  let outputMillions = $state(2);
  let selectedModel = $state<RadarModel | null>(null);
  let comparisonIds = $state<string[]>([]);
  let comparisonOpen = $state(false);
  let refreshing = $state(false);
  let refreshError = $state<string | null>(null);
  let activeSection = $state<"radar" | "news" | "models">("radar");

  let safeInputMillions = $derived(Number.isFinite(inputMillions) ? Math.max(0, inputMillions) : 0);
  let safeOutputMillions = $derived(Number.isFinite(outputMillions) ? Math.max(0, outputMillions) : 0);
  let comparisonModels = $derived(
    comparisonIds
      .map((modelId) => radar.models.find((model) => model.id === modelId))
      .filter((model): model is RadarModel => model !== undefined),
  );
  let rankedModels = $derived(radar.models.filter((model) => model.intelligence !== null));
  let recentArticleCount = $derived.by(() => {
    const cutoffDate = new Date(
      Date.parse(`${radar.snapshotDate}T00:00:00Z`) - 24 * 60 * 60 * 1000,
    ).toISOString().slice(0, 10);
    return data.articles.filter(
      (article) => article.publishedDate >= cutoffDate && article.publishedDate <= radar.snapshotDate,
    ).length;
  });
  let topQuality = $derived(
    [...rankedModels].sort(
      (left, right) =>
        (left.intelligenceRank ?? Infinity) -
        (right.intelligenceRank ?? Infinity),
    ).slice(0, RECOMMENDATION_COUNT),
  );
  let topBudget = $derived(
    rankBudgetModels(rankedModels).slice(0, RECOMMENDATION_COUNT),
  );
  let matchingModels = $derived.by(() => {
    const query = search.trim().toLowerCase();
    return radar.models
      .filter((model) => {
        if (filter === "cheap" && !model.isCheap) return false;
        if (filter === "state-of-the-art" && !model.isStateOfTheArt) return false;
        if (
          filter === "changed" &&
          (model.priceChangePercent === null || Math.abs(model.priceChangePercent) < 0.001)
        ) return false;
        return !query || `${model.name} ${model.provider} ${model.id}`.toLowerCase().includes(query);
      })
      .sort((left, right) => {
        if (sort === "price") return left.blendedPrice - right.blendedPrice;
        if (sort === "value") return (right.valueScore ?? -1) - (left.valueScore ?? -1);
        return (
          (left.intelligenceRank ?? Infinity) -
          (right.intelligenceRank ?? Infinity)
        );
      });
  });
  let totalPages = $derived(Math.max(1, Math.ceil(matchingModels.length / PAGE_SIZE)));
  let currentPage = $derived(Math.min(pageNumber, totalPages));
  let pageModels = $derived(
    matchingModels.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  );

  function selectFilter(nextFilter: Filter) {
    filter = nextFilter;
    pageNumber = 1;
  }

  function goToPage(nextPage: number) {
    pageNumber = Math.min(totalPages, Math.max(1, nextPage));
    requestAnimationFrame(() => modelTable.scrollIntoView({ block: "start" }));
  }

  function toggleComparison(modelId: string) {
    if (comparisonIds.includes(modelId)) {
      removeComparison(modelId);
      return;
    }
    if (comparisonIds.length < COMPARISON_LIMIT) comparisonIds = [...comparisonIds, modelId];
  }

  function removeComparison(modelId: string) {
    comparisonIds = comparisonIds.filter((candidate) => candidate !== modelId);
    if (comparisonIds.length < 2) comparisonOpen = false;
  }

  function clearComparison() {
    comparisonIds = [];
    comparisonOpen = false;
  }

  async function refresh() {
    refreshing = true;
    refreshError = null;
    try {
      const response = await fetch(`${base}/api/radar`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = (await response.json()) as RadarData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Refresh failed");
      refreshedRadar = payload;
      pageNumber = 1;
      const availableComparisonIds = comparisonIds.filter((modelId) =>
        payload.models.some((model) => model.id === modelId),
      );
      comparisonIds = availableComparisonIds;
      if (availableComparisonIds.length < 2) comparisonOpen = false;
    } catch (error) {
      refreshError = error instanceof Error ? error.message : "Refresh failed";
    } finally {
      refreshing = false;
    }
  }
</script>

<svelte:head>
  <title>Model Radar | AI price intelligence</title>
  <meta name="description" content="Track paid OpenRouter model prices and compare them with independent Artificial Analysis intelligence benchmarks." />
</svelte:head>

<div class="app-shell">
  <main class="main-content" id="top">
    <header class="topbar">
      <div class="topbar-left">
        <a class="topbar-brand" href="#top" onclick={() => activeSection = "radar"}><Activity size={17} /><span>Model Radar</span></a>
      </div>
      <nav class="topbar-nav" aria-label="Dashboard navigation">
        <a class:active={activeSection === "radar"} href="#radar" onclick={() => activeSection = "radar"}><Gauge size={16} /><span>Overview</span></a>
        <a class:active={activeSection === "news"} href="#news" onclick={() => activeSection = "news"}><Newspaper size={16} /><span>News</span></a>
        <a class:active={activeSection === "models"} href="#models" onclick={() => activeSection = "models"}><Database size={16} /><span>Models</span></a>
      </nav>
      <div class="topbar-actions">
        <details class="source-menu">
          <summary aria-label="Show live monitor status"><span class="live-indicator"><i></i>Live monitor</span><ChevronDown size={14} /></summary>
          <div class="source-statuses">
            <div class="source-menu-header"><strong>Data sources</strong></div>
            <SourcePill source={radar.sources.openRouter} />
            <SourcePill source={radar.sources.benchmarks} />
            <SourcePill source={radar.sources.database} />
          </div>
        </details>
        <button class="refresh-button" onclick={refresh} disabled={refreshing}>
          <RefreshCw size={15} class={refreshing ? "spinning" : undefined} /><span>{refreshing ? "Refreshing" : "Refresh"}</span>
        </button>
      </div>
    </header>

    <div class="page-wrap">
      {#if radar.sources.benchmarks.state !== "live"}
        <div class="source-banner">
          <CircleAlert size={19} />
          <div>
            <strong>{radar.sources.benchmarks.label}</strong>
            <p>{radar.sources.benchmarks.detail} Pricing remains available from OpenRouter.</p>
          </div>
          <a href="https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties" target="_blank" rel="noreferrer">API docs <ExternalLink size={14} /></a>
        </div>
      {/if}
      {#if radar.sources.database.state !== "live"}
        <div class="error-banner"><CircleAlert size={17} /> {radar.sources.database.detail}</div>
      {/if}
      {#if refreshError}
        <div class="error-banner"><CircleAlert size={17} /> {refreshError}</div>
      {/if}

      <section class="dashboard-heading" id="radar">
        <div class="dashboard-title">
          <h1>AI model overview</h1>
          <p>Compare capability, pricing, and value across paid OpenRouter models.</p>
        </div>
      </section>

      <section class="token-calculator" aria-label="Monthly workload controls">
        <div class="calculator-heading">
          <span class="panel-icon"><Gauge size={17} /></span>
          <div>
            <strong>Monthly workload</strong>
            <p>Cost estimates across this dashboard use these token volumes.</p>
          </div>
        </div>
        <div class="calculator-fields">
          <label><span>Input tokens</span><div><input type="number" min="0" step="1" bind:value={inputMillions} /><b>million</b></div></label>
          <label><span>Output tokens</span><div><input type="number" min="0" step="1" bind:value={outputMillions} /><b>million</b></div></label>
        </div>
      </section>

      <section class="metrics-grid" aria-label="Radar summary">
        <article class="metric-card metric-models">
          <div class="metric-card-top"><span>Paid models</span><Database size={16} /></div>
          <div class="metric-value"><strong>{radar.summary.paidModels}</strong><span>routes</span></div>
          <p>Free and dynamic-price routes excluded</p>
        </article>
        <article class="metric-card metric-ranked">
          <div class="metric-card-top"><span>Benchmarked</span><BrainCircuit size={16} /></div>
          <div class="metric-value"><strong>{radar.summary.rankedModels}</strong><span>ranked</span></div>
          <p>Artificial Analysis Intelligence Index</p>
        </article>
        <a class="metric-card metric-card-link metric-news" href="#news" onclick={() => activeSection = "news"}>
          <div class="metric-card-top"><span>New articles</span><Newspaper size={16} /></div>
          <div class="metric-value"><strong>{recentArticleCount}</strong><span>{recentArticleCount === 1 ? "article" : "articles"}</span></div>
          <p>New in the past day</p>
        </a>
        <a class="metric-card metric-card-link metric-moves" href="#models" onclick={() => { activeSection = "models"; selectFilter("changed"); }}>
          <div class="metric-card-top"><span>Price movement</span><Activity size={16} /></div>
          <div class="metric-value"><strong>{radar.summary.priceIncreases + radar.summary.priceDrops}</strong><span>changes</span></div>
          <p><span class="move-down">{radar.summary.priceDrops} down</span><span class="move-up">{radar.summary.priceIncreases} up</span><span class="movement-refresh">1h refresh</span></p>
        </a>
      </section>

      <section class="dashboard-section recommendations-section" aria-label="Top model recommendations">
        <header class="panel-group-header">
          <div class="section-title-group">
            <span class="section-title-icon section-title-icon-orange"><Sparkles size={17} /></span>
            <div class="section-title-copy">
              <h2>Top models</h2>
            </div>
          </div>
          <p>Rankings update against a workload of <strong>{safeInputMillions}M input</strong> and <strong>{safeOutputMillions}M output</strong> tokens.</p>
        </header>
        <div class="recommendation-grid">
          <RecommendationCard eyebrow="BEST CAPABILITY" method="Paid OpenRouter models with an Artificial Analysis Intelligence Index are sorted from highest to lowest. The five highest-ranked models are shown." models={topQuality} tone="ink" inputMillions={safeInputMillions} outputMillions={safeOutputMillions} />
          <RecommendationCard eyebrow="BEST UNDER BUDGET" method={`Paid models at or below ${money.format(radar.summary.cheapThreshold)} blended per 1M tokens are scored within the cheap set: 50% normalized Intelligence Index and 50% log-price affordability. The five highest scores are shown.`} models={topBudget} tone="lime" inputMillions={safeInputMillions} outputMillions={safeOutputMillions} />
        </div>
      </section>

      <section class="dashboard-section news-section" id="news" aria-labelledby="news-heading">
        <header class="section-heading news-heading">
          <div class="section-title-group">
            <span class="section-title-icon section-title-icon-blue"><Newspaper size={17} /></span>
            <div class="section-title-copy">
              <span class="section-kicker">Artificial Analysis</span>
              <h2 id="news-heading">Latest model news</h2>
            </div>
          </div>
          <a href="https://artificialanalysis.ai/articles" target="_blank" rel="noreferrer">View all articles <ExternalLink size={14} /></a>
        </header>
        {#if data.articles.length > 0}
          <div class="news-list">
            {#each data.articles as article (article.url)}
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
              <a class="news-item" href={article.url} target="_blank" rel="noreferrer">
                <div>
                  <time datetime={article.publishedDate}>{articleDate.format(new Date(`${article.publishedDate}T00:00:00Z`))}</time>
                  <h3>{article.title}</h3>
                </div>
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            {/each}
          </div>
        {:else}
          <div class="news-empty">
            <p>Latest headlines are temporarily unavailable.</p>
            <a href="https://artificialanalysis.ai/articles" target="_blank" rel="noreferrer">Browse Artificial Analysis <ExternalLink size={14} /></a>
          </div>
        {/if}
      </section>

      <section class="dashboard-section model-section" id="models">
        <div class="section-heading model-heading">
          <div class="section-title-group">
            <span class="section-title-icon section-title-icon-green"><Database size={17} /></span>
            <div class="section-title-copy"><h2>Models</h2><p>{matchingModels.length} in view</p></div>
          </div>
          <div class="model-tools">
            <label class="search-box"><Search size={16} /><input bind:value={search} oninput={() => pageNumber = 1} placeholder="Search all models" aria-label="Search all models" /></label>
            <select bind:value={sort} onchange={() => pageNumber = 1} aria-label="Sort models"><option value="rank">Sort: intelligence</option><option value="value">Sort: value</option><option value="price">Sort: price</option></select>
          </div>
        </div>
        <div class="filter-row" aria-label="Model filters">
          <button class:active={filter === "all"} aria-pressed={filter === "all"} onclick={() => selectFilter("all")}>All paid <span>{radar.summary.paidModels}</span></button>
          <button class:active={filter === "cheap"} aria-pressed={filter === "cheap"} onclick={() => selectFilter("cheap")}>Budget <span>{radar.summary.cheapModels}</span></button>
          <button class:active={filter === "state-of-the-art"} aria-pressed={filter === "state-of-the-art"} onclick={() => selectFilter("state-of-the-art")}>Frontier <span>{radar.summary.stateOfTheArtModels}</span></button>
          <button class:active={filter === "changed"} aria-pressed={filter === "changed"} onclick={() => selectFilter("changed")}>Price changed <span>{radar.summary.priceIncreases + radar.summary.priceDrops}</span></button>
        </div>

        <div class="table-wrap" bind:this={modelTable}>
          <table>
            <thead><tr><th class="model-col">Model</th><th class="rank-col">AA rank</th><th class="intelligence-col">Intelligence</th><th class="input-col">Input / 1M</th><th class="output-col">Output / 1M</th><th class="change-col">Price move</th><th class="monthly-col">Monthly est.</th><th class="action-col" aria-label="Model actions"></th></tr></thead>
            <tbody>
              {#each pageModels as model (model.id)}
                {@const monthlyCost = model.inputPrice * safeInputMillions + model.outputPrice * safeOutputMillions}
                {@const inComparison = comparisonIds.includes(model.id)}
                <tr>
                  <td class="model-col"><button class="model-identity" onclick={() => selectedModel = model}><ProviderLogo provider={model.provider} size="small" /><span><strong>{model.name}</strong></span></button></td>
                  <td class="rank-col">{model.intelligenceRank ? `#${model.intelligenceRank}` : "-"}</td>
                  <td class="intelligence-col"><span class="intelligence-cell"><strong>{model.intelligence ?? "-"}</strong>{#if model.intelligence !== null}<i style={`width: ${Math.min(100, model.intelligence)}%`}></i>{/if}</span></td>
                  <td class="input-col">{formatPrice(model.inputPrice)}</td><td class="output-col">{formatPrice(model.outputPrice)}</td>
                  <td class="change-col">{#if model.priceChangePercent !== null && Math.abs(model.priceChangePercent) >= 0.001}<PriceChange value={model.priceChangePercent} />{/if}</td><td class="monthly-col"><strong>{money.format(monthlyCost)}</strong></td>
                  <td class="action-col">
                    <div class="row-actions">
                      <button
                        class="row-action comparison-toggle"
                        class:active={inComparison}
                        onclick={() => toggleComparison(model.id)}
                        disabled={!inComparison && comparisonIds.length >= COMPARISON_LIMIT}
                        aria-pressed={inComparison}
                        aria-label={inComparison ? `Remove ${model.name} from comparison` : `Add ${model.name} to comparison`}
                        title={inComparison ? "Remove from comparison" : comparisonIds.length >= COMPARISON_LIMIT ? `Compare up to ${COMPARISON_LIMIT} models` : "Add to comparison"}
                      >
                        {#if inComparison}<Check size={14} />{:else}<Plus size={14} />{/if}
                      </button>
                      <button class="row-action" onclick={() => selectedModel = model} aria-label={`Inspect ${model.name}`} title="Open details"><ChevronRight size={14} /></button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if matchingModels.length === 0}
            <div class="no-results"><Search size={23} /><strong>No models in this view</strong><p>Try another filter or clear your search.</p></div>
          {/if}
        </div>
        {#if matchingModels.length > 0}
          <nav class="model-pagination" aria-label="Model index pagination">
            <p>{PAGE_SIZE} per page</p>
            <div class="pagination-controls">
              <button class="pagination-edge" onclick={() => goToPage(1)} disabled={currentPage === 1}>First</button>
              <button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page"><ChevronLeft size={15} /></button>
              <span>Page <strong>{currentPage}</strong> of {totalPages}</span>
              <button onclick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Next page"><ChevronRight size={15} /></button>
              <button class="pagination-edge" onclick={() => goToPage(totalPages)} disabled={currentPage === totalPages}>Last</button>
            </div>
          </nav>
        {/if}
      </section>

      <footer>
        <div class="footer-brand"><Sparkles size={17} /> Model Radar</div>
        <p>Pricing by <a href="https://openrouter.ai" target="_blank" rel="noreferrer">OpenRouter</a>. Benchmarks and news by <a href="https://artificialanalysis.ai" target="_blank" rel="noreferrer">Artificial Analysis</a>; benchmark indices supplied via OpenRouter.</p>
        <span>Snapshot {radar.snapshotDate}</span>
      </footer>
    </div>
  </main>

  {#if selectedModel}
    <ModelDetail model={selectedModel} inputMillions={safeInputMillions} outputMillions={safeOutputMillions} onclose={() => selectedModel = null} />
  {/if}

  {#if comparisonModels.length > 0}
    <aside class="comparison-tray" aria-label="Selected models for comparison" aria-live="polite">
      <div class="comparison-tray-title"><Scale size={17} /><strong>Compare</strong><span>{comparisonModels.length}/{COMPARISON_LIMIT}</span></div>
      <div class="comparison-chips">
        {#each comparisonModels as model (model.id)}
          <button onclick={() => removeComparison(model.id)} title={`Remove ${model.name}`}><span>{model.name}</span><X size={12} /></button>
        {/each}
      </div>
      <div class="comparison-tray-actions">
        <button class="comparison-clear" onclick={clearComparison}>Clear</button>
        <button class="comparison-open" onclick={() => comparisonOpen = true} disabled={comparisonModels.length < 2}>Compare models</button>
      </div>
    </aside>
  {/if}

  {#if comparisonOpen && comparisonModels.length >= 2}
    <ModelComparison models={comparisonModels} inputMillions={safeInputMillions} outputMillions={safeOutputMillions} onremove={removeComparison} onclose={() => comparisonOpen = false} />
  {/if}
</div>
