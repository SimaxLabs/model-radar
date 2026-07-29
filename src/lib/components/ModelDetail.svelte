<script lang="ts">
  import { ExternalLink } from "@lucide/svelte";
  import { compactNumber, formatPrice, money, providerName } from "$lib/format";
  import type { ModelSegment, RadarModel } from "$lib/types";
  import PriceChange from "$lib/components/PriceChange.svelte";

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
    model.inputPrice * inputMillions + model.outputPrice * outputMillions,
  );

  $effect(() => {
    dialog.showModal();
    return () => dialog.close();
  });

  function segmentLabel(segment: ModelSegment) {
    if (segment === "state-of-the-art") return "Frontier";
    if (segment === "cheap") return "Cheap";
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
  <button class="detail-close" onclick={onclose} aria-label="Close details">
    <span>Close</span><span aria-hidden="true">x</span>
  </button>
  <div class="detail-title">
    <span class="provider-monogram large">{providerName(model.provider).slice(0, 1)}</span>
    <div><p>{providerName(model.provider)}</p><h2>{model.name}</h2></div>
  </div>
  <div class="detail-badges">
    <span class={`segment-tag segment-${model.segment}`}>{segmentLabel(model.segment)}</span>
    <span>{compactNumber.format(model.contextLength)} context</span>
  </div>

  <section class="detail-callout">
    <span>Estimated monthly cost</span>
    <strong>{money.format(monthlyCost)}</strong>
    <p>Based on {inputMillions}M input and {outputMillions}M output tokens.</p>
  </section>

  <section class="detail-section">
    <div class="section-heading compact"><div><span class="section-kicker">PRICE CARD</span><h3>OpenRouter rates</h3></div></div>
    <dl class="detail-list">
      <div><dt>Input / 1M</dt><dd>{formatPrice(model.inputPrice)}</dd></div>
      <div><dt>Output / 1M</dt><dd>{formatPrice(model.outputPrice)}</dd></div>
      <div><dt>3:1 blended / 1M</dt><dd>{formatPrice(model.blendedPrice)}</dd></div>
      <div><dt>Since prior snapshot</dt><dd><PriceChange value={model.priceChangePercent} /></dd></div>
    </dl>
  </section>

  <section class="detail-section">
    <div class="section-heading compact"><div><span class="section-kicker">CAPABILITY</span><h3>Artificial Analysis</h3></div></div>
    <dl class="detail-list">
      <div><dt>Intelligence index</dt><dd>{model.intelligence ?? "Not matched"}</dd></div>
      <div><dt>Coding index</dt><dd>{model.coding ?? "-"}</dd></div>
      <div><dt>Math index</dt><dd>{model.math ?? "-"}</dd></div>
      <div><dt>Median output speed</dt><dd>{model.speed ? `${Math.round(model.speed)} t/s` : "-"}</dd></div>
    </dl>
    {#if model.artificialAnalysisName}
      <p class="match-note">Matched to "{model.artificialAnalysisName}" with {model.matchConfidence}% confidence.</p>
    {/if}
  </section>

  <div class="detail-links">
    <a href={`https://openrouter.ai/${model.id}`} target="_blank" rel="noreferrer">Open in OpenRouter <ExternalLink size={14} /></a>
    {#if model.artificialAnalysisSlug}
      <a href={`https://artificialanalysis.ai/models/${model.artificialAnalysisSlug}`} target="_blank" rel="noreferrer">View benchmark <ExternalLink size={14} /></a>
    {/if}
  </div>
</dialog>
