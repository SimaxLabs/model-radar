<script lang="ts">
  import { ArrowDownRight, ArrowUpRight } from "@lucide/svelte";
  import { formatChange } from "$lib/format";

  let { value, detail }: { value: number | null; detail?: string } = $props();
</script>

{#if value === null || Math.abs(value) < 0.001}
  <span class="change-neutral" class:change-has-detail={detail !== undefined} title={detail}>No active change</span>
{:else if value > 0}
  <span class="change-up" class:change-has-detail={detail !== undefined} title={detail}><ArrowUpRight size={14} />{formatChange(value)}</span>
{:else}
  <span class="change-down" class:change-has-detail={detail !== undefined} title={detail}><ArrowDownRight size={14} />{formatChange(value)}</span>
{/if}
