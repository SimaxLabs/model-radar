<script lang="ts">
  import { ArrowRight } from "@lucide/svelte";
  import ModalityIcon from "$lib/components/ModalityIcon.svelte";
  import { displayModalityName } from "$lib/format";

  let {
    inputModalities,
    outputModalities,
  }: {
    inputModalities: string[];
    outputModalities: string[];
  } = $props();

</script>

<span class="modality-route">
  <span class="modality-set">
    {#each inputModalities as modality (`input-${modality}`)}
      <span class="modality-icon modality-input" role="img" aria-label={`${displayModalityName(modality)} input`} title={`${displayModalityName(modality)} input`}>
        <ModalityIcon {modality} />
      </span>
    {:else}
      <span class="modality-icon" role="img" aria-label="Input modalities not published" title="Input modalities not published"><ModalityIcon modality="unknown" /></span>
    {/each}
  </span>
  <ArrowRight class="modality-route-arrow" size={15} aria-hidden="true" />
  <span class="modality-set">
    {#each outputModalities as modality (`output-${modality}`)}
      <span class="modality-icon modality-output" role="img" aria-label={`${displayModalityName(modality)} output`} title={`${displayModalityName(modality)} output`}>
        <ModalityIcon {modality} />
      </span>
    {:else}
      <span class="modality-icon" role="img" aria-label="Output modalities not published" title="Output modalities not published"><ModalityIcon modality="unknown" /></span>
    {/each}
  </span>
</span>
