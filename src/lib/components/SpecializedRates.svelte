<script lang="ts">
  import { formatUnitPrice } from "$lib/format";
  import type { SpecializedRate } from "$lib/types";

  let { rates }: { rates: SpecializedRate[] } = $props();
</script>

<span class="specialized-rate-list">
  {#each rates as rate (`${rate.label}-${rate.unit}-${rate.price}`)}
    <span class="specialized-rate">
      <span>{rate.label}</span>
      <strong>{formatUnitPrice(rate.price)}</strong>
      <small>/ {rate.unit}</small>
    </span>
  {:else}
    <span class="specialized-rate-unavailable">Unavailable</span>
  {/each}
</span>
