<script lang="ts">
  import { BrainCircuit, Info, Wallet } from "@lucide/svelte";
  import ProviderLogo from "$lib/components/ProviderLogo.svelte";
  import { displayModelName, formatPrice, formatTokenCount } from "$lib/format";
  import type { RadarModel } from "$lib/types";

  let {
    eyebrow,
    method,
    models,
    tone,
    onselect,
  }: {
    eyebrow: string;
    method: string;
    models: RadarModel[];
    tone: "ink" | "lime";
    onselect: (model: RadarModel) => void;
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
      <table aria-label={`${eyebrow} top models`}>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Context</th>
            <th scope="col">Input / 1M</th>
            <th scope="col">Output / 1M</th>
          </tr>
        </thead>
        <tbody>
          {#each models as model (model.id)}
            <tr>
              <td>
                <div class="recommendation-heading">
                  <ProviderLogo provider={model.provider} />
                  <h3 title={displayModelName(model.name)}><button type="button" onclick={() => onselect(model)}>{displayModelName(model.name)}</button></h3>
                </div>
              </td>
              <td>{formatTokenCount(model.contextLength)}</td>
              <td>{model.inputPrice === null ? "-" : formatPrice(model.inputPrice)}</td>
              <td>{model.outputPrice === null ? "-" : formatPrice(model.outputPrice)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <ol class="recommendation-mobile-list">
        {#each models as model, index (model.id)}
          <li>
            <div class="recommendation-mobile-heading">
              <span class="recommendation-rank" aria-label={`Rank ${index + 1}`}>{index + 1}</span>
              <ProviderLogo provider={model.provider} />
              <h3><button type="button" onclick={() => onselect(model)}>{displayModelName(model.name)}</button></h3>
            </div>
            <dl>
              <div><dt>Context</dt><dd>{formatTokenCount(model.contextLength)}</dd></div>
              <div><dt>Input / 1M</dt><dd>{model.inputPrice === null ? "-" : formatPrice(model.inputPrice)}</dd></div>
              <div><dt>Output / 1M</dt><dd>{model.outputPrice === null ? "-" : formatPrice(model.outputPrice)}</dd></div>
            </dl>
          </li>
        {/each}
      </ol>
    </div>
  {:else}
    <div class="recommendation-empty">
      <BrainCircuit size={25} />
      <strong>Benchmark data unavailable</strong>
      <p>OpenRouter has not supplied an AA Index for this view.</p>
    </div>
  {/if}
</article>
