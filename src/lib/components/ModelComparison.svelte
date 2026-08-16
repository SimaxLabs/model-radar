<script lang="ts">
  import { ExternalLink, X } from "@lucide/svelte";
  import { formatChange, formatPrice, formatTokenCount, money } from "$lib/format";
  import type { RadarModel } from "$lib/types";

  type ComparisonMetric = {
    label: string;
    value: (model: RadarModel) => number | null;
    display: (model: RadarModel) => string;
    preference?: "high" | "low";
  };

  let {
    models,
    inputMillions,
    outputMillions,
    onclose,
  }: {
    models: RadarModel[];
    inputMillions: number;
    outputMillions: number;
    onclose: () => void;
  } = $props();

  let dialog: HTMLDialogElement;
  const capabilityMetrics: ComparisonMetric[] = [
    {
      label: "Context window",
      value: (model) => model.contextLength,
      display: (model) => formatTokenCount(model.contextLength),
      preference: "high",
    },
    {
      label: "AA Index",
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
      label: "Input move",
      value: (model) => model.inputPriceChangePercent,
      display: (model) => formatChange(model.inputPriceChangePercent),
    },
    {
      label: "Output move",
      value: (model) => model.outputPriceChangePercent,
      display: (model) => formatChange(model.outputPriceChangePercent),
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
    <table class="comparison-table" aria-label="Model comparison">
      <thead>
        <tr>
          <th scope="col">Signal</th>
          {#each models as model (model.id)}
            <th scope="col">
              <div class="comparison-model">
                <strong title={model.name}>{model.name}</strong>
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
              <th scope="row">{metric.label}</th>
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
    <div class="comparison-cards">
      {#each models as model (model.id)}
        <article class="comparison-card">
          <div class="comparison-card-heading">
            <div>
              <strong>{model.name}</strong>
              <a href={`https://openrouter.ai/${model.id}`} target="_blank" rel="noreferrer">OpenRouter <ExternalLink size={11} /></a>
            </div>
          </div>
          {#each metricGroups as group (group.label)}
            <section>
              <h3>{group.label}</h3>
              <dl>
                {#each group.metrics as metric (metric.label)}
                  {@const best = isBest(metric, model)}
                  <div class:comparison-best={best}>
                    <dt>{metric.label}</dt>
                    <dd><strong>{metric.display(model)}</strong>{#if best}<span>Best</span>{/if}</dd>
                  </div>
                {/each}
              </dl>
            </section>
          {/each}
        </article>
      {/each}
    </div>
  </div>
</dialog>
