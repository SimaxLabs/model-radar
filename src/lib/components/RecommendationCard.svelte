<script lang="ts">
  import { BrainCircuit, Info } from "@lucide/svelte";
  import ProviderLogo from "$lib/components/ProviderLogo.svelte";
  import { formatPrice, money } from "$lib/format";
  import type { RadarModel } from "$lib/types";

  let {
    eyebrow,
    method,
    models,
    tone,
    inputMillions,
    outputMillions,
  }: {
    eyebrow: string;
    method: string;
    models: RadarModel[];
    tone: "ink" | "lime";
    inputMillions: number;
    outputMillions: number;
  } = $props();
</script>

<article class={`recommendation-card recommendation-${tone}`}>
  <div class="recommendation-eyebrow">
    <span>{eyebrow}</span>
    <details class="recommendation-info">
      <summary aria-label={`How ${eyebrow.toLowerCase()} is populated`}><Info size={16} /></summary>
      <div>
        <strong>How this top 5 is populated</strong>
        <p>{method}</p>
      </div>
    </details>
  </div>
  {#if models.length > 0}
    <ol class="recommendation-list">
      {#each models as model (model.id)}
        {@const estimatedCost = model.inputPrice * inputMillions + model.outputPrice * outputMillions}
        <li class="recommendation-item">
          <div class="recommendation-body">
            <div class="recommendation-heading">
              <ProviderLogo provider={model.provider} />
              <div>
                <h3 title={model.name}>{model.name}</h3>
              </div>
            </div>
            <div class="recommendation-stats">
              <div><span>AA index</span><strong>{model.intelligence ?? "-"}</strong></div>
              <div><span>Input / 1M</span><strong>{formatPrice(model.inputPrice)}</strong></div>
              <div><span>Output / 1M</span><strong>{formatPrice(model.outputPrice)}</strong></div>
              <div><span class="has-tooltip" title="Estimated cost for 1M total tokens using 75% input and 25% output (a 3:1 mix).">Blended / 1M</span><strong>{formatPrice(model.blendedPrice)}</strong></div>
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
