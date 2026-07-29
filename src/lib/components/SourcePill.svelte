<script lang="ts">
  import type { SourceStatus } from "$lib/types";

  let { source }: { source: SourceStatus } = $props();
</script>

<div class:source-pill={true} class:source-live={source.state === "live"} class:source-needs-key={source.state === "needs-key"} class:source-unavailable={source.state === "unavailable"} title={source.detail}>
  <span class="status-dot"></span>
  <span>{source.label}</span>
</div>
