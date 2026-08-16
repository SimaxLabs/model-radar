<script lang="ts">
  import { ExternalLink, X } from "@lucide/svelte";
  import { formatPrice, formatSyncTime, formatTokenCount, money } from "$lib/format";
  import type { ModelSegment, RadarModel } from "$lib/types";
  import ModelModalities from "$lib/components/ModelModalities.svelte";
  import ProviderLogo from "$lib/components/ProviderLogo.svelte";
  import PriceChange from "$lib/components/PriceChange.svelte";
  import SpecializedRates from "$lib/components/SpecializedRates.svelte";

  const modelDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  let {
    model,
    inputMillions,
    outputMillions,
    onclose,
  }: {
    model: RadarModel;
    inputMillions: number;
    outputMillions: number;
    onclose: () => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let monthlyCost = $derived(
    model.inputPrice === null || model.outputPrice === null
      ? null
      : model.inputPrice * inputMillions + model.outputPrice * outputMillions,
  );

  $effect(() => {
    dialog.showModal();
    return () => dialog.close();
  });

  function segmentLabel(segment: ModelSegment) {
    if (segment === "state-of-the-art") return "Frontier";
    if (segment === "cheap") return "Cheap";
    if (segment === "free") return "Free";
    if (segment === "batch") return "Batch";
    if (segment === "specialized") return "Specialized";
    return "Standard";
  }
</script>

<dialog
  bind:this={dialog}
  class="detail-panel"
  aria-label={`${model.name} details`}
  oncancel={(event) => { event.preventDefault(); onclose(); }}
  onclick={(event) => { if (event.target === dialog) onclose(); }}
>
  <div class="detail-header">
    <div class="detail-title">
      <ProviderLogo provider={model.provider} size="large" />
      <div><h2>{model.name}</h2></div>
    </div>
    <button class="detail-close" onclick={onclose} aria-label="Close details"><X size={18} /></button>
  </div>
  <div class="detail-badges">
    <span class={`segment-tag segment-${model.segment}`}>{segmentLabel(model.segment)}</span>
  </div>

  {#if model.pricingBasis === "token" && model.inputPrice !== null && model.outputPrice !== null && monthlyCost !== null}
    <section class="detail-section">
      <div class="section-heading compact"><div><span class="section-kicker">WORKLOAD</span><h3>Estimated cost</h3></div></div>
      <dl class="detail-list detail-estimate-list">
        <div><dt>Monthly estimate</dt><dd>{money.format(monthlyCost)}</dd></div>
        <div><dt>Token volume</dt><dd>{inputMillions}M in / {outputMillions}M out</dd></div>
      </dl>
    </section>

    <section class="detail-section">
      <div class="section-heading compact"><div><span class="section-kicker">PRICE CARD</span><h3>OpenRouter rates</h3></div></div>
      <dl class="detail-list">
        <div><dt>Input / 1M</dt><dd>{formatPrice(model.inputPrice)}</dd></div>
        <div><dt>Output / 1M</dt><dd>{formatPrice(model.outputPrice)}</dd></div>
      </dl>
    </section>

    <section class="detail-section">
      <div class="section-heading compact"><div><span class="section-kicker">PRICE MOVEMENT</span><h3>Direct rate changes</h3></div></div>
      <dl class="detail-list">
        <div><dt>Input movement</dt><dd><PriceChange value={model.inputPriceChangePercent} /></dd></div>
        {#if model.previousInputPrice !== null && model.previousOutputPrice !== null}
          <div><dt>Original input / 1M</dt><dd>{formatPrice(model.previousInputPrice)}</dd></div>
        {/if}
        <div><dt>Output movement</dt><dd><PriceChange value={model.outputPriceChangePercent} /></dd></div>
        {#if model.previousInputPrice !== null && model.previousOutputPrice !== null}
          <div><dt>Original output / 1M</dt><dd>{formatPrice(model.previousOutputPrice)}</dd></div>
          <div><dt>Price move recorded</dt><dd>{model.priceChangeRecordedAt ? formatSyncTime(model.priceChangeRecordedAt) : "Unavailable"}</dd></div>
        {/if}
      </dl>
    </section>
  {:else if model.specializedPricing !== null}
    <section class="detail-section">
      <div class="section-heading compact"><div><span class="section-kicker">PRICE CARD</span><h3>Native OpenRouter rates</h3></div></div>
      <p class="detail-section-note">Rates retain their published units and are not used for workload estimates or cross-model price comparisons.</p>
      <dl class="detail-list">
        <div class="detail-specialized-rate-row"><dt>Input price</dt><dd><SpecializedRates rates={model.specializedPricing.input} /></dd></div>
        <div class="detail-specialized-rate-row"><dt>Output price</dt><dd><SpecializedRates rates={model.specializedPricing.output} /></dd></div>
      </dl>
    </section>
  {/if}

  <section class="detail-section">
    <div class="section-heading compact"><div><span class="section-kicker">OPENROUTER</span><h3>Model capabilities</h3></div></div>
    {#if model.pricingBasis === "specialized"}<p class="detail-section-note">This model uses non-token or mixed-unit pricing, so workload cost estimates are intentionally omitted.</p>{/if}
    <dl class="detail-list">
      <div class="detail-modality-row">
        <dt>Input / output</dt>
        <dd><ModelModalities inputModalities={model.inputModalities} outputModalities={model.outputModalities} /></dd>
      </div>
      <div><dt>Context window</dt><dd>{model.contextLength > 0 ? formatTokenCount(model.contextLength) : "Not applicable"}</dd></div>
      {#if model.maxCompletionTokens !== null && model.maxCompletionTokens > 0}<div><dt>Max output</dt><dd>{formatTokenCount(model.maxCompletionTokens)}</dd></div>{/if}
      <div><dt>Added to OpenRouter</dt><dd>{modelDate.format(new Date(model.createdAt))}</dd></div>
      {#if model.expiresAt}<div><dt>Expires</dt><dd>{modelDate.format(new Date(model.expiresAt))}</dd></div>{/if}
    </dl>
  </section>

  <section class="detail-section">
    <div class="section-heading compact"><div><span class="section-kicker">CAPABILITY</span><h3>Artificial Analysis via OpenRouter</h3></div></div>
    <dl class="detail-list">
      <div><dt>AA Index</dt><dd>{model.intelligence ?? "Not available"}</dd></div>
      <div><dt>Coding index</dt><dd>{model.coding ?? "-"}</dd></div>
      <div><dt>Agentic index</dt><dd>{model.agentic ?? "-"}</dd></div>
    </dl>
  </section>

  <div class="detail-links">
    <a href={`https://openrouter.ai/${model.id}`} target="_blank" rel="noreferrer">Open in OpenRouter <ExternalLink size={14} /></a>
  </div>
</dialog>
