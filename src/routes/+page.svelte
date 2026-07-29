<script lang="ts">
  import {
    Activity,
    BadgeDollarSign,
    BrainCircuit,
    CircleAlert,
    Database,
    ExternalLink,
    Gauge,
    Info,
    RefreshCw,
    Search,
    Sparkles,
    Target,
  } from "@lucide/svelte";
  import ModelDetail from "$lib/components/ModelDetail.svelte";
  import PriceChange from "$lib/components/PriceChange.svelte";
  import RecommendationCard from "$lib/components/RecommendationCard.svelte";
  import SourcePill from "$lib/components/SourcePill.svelte";
  import ValueChart from "$lib/components/ValueChart.svelte";
  import { compactNumber, formatPrice, formatSyncTime, money, providerName } from "$lib/format";
  import type { RadarData, RadarModel } from "$lib/types";
  import type { PageData } from "./$types";

  type Filter = "all" | "cheap" | "state-of-the-art" | "changed";
  type Sort = "rank" | "value" | "price";

  let { data }: { data: PageData } = $props();
  let refreshedRadar = $state<RadarData | null>(null);
  let radar = $derived(refreshedRadar ?? data.radar);
  let filter = $state<Filter>("all");
  let sort = $state<Sort>("rank");
  let search = $state("");
  let inputMillions = $state(10);
  let outputMillions = $state(2);
  let selectedModel = $state<RadarModel | null>(null);
  let refreshing = $state(false);
  let refreshError = $state<string | null>(null);

  let safeInputMillions = $derived(Number.isFinite(inputMillions) ? Math.max(0, inputMillions) : 0);
  let safeOutputMillions = $derived(Number.isFinite(outputMillions) ? Math.max(0, outputMillions) : 0);
  let rankedModels = $derived(radar.models.filter((model) => model.intelligence !== null));
  let bestQuality = $derived(
    [...rankedModels].sort(
      (left, right) =>
        (left.artificialAnalysisRank ?? Infinity) -
        (right.artificialAnalysisRank ?? Infinity),
    )[0] ?? null,
  );
  let bestCheap = $derived(
    [...rankedModels]
      .filter((model) => model.isCheap)
      .sort((left, right) => (right.intelligence ?? 0) - (left.intelligence ?? 0))[0] ?? null,
  );
  let bestValue = $derived(
    [...rankedModels].sort(
      (left, right) => (right.valueScore ?? 0) - (left.valueScore ?? 0),
    )[0] ?? null,
  );
  let visibleModels = $derived.by(() => {
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
          (left.artificialAnalysisRank ?? Infinity) -
          (right.artificialAnalysisRank ?? Infinity)
        );
      });
  });

  async function refresh() {
    refreshing = true;
    refreshError = null;
    try {
      const response = await fetch("/api/radar", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = (await response.json()) as RadarData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Refresh failed");
      refreshedRadar = payload;
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
  <aside class="sidebar">
    <a class="brand" href="#top" aria-label="Model Radar home">
      <span class="brand-mark"><Activity size={19} /></span><span>MODEL<br />RADAR</span>
    </a>
    <nav class="side-nav" aria-label="Primary navigation">
      <a href="#radar" class="active"><Target size={18} /> Radar</a>
      <a href="#models"><Database size={18} /> Model index</a>
      <a href="#method"><Info size={18} /> Method</a>
    </nav>
    <div class="sidebar-note">
      <span class="eyebrow">DAILY SIGNAL</span>
      <strong>
        {#if radar.summary.priceIncreases > 0}
          {radar.summary.priceIncreases} price increase{radar.summary.priceIncreases === 1 ? "" : "s"}
        {:else}Prices holding steady{/if}
      </strong>
      <p>Compared with your previous daily snapshot.</p>
    </div>
    <div class="sidebar-footer"><span>MR / 01</span><span>{radar.snapshotDate}</span></div>
  </aside>

  <main class="main-content" id="top">
    <header class="topbar">
      <a class="mobile-brand" href="#top">
        <span class="brand-mark"><Activity size={17} /></span>MODEL RADAR
      </a>
      <div class="topbar-context">
        <span>AI MODEL INTELLIGENCE</span><span class="topbar-rule"></span><span>{formatSyncTime(radar.generatedAt)}</span>
      </div>
      <div class="source-statuses">
        <SourcePill source={radar.sources.openRouter} />
        <SourcePill source={radar.sources.artificialAnalysis} />
        <SourcePill source={radar.sources.database} />
        <button class="refresh-button" onclick={refresh} disabled={refreshing}>
          <RefreshCw size={15} class={refreshing ? "spinning" : undefined} /><span>{refreshing ? "Refreshing" : "Refresh"}</span>
        </button>
      </div>
    </header>

    <div class="page-wrap">
      {#if radar.sources.artificialAnalysis.state !== "live"}
        <div class="source-banner">
          <CircleAlert size={19} />
          <div>
            <strong>{radar.sources.artificialAnalysis.label}</strong>
            <p>{radar.sources.artificialAnalysis.detail} Pricing still comes live from OpenRouter. Add the key to <code>.env</code>.</p>
          </div>
          <a href="https://artificialanalysis.ai/documentation" target="_blank" rel="noreferrer">API docs <ExternalLink size={14} /></a>
        </div>
      {/if}
      {#if radar.sources.database.state !== "live"}
        <div class="error-banner"><CircleAlert size={17} /> {radar.sources.database.detail}</div>
      {/if}
      {#if refreshError}
        <div class="error-banner"><CircleAlert size={17} /> {refreshError}</div>
      {/if}

      <section class="hero" id="radar">
        <div class="hero-copy">
          <span class="eyebrow">MODEL SELECTION, WITHOUT THE GUESSWORK</span>
          <h1>Spend less.<br /><em>Keep the intelligence.</em></h1>
          <p>Live OpenRouter prices cross-checked against independent capability data. See when a model gets expensive, and what deserves to replace it.</p>
        </div>
        <div class="token-calculator">
          <div class="calculator-heading">
            <div><span class="eyebrow">YOUR MONTHLY LOAD</span><strong>Cost simulator</strong></div><Gauge size={23} />
          </div>
          <label><span>Input tokens</span><div><input type="number" min="0" step="1" bind:value={inputMillions} /><b>million</b></div></label>
          <label><span>Output tokens</span><div><input type="number" min="0" step="1" bind:value={outputMillions} /><b>million</b></div></label>
          <p>Every recommendation and table estimate uses this workload.</p>
        </div>
      </section>

      <section class="metrics-grid" aria-label="Radar summary">
        <article class="metric-card"><div class="metric-card-top"><span>PAID MODELS</span><Database size={18} /></div><strong>{radar.summary.paidModels}</strong><p>Free and dynamic-price routes excluded</p></article>
        <article class="metric-card"><div class="metric-card-top"><span>BENCHMARKED</span><BrainCircuit size={18} /></div><strong>{radar.summary.rankedModels}</strong><p>Matched to Artificial Analysis</p></article>
        <article class="metric-card"><div class="metric-card-top"><span>CHEAP PICKS</span><BadgeDollarSign size={18} /></div><strong>{radar.summary.cheapModels}</strong><p>At or below {money.format(radar.summary.cheapThreshold)} blended</p></article>
        <article class="metric-card"><div class="metric-card-top"><span>PRICE MOVES</span><Activity size={18} /></div><strong>{radar.summary.priceIncreases + radar.summary.priceDrops}</strong><p>{radar.summary.priceDrops} down / {radar.summary.priceIncreases} up</p></article>
      </section>

      <section class="section-block recommendations-section">
        <div class="section-heading"><div><span class="section-kicker">TODAY'S SHORTLIST</span><h2>Three ways to choose</h2></div><p>Capability, restraint, or the strongest balance of both.</p></div>
        <div class="recommendation-grid">
          <RecommendationCard eyebrow="BEST CAPABILITY" model={bestQuality} tone="ink" inputMillions={safeInputMillions} outputMillions={safeOutputMillions} />
          <RecommendationCard eyebrow="BEST UNDER BUDGET" model={bestCheap} tone="lime" inputMillions={safeInputMillions} outputMillions={safeOutputMillions} />
          <RecommendationCard eyebrow="BEST BALANCE" model={bestValue} tone="paper" inputMillions={safeInputMillions} outputMillions={safeOutputMillions} />
        </div>
      </section>

      <section class="section-block value-section">
        <div class="section-heading chart-heading">
          <div><span class="section-kicker">THE VALUE MAP</span><h2>Price vs. intelligence</h2></div>
          <div class="chart-legend"><span><i class="dot-frontier"></i>Frontier</span><span><i class="dot-cheap"></i>Cheap</span><span><i class="dot-standard"></i>Standard</span></div>
        </div>
        <ValueChart models={radar.models} />
        <div class="axis-labels"><span>LOWER BLENDED COST</span><span>HIGHER BLENDED COST -&gt;</span></div>
      </section>

      <section class="section-block model-section" id="models">
        <div class="section-heading model-heading">
          <div><span class="section-kicker">MODEL INDEX</span><h2>Inspect every signal</h2></div>
          <div class="model-tools">
            <label class="search-box"><Search size={16} /><input bind:value={search} placeholder="Search models" aria-label="Search models" /></label>
            <select bind:value={sort} aria-label="Sort models"><option value="rank">Sort: AA rank</option><option value="value">Sort: value</option><option value="price">Sort: price</option></select>
          </div>
        </div>
        <div class="filter-row">
          <button class:active={filter === "all"} onclick={() => filter = "all"}>All paid <span>{radar.summary.paidModels}</span></button>
          <button class:active={filter === "cheap"} onclick={() => filter = "cheap"}>Cheap <span>{radar.summary.cheapModels}</span></button>
          <button class:active={filter === "state-of-the-art"} onclick={() => filter = "state-of-the-art"}>Frontier <span>{radar.summary.stateOfTheArtModels}</span></button>
          <button class:active={filter === "changed"} onclick={() => filter = "changed"}>Price changed <span>{radar.summary.priceIncreases + radar.summary.priceDrops}</span></button>
        </div>

        <div class="table-wrap">
          <table>
            <thead><tr><th>Model</th><th>AA rank</th><th>Intelligence</th><th>Input / 1M</th><th>Output / 1M</th><th>Price move</th><th>Your monthly</th><th aria-label="Open details"></th></tr></thead>
            <tbody>
              {#each visibleModels as model (model.id)}
                {@const monthlyCost = model.inputPrice * safeInputMillions + model.outputPrice * safeOutputMillions}
                <tr>
                  <td><button class="model-identity" onclick={() => selectedModel = model}><span class="provider-monogram small">{providerName(model.provider).slice(0, 1)}</span><span><strong>{model.name}</strong><small>{providerName(model.provider)} / {compactNumber.format(model.contextLength)} ctx</small></span></button></td>
                  <td>{model.artificialAnalysisRank ? `#${model.artificialAnalysisRank}` : "-"}</td>
                  <td><span class="intelligence-cell"><strong>{model.intelligence ?? "-"}</strong>{#if model.intelligence !== null}<i style={`width: ${Math.min(100, model.intelligence)}%`}></i>{/if}</span></td>
                  <td>{formatPrice(model.inputPrice)}</td><td>{formatPrice(model.outputPrice)}</td>
                  <td><PriceChange value={model.priceChangePercent} /></td><td><strong>{money.format(monthlyCost)}</strong></td>
                  <td><button class="row-action" onclick={() => selectedModel = model} aria-label={`Inspect ${model.name}`}><span aria-hidden="true">&gt;</span></button></td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if visibleModels.length === 0}
            <div class="no-results"><Search size={23} /><strong>No models in this view</strong><p>Try another filter or clear your search.</p></div>
          {/if}
        </div>
      </section>

      <section class="method-section" id="method">
        <div><span class="section-kicker">HOW THE RADAR THINKS</span><h2>Independent quality.<br />Marketplace price.</h2></div>
        <div class="method-grid">
          <article><span>01</span><div><strong>Blended price</strong><p>Three input tokens to one output token, expressed per million total tokens.</p></div></article>
          <article><span>02</span><div><strong>Cheap</strong><p>Any paid model at or below {money.format(radar.summary.cheapThreshold)} blended. Change it with an environment variable.</p></div></article>
          <article><span>03</span><div><strong>Frontier</strong><p>The top ten OpenRouter models matched by Artificial Analysis Intelligence Index.</p></div></article>
          <article><span>04</span><div><strong>Value score</strong><p>68% intelligence, 22% price efficiency, and 10% output speed, normalized across matched models.</p></div></article>
        </div>
      </section>

      <footer>
        <div class="footer-brand"><Sparkles size={17} /> Model Radar</div>
        <p>Pricing by <a href="https://openrouter.ai" target="_blank" rel="noreferrer">OpenRouter</a>. Benchmark data by <a href="https://artificialanalysis.ai" target="_blank" rel="noreferrer">Artificial Analysis</a>.</p>
        <span>Built for better model decisions.</span>
      </footer>
    </div>
  </main>

  {#if selectedModel}
    <ModelDetail model={selectedModel} inputMillions={safeInputMillions} outputMillions={safeOutputMillions} onclose={() => selectedModel = null} />
  {/if}
</div>
