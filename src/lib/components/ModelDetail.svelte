<script lang="ts">
  import { ExternalLink } from "@lucide/svelte";
  import { formatPrice, money } from "$lib/format";
  import type { ModelSegment, RadarModel } from "$lib/types";
  import ProviderLogo from "$lib/components/ProviderLogo.svelte";
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
    <ProviderLogo provider={model.provider} size="large" />
    <div><h2>{model.name}</h2></div>
  </div>
  <div class="detail-badges">
    <span class={`segment-tag segment-${model.segment}`}>{segmentLabel(model.segment)}</span>
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
      <div><dt>Since prior snapshot</dt><dd><PriceChange value={model.priceChangePercent} /></dd></div>
    </dl>
  </section>

  <section class="detail-section">
    <div class="section-heading compact"><div><span class="section-kicker">CAPABILITY</span><h3>Artificial Analysis via OpenRouter</h3></div></div>
    <dl class="detail-list">
      <div><dt>Intelligence index</dt><dd>{model.intelligence ?? "Not available"}</dd></div>
      <div><dt>Coding index</dt><dd>{model.coding ?? "-"}</dd></div>
      <div><dt>Agentic index</dt><dd>{model.agentic ?? "-"}</dd></div>
      <div><dt>Paid-model rank</dt><dd>{model.intelligenceRank ? `#${model.intelligenceRank}` : "-"}</dd></div>
    </dl>
  </section>

  <div class="detail-links">
    <a href={`https://openrouter.ai/${model.id}`} target="_blank" rel="noreferrer">Open in OpenRouter <ExternalLink size={14} /></a>
  </div>
</dialog>
