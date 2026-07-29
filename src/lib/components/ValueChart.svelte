<script lang="ts">
  import { Activity } from "@lucide/svelte";
  import { formatPrice } from "$lib/format";
  import type { RadarModel } from "$lib/types";

  let { models }: { models: RadarModel[] } = $props();

  const width = 900;
  const height = 350;
  const margin = { top: 22, right: 28, bottom: 42, left: 54 };
  const xTicks = [0, 1, 2, 3, 4];
  const yTicks = [0, 1, 2, 3, 4];
  let ranked = $derived(
    models.filter((model) => model.intelligence !== null && model.blendedPrice > 0),
  );
  let plot = $derived.by(() => {
    if (ranked.length === 0) return [];
    const logPrices = ranked.map((model) => Math.log10(model.blendedPrice));
    const intelligence = ranked.map((model) => model.intelligence ?? 0);
    const minX = Math.min(...logPrices);
    const maxX = Math.max(...logPrices);
    const minY = Math.min(...intelligence);
    const maxY = Math.max(...intelligence);
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    return ranked.map((model) => ({
      model,
      x: margin.left + ((Math.log10(model.blendedPrice) - minX) / (maxX - minX || 1)) * innerWidth,
      y: margin.top + (1 - ((model.intelligence ?? 0) - minY) / (maxY - minY || 1)) * innerHeight,
      color: model.isStateOfTheArt ? "#f06942" : model.isCheap ? "#a9c72f" : "#8d8d86",
    }));
  });
</script>

{#if ranked.length === 0}
  <div class="chart-empty">
    <div class="chart-empty-icon"><Activity size={24} /></div>
    <strong>The value map is waiting for rankings</strong>
    <p>Pricing is live. Add an Artificial Analysis API key to plot intelligence.</p>
  </div>
{:else}
  <div class="chart-wrap">
    <svg class="value-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Model price compared with Artificial Analysis Intelligence Index">
      {#each yTicks as tick (tick)}
        {@const y = margin.top + (tick / 4) * (height - margin.top - margin.bottom)}
        <line x1={margin.left} x2={width - margin.right} y1={y} y2={y} class="chart-gridline"></line>
      {/each}
      {#each xTicks as tick (tick)}
        {@const x = margin.left + (tick / 4) * (width - margin.left - margin.right)}
        <line x1={x} x2={x} y1={margin.top} y2={height - margin.bottom} class="chart-gridline vertical"></line>
      {/each}
      <text x="18" y={height / 2} class="chart-axis-title" transform={`rotate(-90 18 ${height / 2})`}>AA INTELLIGENCE</text>
      <text x={width / 2} y={height - 8} class="chart-axis-title">BLENDED PRICE / 1M TOKENS (LOG SCALE)</text>
      {#each plot as point (point.model.id)}
        <circle cx={point.x} cy={point.y} r={point.model.isStateOfTheArt ? 7 : 5} fill={point.color} class="model-dot">
          <title>{point.model.name}: {point.model.intelligence} intelligence, {formatPrice(point.model.blendedPrice)} blended</title>
        </circle>
      {/each}
    </svg>
  </div>
{/if}
