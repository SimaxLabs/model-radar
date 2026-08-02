<script lang="ts">
  import { ArrowDownRight, ArrowUpRight } from "@lucide/svelte";
  import { formatChange } from "$lib/format";

  let { value }: { value: number | null } = $props();
</script>

{#if value === null || Math.abs(value) < 0.001}
  <span class="change-neutral">No active change</span>
{:else if value > 0}
  <span class="change-up"><ArrowUpRight size={14} />{formatChange(value)}</span>
{:else}
  <span class="change-down"><ArrowDownRight size={14} />{formatChange(value)}</span>
{/if}
