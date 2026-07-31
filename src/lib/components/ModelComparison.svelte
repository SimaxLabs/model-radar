<script lang="ts">
  import { ExternalLink, X } from "@lucide/svelte";
  import { formatChange, formatPrice, money } from "$lib/format";
  import type { RadarModel } from "$lib/types";

  type ComparisonMetric = {
    label: string;
    description?: string;
    value: (model: RadarModel) => number | null;
    display: (model: RadarModel) => string;
    preference?: "high" | "low";
  };

  let {
    models,
    inputMillions,
    outputMillions,
    onremove,
    onclose,
  }: {
    models: RadarModel[];
    inputMillions: number;
    outputMillions: number;
    onremove: (modelId: string) => void;
    onclose: () => void;
  } = $props();

  let dialog: HTMLDialogElement;
  const capabilityMetrics: ComparisonMetric[] = [
    {
      label: "AA rank",
      value: (model) => model.intelligenceRank,
      display: (model) => model.intelligenceRank ? `#${model.intelligenceRank}` : "-",
      preference: "low",
    },
    {
      label: "Intelligence",
      value: (model) => model.intelligence,
      display: (model) => model.intelligence?.toString() ?? "-",
      preference: "high",
    },
    {
      label: "Coding",
      value: (model) => model.coding,
      display: (model) => model.coding?.toString() ?? "-",
      preference: "high",
    },
    {
      label: "Agentic",
      value: (model) => model.agentic,
      display: (model) => model.agentic?.toString() ?? "-",
      preference: "high",
    },
    {
      label: "Value score",
      value: (model) => model.valueScore,
      display: (model) => model.valueScore?.toString() ?? "-",
      preference: "high",
    },
  ];
  const priceMetrics: ComparisonMetric[] = [
    {
      label: "Input / 1M",
      value: (model) => model.inputPrice,
      display: (model) => formatPrice(model.inputPrice),
      preference: "low",
    },
    {
      label: "Output / 1M",
      value: (model) => model.outputPrice,
      display: (model) => formatPrice(model.outputPrice),
      preference: "low",
    },
    {
      label: "Your monthly",
      value: monthlyCost,
      display: (model) => money.format(monthlyCost(model)),
      preference: "low",
    },
    {
      label: "Price move",
      value: (model) => model.priceChangePercent,
      display: (model) => formatChange(model.priceChangePercent),
    },
  ];
  const metricGroups = [
    { label: "Capability", metrics: capabilityMetrics },
    { label: "Pricing", metrics: priceMetrics },
  ];

  $effect(() => {
    dialog.showModal();
    return () => dialog.close();
  });

  function monthlyCost(model: RadarModel) {
    return model.inputPrice * inputMillions + model.outputPrice * outputMillions;
  }

  function isBest(metric: ComparisonMetric, model: RadarModel) {
    if (!metric.preference) return false;
    const value = metric.value(model);
    if (value === null) return false;
    const values = models
      .map((candidate) => metric.value(candidate))
      .filter((candidate): candidate is number => candidate !== null);
    if (new Set(values).size < 2) return false;
    const best = metric.preference === "high" ? Math.max(...values) : Math.min(...values);
    return value === best;
  }
</script>

<dialog
  bind:this={dialog}
  class="comparison-panel"
  aria-label="Model comparison"
  oncancel={(event) => { event.preventDefault(); onclose(); }}
  onclick={(event) => { if (event.target === dialog) onclose(); }}
>
  <header class="comparison-header">
    <div>
      <span class="section-kicker">SIDE-BY-SIDE</span>
      <h2>Model comparison</h2>
      <p>{inputMillions}M input + {outputMillions}M output tokens per month</p>
    </div>
    <button class="comparison-close" onclick={onclose} aria-label="Close comparison"><X size={18} /></button>
  </header>

  <div class="comparison-scroll">
    <table class="comparison-table">
      <thead>
        <tr>
          <th>Signal</th>
          {#each models as model (model.id)}
            <th>
              <div class="comparison-model">
                 <div>
                   <strong title={model.name}>{model.name}</strong>
                 </div>
                <button onclick={() => onremove(model.id)} aria-label={`Remove ${model.name} from comparison`}><X size={13} /></button>
              </div>
              <a href={`https://openrouter.ai/${model.id}`} target="_blank" rel="noreferrer">OpenRouter <ExternalLink size={11} /></a>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each metricGroups as group (group.label)}
          <tr class="comparison-group"><th colspan={models.length + 1}>{group.label}</th></tr>
          {#each group.metrics as metric (metric.label)}
            <tr>
              <th class:has-tooltip={metric.description !== undefined} title={metric.description}>{metric.label}</th>
              {#each models as model (model.id)}
                {@const best = isBest(metric, model)}
                <td class:comparison-best={best}>
                  <strong>{metric.display(model)}</strong>
                  {#if best}<span>Best</span>{/if}
                </td>
              {/each}
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  </div>
</dialog>
