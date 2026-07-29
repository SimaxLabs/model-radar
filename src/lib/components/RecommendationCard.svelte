<script lang="ts">
  import { BrainCircuit, ChevronRight } from "@lucide/svelte";
  import { formatPrice, money, providerName } from "$lib/format";
  import type { RadarModel } from "$lib/types";

  let {
    eyebrow,
    models,
    tone,
    inputMillions,
    outputMillions,
  }: {
    eyebrow: string;
    models: RadarModel[];
    tone: "ink" | "lime" | "paper";
    inputMillions: number;
    outputMillions: number;
  } = $props();
</script>

<article class={`recommendation-card recommendation-${tone}`}>
  <div class="recommendation-eyebrow">
    <span>{eyebrow}</span>
    <ChevronRight size={16} />
  </div>
  {#if models.length > 0}
    <ol class="recommendation-list">
      {#each models as model, index (model.id)}
        {@const estimatedCost = model.inputPrice * inputMillions + model.outputPrice * outputMillions}
        <li class="recommendation-item">
          <span class="recommendation-rank">{String(index + 1).padStart(2, "0")}</span>
          <div class="recommendation-body">
            <div class="recommendation-heading">
              <span class="provider-monogram">{providerName(model.provider).slice(0, 1)}</span>
              <div>
                <h3 title={model.name}>{model.name}</h3>
                <p>{providerName(model.provider)}</p>
              </div>
            </div>
            <div class="recommendation-stats">
              <div><span>AA index</span><strong>{model.intelligence ?? "-"}</strong></div>
              <div><span>Blended / 1M</span><strong>{formatPrice(model.blendedPrice)}</strong></div>
              <div><span>Your monthly</span><strong>{money.format(estimatedCost)}</strong></div>
            </div>
          </div>
        </li>
      {/each}
    </ol>
  {:else}
    <div class="recommendation-empty">
      <BrainCircuit size={25} />
      <strong>Benchmark data unavailable</strong>
      <p>OpenRouter has not supplied an Intelligence Index for this view.</p>
    </div>
  {/if}
</article>
