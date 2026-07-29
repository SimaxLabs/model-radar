<script lang="ts">
  import { BrainCircuit, ChevronRight } from "@lucide/svelte";
  import { formatPrice, money, providerName } from "$lib/format";
  import type { RadarModel } from "$lib/types";

  let {
    eyebrow,
    model,
    tone,
    inputMillions,
    outputMillions,
  }: {
    eyebrow: string;
    model: RadarModel | null;
    tone: "ink" | "lime" | "paper";
    inputMillions: number;
    outputMillions: number;
  } = $props();

  let estimatedCost = $derived(
    model ? model.inputPrice * inputMillions + model.outputPrice * outputMillions : null,
  );
</script>

<article class={`recommendation-card recommendation-${tone}`}>
  <div class="recommendation-eyebrow">
    <span>{eyebrow}</span>
    <ChevronRight size={16} />
  </div>
  {#if model}
    <div class="recommendation-heading">
      <span class="provider-monogram">{providerName(model.provider).slice(0, 1)}</span>
      <div>
        <h3>{model.name}</h3>
        <p>{providerName(model.provider)}</p>
      </div>
    </div>
    <div class="recommendation-stats">
      <div><span>AA index</span><strong>{model.intelligence ?? "-"}</strong></div>
      <div><span>Blended / 1M</span><strong>{formatPrice(model.blendedPrice)}</strong></div>
      <div><span>Your monthly</span><strong>{money.format(estimatedCost ?? 0)}</strong></div>
    </div>
  {:else}
    <div class="recommendation-empty">
      <BrainCircuit size={25} />
      <strong>Ranking data needed</strong>
      <p>Add your Artificial Analysis API key to calculate this pick.</p>
    </div>
  {/if}
</article>
