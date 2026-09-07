<script lang="ts">
  import { base } from "$app/paths";
  import {
    Activity,
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
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
    X,
  } from "@lucide/svelte";
  import ModelComparison from "$lib/components/ModelComparison.svelte";
  import ModelDetail from "$lib/components/ModelDetail.svelte";
  import ModelModalities from "$lib/components/ModelModalities.svelte";
  import PriceChange from "$lib/components/PriceChange.svelte";
  import ProviderLogo from "$lib/components/ProviderLogo.svelte";
  import RecommendationCard from "$lib/components/RecommendationCard.svelte";
  import SpecializedRates from "$lib/components/SpecializedRates.svelte";
  import { displayModalityName, displayModelName, formatPrice, formatSyncTime, formatTokenCount, money } from "$lib/format";
  import { hasTokenPricing, rankBudgetModels } from "$lib/scoring";
  import type { RadarData, RadarModel } from "$lib/types";
  import type { PageData } from "./$types";

  type Filter = "all" | "changed" | "free" | "batch" | "search";
  type Sort = "changed" | "intelligence" | "input" | "output" | "monthly";
  type SortDirection = "asc" | "desc";
  const RECOMMENDATION_COUNT = 5;
  const COMPARISON_MIN = 2;
  const COMPARISON_LIMIT = 4;
  const PAGE_SIZE = 25;
  const MODALITY_ORDER = ["text", "image", "file", "audio", "video", "embeddings", "rerank", "speech", "transcription"];
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
  let sort = $state<Sort>("intelligence");
  let sortDirection = $state<SortDirection>("desc");
  let search = $state("");
  let inputCapability = $state("all");
  let outputCapability = $state("all");
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
  let inputCapabilities = $derived.by(() =>
    [...new Set(radar.models.flatMap((model) => model.inputModalities))].sort(compareModalities),
  );
  let outputCapabilities = $derived.by(() =>
    [...new Set(radar.models.flatMap((model) => model.outputModalities))].sort(compareModalities),
  );
  let tokenPricedModels = $derived(
    radar.models.filter(
      (model) =>
        model.segment !== "free" &&
        model.segment !== "batch" &&
        hasTokenPricing(model),
    ),
  );
  let recentArticleCount = $derived.by(() => {
    const cutoffDate = new Date(
      Date.parse(`${radar.snapshotDate}T00:00:00Z`) - 24 * 60 * 60 * 1000,
    ).toISOString().slice(0, 10);
    return data.articles.filter(
      (article) => article.publishedDate >= cutoffDate && article.publishedDate <= radar.snapshotDate,
    ).length;
  });
  let topQuality = $derived(
    tokenPricedModels.filter((model) => model.intelligence !== null).sort(
      (left, right) =>
        (left.intelligenceRank ?? Infinity) -
        (right.intelligenceRank ?? Infinity),
    ).slice(0, RECOMMENDATION_COUNT),
  );
  let topBudget = $derived(
    rankBudgetModels(radar.models).slice(0, RECOMMENDATION_COUNT),
  );
  let recentPriceMovements = $derived.by(() => {
    const cutoff = Date.parse(radar.generatedAt) - 24 * 60 * 60 * 1000;
    let increases = 0;
    let drops = 0;
    let mixed = 0;

    for (const model of tokenPricedModels) {
      if (!model.priceChangeRecordedAt || Date.parse(model.priceChangeRecordedAt) < cutoff) continue;
      const changes = [model.inputPriceChangePercent, model.outputPriceChangePercent].filter(
        (change): change is number => change !== null && Math.abs(change) >= 0.001,
      );
      const increased = changes.some((change) => change > 0);
      const dropped = changes.some((change) => change < 0);
      if (increased && dropped) mixed += 1;
      else if (increased) increases += 1;
      else if (dropped) drops += 1;
    }

    return { models: increases + drops + mixed, increases, drops, mixed };
  });

  function hasPriceChange(model: RadarModel) {
    return hasTokenPricing(model) && [model.inputPriceChangePercent, model.outputPriceChangePercent].some(
      (change) => change !== null && Math.abs(change) >= 0.001,
    );
  }

  function formatTokenLimit(value: number | null) {
    return value === null ? "Not published" : formatTokenCount(value);
  }

  function formatContextLength(value: number) {
    return value > 0 ? formatTokenCount(value) : "Not applicable";
  }

  function compareModalities(left: string, right: string) {
    const leftIndex = MODALITY_ORDER.indexOf(left);
    const rightIndex = MODALITY_ORDER.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  }

  function monthlyCost(model: RadarModel) {
    return hasTokenPricing(model)
      ? model.inputPrice * safeInputMillions + model.outputPrice * safeOutputMillions
      : null;
  }

  let matchingModels = $derived.by(() => {
    const query = search.trim().toLowerCase();
    return radar.models
      .filter((model) => {
        const isSpecialVariant = model.segment === "free" || model.segment === "batch";
        if (filter === "all" && isSpecialVariant) return false;
        if (filter === "changed" && (isSpecialVariant || !hasPriceChange(model))) return false;
        if (filter === "free" && model.segment !== "free") return false;
        if (filter === "batch" && model.segment !== "batch") return false;
        if (inputCapability !== "all" && !model.inputModalities.includes(inputCapability)) return false;
        if (outputCapability !== "all" && !model.outputModalities.includes(outputCapability)) return false;
        return !query || `${model.name} ${model.provider} ${model.id}`.toLowerCase().includes(query);
      })
      .sort((left, right) => {
        let leftValue: number | null;
        let rightValue: number | null;
        if (sort === "changed") {
          leftValue = left.priceChangeRecordedAt ? Date.parse(left.priceChangeRecordedAt) : null;
          rightValue = right.priceChangeRecordedAt ? Date.parse(right.priceChangeRecordedAt) : null;
        } else if (sort === "intelligence") {
          leftValue = left.intelligence;
          rightValue = right.intelligence;
        } else if (sort === "input") {
          leftValue = left.inputPrice;
          rightValue = right.inputPrice;
        } else if (sort === "output") {
          leftValue = left.outputPrice;
          rightValue = right.outputPrice;
        } else {
          leftValue = monthlyCost(left);
          rightValue = monthlyCost(right);
        }
        if (leftValue === null) {
          return rightValue === null
            ? displayModelName(left.name).localeCompare(displayModelName(right.name))
            : 1;
        }
        if (rightValue === null) return -1;
        return (
          (leftValue - rightValue) * (sortDirection === "asc" ? 1 : -1) ||
          displayModelName(left.name).localeCompare(displayModelName(right.name))
        );
      });
  });
  let totalPages = $derived(Math.max(1, Math.ceil(matchingModels.length / PAGE_SIZE)));
  let currentPage = $derived(Math.min(pageNumber, totalPages));
  let pageModels = $derived(
    matchingModels.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  );

  function searchAllModels() {
    pageNumber = 1;
    if (search.trim()) {
      filter = "search";
      if (sort === "changed") {
        sort = "intelligence";
        sortDirection = "desc";
      }
    } else if (filter === "search") {
      filter = "all";
    }
  }

  function capabilityFiltersChanged() {
    pageNumber = 1;
  }

  function clearCapabilityFilters() {
    inputCapability = "all";
    outputCapability = "all";
    pageNumber = 1;
  }

  function selectFilter(nextFilter: Filter) {
    const wasShowingChanges = filter === "changed";
    filter = nextFilter;
    if (nextFilter === "changed") {
      sort = "changed";
      sortDirection = "desc";
    } else if (nextFilter === "free") {
      sort = "intelligence";
      sortDirection = "desc";
    } else if (wasShowingChanges && sort === "changed") {
      sort = "intelligence";
      sortDirection = "desc";
    }
    pageNumber = 1;
  }

  function defaultSortDirection(nextSort: Sort): SortDirection {
    return nextSort === "changed" || nextSort === "intelligence" ? "desc" : "asc";
  }

  function toggleSort(nextSort: Sort) {
    if (sort === nextSort) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sort = nextSort;
      sortDirection = defaultSortDirection(nextSort);
    }
    pageNumber = 1;
  }

  function changeSort(event: Event) {
    const nextSort = (event.currentTarget as HTMLSelectElement).value as Sort;
    sort = nextSort;
    sortDirection = defaultSortDirection(nextSort);
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
    if (comparisonIds.length < COMPARISON_MIN) comparisonOpen = false;
  }

  function priceMoveDetail(model: RadarModel, rate: "input" | "output") {
    const originalPrice = rate === "input" ? model.previousInputPrice : model.previousOutputPrice;
    if (originalPrice === null) return undefined;
    const recordedAt = model.priceChangeRecordedAt
      ? formatSyncTime(model.priceChangeRecordedAt)
      : "Unavailable";
    return `Original ${rate} price: ${formatPrice(originalPrice)} / 1M tokens\nPrice move recorded: ${recordedAt}`;
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
      if (inputCapability !== "all" && !payload.models.some((model) => model.inputModalities.includes(inputCapability))) inputCapability = "all";
      if (outputCapability !== "all" && !payload.models.some((model) => model.outputModalities.includes(outputCapability))) outputCapability = "all";
      comparisonIds = comparisonIds.filter((modelId) =>
        payload.models.some((model) => model.id === modelId),
      );
      if (comparisonIds.length < COMPARISON_MIN) comparisonOpen = false;
    } catch (error) {
      refreshError = error instanceof Error ? error.message : "Refresh failed";
    } finally {
      refreshing = false;
    }
  }
