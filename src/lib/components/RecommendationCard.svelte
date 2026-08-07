<script lang="ts">
  import { BrainCircuit, Info, Wallet } from "@lucide/svelte";
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
    <span class="recommendation-label">
      {#if tone === "ink"}<BrainCircuit size={16} />{:else}<Wallet size={16} />{/if}
      {eyebrow}
    </span>
    <details class="recommendation-info">
      <summary aria-label={`How ${eyebrow.toLowerCase()} is populated`}><Info size={16} /></summary>
      <div>
        <strong>How this top 5 is populated</strong>
        <p>{method}</p>
      </div>
    </details>
  </div>
  {#if models.length > 0}
    <div class="recommendation-table">
      <table>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">AA Index</th>
            <th scope="col">Input / 1M</th>
            <th scope="col">Output / 1M</th>
            <th scope="col">Your monthly</th>
          </tr>
        </thead>
        <tbody>
          {#each models as model (model.id)}
            {@const estimatedCost = model.inputPrice * inputMillions + model.outputPrice * outputMillions}
            <tr>
              <td>
                <div class="recommendation-heading">
                  <ProviderLogo provider={model.provider} />
                  <h3 title={model.name}>{model.name}</h3>
                </div>
              </td>
              <td>{model.intelligence ?? "-"}</td>
              <td>{formatPrice(model.inputPrice)}</td>
              <td>{formatPrice(model.outputPrice)}</td>
              <td>{money.format(estimatedCost)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="recommendation-empty">
      <BrainCircuit size={25} />
      <strong>Benchmark data unavailable</strong>
      <p>OpenRouter has not supplied an AA Index for this view.</p>
    </div>
  {/if}
</article>
