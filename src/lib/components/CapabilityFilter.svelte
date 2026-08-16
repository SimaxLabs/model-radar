<script lang="ts">
  import { ChevronDown, Shapes } from "@lucide/svelte";
  import ModalityIcon from "$lib/components/ModalityIcon.svelte";
  import { displayModalityName } from "$lib/format";

  let {
    label,
    modalities,
    value,
    tone,
    onselect,
  }: {
    label: string;
    modalities: string[];
    value: string;
    tone: "input" | "output";
    onselect: (value: string) => void;
  } = $props();

  let menu: HTMLDetailsElement;

  function select(value: string) {
    onselect(value);
    menu.open = false;
  }
</script>

<details bind:this={menu} name="capability-filter" class={`capability-menu capability-menu-${tone}`}>
  <summary aria-label={`Filter models by ${label.toLowerCase()} capability`}>
    <span class="capability-menu-icon">
      {#if value === "all"}<Shapes size={14} aria-hidden="true" />{:else}<ModalityIcon modality={value} size={14} />{/if}
    </span>
    <span class="capability-menu-copy"><small>{label}</small><strong>{value === "all" ? "Any" : displayModalityName(value)}</strong></span>
    <ChevronDown size={13} aria-hidden="true" />
  </summary>
  <div class="capability-menu-options" role="group" aria-label={`${label} capabilities`}>
    <button type="button" class:active={value === "all"} aria-pressed={value === "all"} onclick={() => select("all")}>
      <span><Shapes size={14} aria-hidden="true" /></span>Any {label.toLowerCase()}
    </button>
    {#each modalities as modality (modality)}
      <button type="button" class:active={value === modality} aria-pressed={value === modality} onclick={() => select(modality)}>
        <span><ModalityIcon {modality} size={14} /></span>{displayModalityName(modality)}
      </button>
    {/each}
  </div>
</details>