</script>

<svelte:head>
  <title>Model Radar</title>
  <link rel="icon" type="image/svg+xml" sizes="any" href={`${base}/favicon.svg`} />
  <meta name="description" content="Track OpenRouter model prices and compare them with independent Artificial Analysis intelligence benchmarks." />
</svelte:head>

{#snippet sortableHeader(key: Sort, label: string, className: string)}
  <th class={`${className} sortable-column`} aria-sort={sort === key ? sortDirection === "asc" ? "ascending" : "descending" : "none"}>
    <button type="button" onclick={() => toggleSort(key)}>
      {label}
      {#if sort === key}
        {#if sortDirection === "asc"}<ArrowUp size={13} />{:else}<ArrowDown size={13} />{/if}
      {:else}
        <ArrowUpDown size={13} />
      {/if}
    </button>
  </th>
{/snippet}

<div class="app-shell">
  <main class="main-content" id="top">
    <header class="topbar">
      <div class="topbar-left">
        <a class="topbar-brand" href="#top" aria-label="Model Radar" onclick={() => activeSection = "radar"}><img class="brand-icon" src={`${base}/model-radar.svg`} alt="" /><span>Model Radar</span></a>
      </div>
      <nav class="topbar-nav" aria-label="Dashboard navigation">
        <a class:active={activeSection === "radar"} href="#radar" aria-label="Overview" onclick={() => activeSection = "radar"}><Gauge size={16} /><span>Overview</span></a>
        <a class:active={activeSection === "news"} href="#news" aria-label="News" onclick={() => activeSection = "news"}><Newspaper size={16} /><span>News</span></a>
        <a class:active={activeSection === "models"} href="#models" aria-label="Models" onclick={() => activeSection = "models"}><Database size={16} /><span>Models</span></a>
      </nav>
      <div class="topbar-actions">
        <details class="source-menu">
          <summary aria-label="Show live monitor status"><span class="live-indicator"><i></i>Live monitor</span><ChevronDown size={14} /></summary>
          <div class="source-statuses">
            <div class="source-menu-header"><strong>Data sources</strong></div>
            {#each [radar.sources.openRouter, radar.sources.benchmarks, radar.sources.database] as source (source.label)}
              <div class="source-pill" class:source-unavailable={source.state === "unavailable"} title={source.detail}>
                <span class="status-dot"></span><span>{source.label}</span>
              </div>
            {/each}
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

      <section class="metrics-grid" aria-label="Radar summary">
        <article class="metric-card metric-models">
          <div class="metric-card-top"><span>All paid models</span><Database size={16} /></div>
          <div class="metric-value"><strong>{radar.summary.paidModels}</strong><span>routes</span></div>
          <p>{radar.summary.rankedModels} token-priced routes ranked; {radar.summary.specializedModels} specialized</p>
        </article>
        <a class="metric-card metric-card-link metric-news" href="#news" onclick={() => activeSection = "news"}>
          <div class="metric-card-top"><span>New articles</span><Newspaper size={16} /></div>
          <div class="metric-value"><strong>{recentArticleCount}</strong><span>{recentArticleCount === 1 ? "article" : "articles"}</span></div>
          <p>New in the past day</p>
        </a>
        <a class="metric-card metric-card-link metric-moves" href="#models" onclick={() => { activeSection = "models"; selectFilter("changed"); }}>
          <div class="metric-card-top"><span>Price movement</span><Activity size={16} /></div>
          <div class="metric-value"><strong>{recentPriceMovements.models}</strong><span>models</span></div>
          <p><span class="move-down">{recentPriceMovements.drops} down</span><span class="move-up">{recentPriceMovements.increases} up</span><span class="move-mixed">{recentPriceMovements.mixed} mixed</span><span class="movement-refresh">Past 24h / 1h refresh</span></p>
        </a>
      </section>

      <section class="dashboard-section" aria-label="Top model recommendations">
        <div class="recommendation-grid">
          <RecommendationCard eyebrow="BEST CAPABILITY" method="Token-priced paid OpenRouter models with an AA Index are sorted from highest to lowest. The five highest-ranked models are shown." models={topQuality} tone="ink" onselect={(model) => selectedModel = model} />
          <RecommendationCard eyebrow="BEST UNDER BUDGET" method={`Paid models at or below ${money.format(radar.summary.cheapThreshold)} blended per 1M tokens are scored within the cheap set: 50% normalized AA Index and 50% log-price affordability. The five highest scores are shown.`} models={topBudget} tone="lime" onselect={(model) => selectedModel = model} />
        </div>
      </section>

      <section class="dashboard-section news-section" id="news" aria-labelledby="news-heading">
        <header class="section-heading news-heading">
          <div class="section-title-group">
            <span class="section-title-icon section-title-icon-blue"><Newspaper size={17} /></span>
            <div class="section-title-copy">
              <h2 id="news-heading">Latest model news</h2>
              <p>Artificial Analysis</p>
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

      <section class="dashboard-section token-calculator" aria-label="Monthly workload controls">
        <div class="calculator-heading">
          <span class="panel-icon"><Gauge size={17} /></span>
          <div>
            <strong>Monthly workload</strong>
            <p>Cost estimates for token-priced models use these volumes; specialized models are excluded.</p>
          </div>
        </div>
        <div class="calculator-fields">
          <label><span>Input tokens</span><div><input type="number" min="0" step="1" bind:value={inputMillions} /><b>million</b></div></label>
          <label><span>Output tokens</span><div><input type="number" min="0" step="1" bind:value={outputMillions} /><b>million</b></div></label>
        </div>
      </section>

      <section class="dashboard-section model-section" id="models">
        <div class="section-heading model-heading">
          <div class="section-title-group">
            <span class="section-title-icon section-title-icon-green"><Database size={17} /></span>
            <div class="section-title-copy"><h2>Models</h2><p>{matchingModels.length} in view</p></div>
          </div>
          <div class="model-tools">
            <label class="search-box"><Search size={16} /><input bind:value={search} oninput={searchAllModels} placeholder="Search every category" aria-label="Search every model category" /></label>
            <div class="capability-filter-controls" aria-label="Model capability filters">
              <select class="capability-select" bind:value={inputCapability} onchange={capabilityFiltersChanged} aria-label="Filter models by input capability">
                <option value="all">Any input</option>
                {#each inputCapabilities as modality (modality)}<option value={modality}>{displayModalityName(modality)}</option>{/each}
              </select>
              <select class="capability-select" bind:value={outputCapability} onchange={capabilityFiltersChanged} aria-label="Filter models by output capability">
                <option value="all">Any output</option>
                {#each outputCapabilities as modality (modality)}<option value={modality}>{displayModalityName(modality)}</option>{/each}
              </select>
              {#if inputCapability !== "all" || outputCapability !== "all"}
                <button class="capability-filter-clear" type="button" onclick={clearCapabilityFilters} aria-label="Clear capability filters" title="Clear capability filters"><X size={13} /></button>
              {/if}
            </div>
          </div>
        </div>
        <div class="filter-row" aria-label="Model filters">
          {#if filter === "search"}
            <span class="global-search-label">Search results <b>{matchingModels.length}</b></span>
          {/if}
          <button class:active={filter === "all"} aria-pressed={filter === "all"} onclick={() => selectFilter("all")}>All paid <span>{radar.summary.paidModels}</span></button>
          <button class:active={filter === "free"} aria-pressed={filter === "free"} onclick={() => selectFilter("free")}>Free <span>{radar.summary.freeModels}</span></button>
          <button class:active={filter === "batch"} aria-pressed={filter === "batch"} onclick={() => selectFilter("batch")}>Batch <span>{radar.summary.batchModels}</span></button>
          <button class:active={filter === "changed"} aria-pressed={filter === "changed"} onclick={() => selectFilter("changed")}>Price changed <span>{radar.summary.priceChangedModels}</span></button>
        </div>
        {#if filter === "free"}
          <div class="model-filter-note model-filter-note-free" role="note">
            <strong>Shared OpenRouter free quota</strong>
            <span>20 requests per minute across all free models. The daily allowance is 50 requests, or 1,000 after at least $10 in lifetime credit purchases.</span>
          </div>
        {:else if filter === "batch"}
          <div class="model-filter-note model-filter-note-batch" role="note">
            <strong>Asynchronous OpenRouter batches</strong>
            <span>Batch models are for text-only workloads that do not need an immediate response. OpenRouter uses a 24-hour completion window and typically charges 50% of standard per-token pricing.</span>
          </div>
        {/if}

        <div class="mobile-sort">
          <label>
            <span>Sort by</span>
            <select value={sort} onchange={changeSort}>
              <option value="intelligence">AA Index</option>
              {#if filter !== "free"}
                <option value="input">Input price</option>
                <option value="output">Output price</option>
              {/if}
              {#if filter === "changed"}
                <option value="changed">Price move recorded</option>
              {:else if filter !== "free"}
                <option value="monthly">Monthly estimate</option>
              {/if}
            </select>
          </label>
          <button type="button" onclick={() => toggleSort(sort)} aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}>
            {#if sortDirection === "asc"}<ArrowUp size={15} />Ascending{:else}<ArrowDown size={15} />Descending{/if}
          </button>
        </div>

        <div class="table-wrap" bind:this={modelTable}>
          <table class="model-table" aria-label="Models">
            <thead>
              <tr>
                <th class="model-col">Model</th>
                <th class="context-col">Context</th>
                {@render sortableHeader("intelligence", "AA Index", "intelligence-col")}
                {#if filter === "free"}
                  <th class="limit-col">Max output</th>
                  <th class="limit-col">Requests / min</th>
                {:else}
                  {@render sortableHeader("input", filter === "all" || filter === "search" ? "Input price" : "Input / 1M", "input-col")}
                  {@render sortableHeader("output", filter === "all" || filter === "search" ? "Output price" : "Output / 1M", "output-col")}
                {/if}
                {#if filter === "changed"}
                  {@render sortableHeader("changed", "Price move recorded", "movement-col")}
                {/if}
                {#if filter === "all"}
                  <th class="modality-col">Input / output</th>
                {/if}
                {#if filter === "free"}
                  <th class="limit-col">Requests / day</th>
                {:else if filter !== "changed"}
                  {@render sortableHeader("monthly", "Monthly est.", "monthly-col")}
                {/if}
                <th class="action-col" aria-label="Model actions"></th>
              </tr>
            </thead>
            <tbody>
              {#each pageModels as model (model.id)}
                {@const estimatedCost = monthlyCost(model)}
                {@const inComparison = comparisonIds.includes(model.id)}
                <tr>
                  <td class="model-col"><button class="model-identity" onclick={() => selectedModel = model}><ProviderLogo provider={model.provider} size="small" /><span><strong>{displayModelName(model.name)}</strong></span></button></td>
                  <td class="context-col">{formatContextLength(model.contextLength)}</td>
                  <td class="intelligence-col"><span class="intelligence-cell"><strong>{model.intelligence ?? "-"}</strong>{#if model.intelligence !== null}<meter min="0" max="100" value={Math.min(100, model.intelligence)} aria-label={`AA Index ${model.intelligence}`}></meter>{/if}</span></td>
                  {#if filter === "free"}
                    <td class="limit-col limit-cell"><strong>{formatTokenLimit(model.maxCompletionTokens)}</strong>{#if model.maxCompletionTokens !== null}<span>tokens</span>{/if}</td>
                    <td class="limit-col limit-cell"><strong>20</strong><span>shared</span></td>
                  {:else if model.pricingBasis === "specialized"}
                    <td class="input-col specialized-price-col"><SpecializedRates rates={model.specializedPricing?.input ?? []} /></td>
                    <td class="output-col specialized-price-col"><SpecializedRates rates={model.specializedPricing?.output ?? []} /></td>
                  {:else if hasTokenPricing(model)}
                    <td class="input-col"><span class="price-with-move"><span>{formatPrice(model.inputPrice)}</span>{#if model.inputPriceChangePercent !== null && Math.abs(model.inputPriceChangePercent) >= 0.001}<PriceChange value={model.inputPriceChangePercent} detail={priceMoveDetail(model, "input")} />{/if}</span></td>
                    <td class="output-col"><span class="price-with-move"><span>{formatPrice(model.outputPrice)}</span>{#if model.outputPriceChangePercent !== null && Math.abs(model.outputPriceChangePercent) >= 0.001}<PriceChange value={model.outputPriceChangePercent} detail={priceMoveDetail(model, "output")} />{/if}</span></td>
                  {:else}
                    <td class="input-col specialized-rate-unavailable">N/A</td>
                    <td class="output-col specialized-rate-unavailable">N/A</td>
                  {/if}
                  {#if filter === "changed"}
                    <td class="movement-col">{model.priceChangeRecordedAt ? formatSyncTime(model.priceChangeRecordedAt) : "Unavailable"}</td>
                  {/if}
                  {#if filter === "all"}
                    <td class="modality-col specialized-route-cell"><ModelModalities inputModalities={model.inputModalities} outputModalities={model.outputModalities} /></td>
                  {/if}
                  {#if filter === "free"}
                    <td class="limit-col limit-cell"><strong>50 / 1,000</strong><span>shared</span></td>
                  {:else if filter !== "changed"}
                    <td class="monthly-col"><strong>{estimatedCost === null ? "N/A" : money.format(estimatedCost)}</strong></td>
                  {/if}
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
        <div class="footer-brand"><img class="brand-icon" src={`${base}/model-radar.svg`} alt="" /> Model Radar</div>
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
          <button onclick={() => removeComparison(model.id)} title={`Remove ${displayModelName(model.name)}`}><span>{displayModelName(model.name)}</span><X size={12} /></button>
        {/each}
      </div>
      <div class="comparison-tray-actions">
        <button class="comparison-clear" onclick={clearComparison}>Clear</button>
        <button class="comparison-open" onclick={() => comparisonOpen = true} disabled={comparisonModels.length < COMPARISON_MIN}>Compare models</button>
      </div>
    </aside>
  {/if}

  {#if comparisonOpen && comparisonModels.length >= COMPARISON_MIN}
    <ModelComparison models={comparisonModels} inputMillions={safeInputMillions} outputMillions={safeOutputMillions} onclose={() => comparisonOpen = false} />
  {/if}
</div>
