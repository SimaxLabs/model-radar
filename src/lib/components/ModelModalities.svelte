<script lang="ts">
  import {
    ArrowRight,
    AudioLines,
    Binary,
    Captions,
    CircleQuestionMark,
    FileText,
    Image,
    ListOrdered,
    Speech,
    Type,
    Video,
  } from "@lucide/svelte";

  let {
    inputModalities,
    outputModalities,
  }: {
    inputModalities: string[];
    outputModalities: string[];
  } = $props();

  function modalityLabel(modality: string) {
    return modality
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function modalityIcon(modality: string) {
    switch (modality.toLowerCase()) {
      case "text": return Type;
      case "image": return Image;
      case "file": return FileText;
      case "audio": return AudioLines;
      case "video": return Video;
      case "embeddings": return Binary;
      case "rerank": return ListOrdered;
      case "speech": return Speech;
      case "transcription": return Captions;
      default: return CircleQuestionMark;
    }
  }
</script>

<span class="modality-route">
  <span class="modality-set">
    {#each inputModalities as modality (`input-${modality}`)}
      {@const ModalityIcon = modalityIcon(modality)}
      <span class="modality-icon modality-input" role="img" aria-label={`${modalityLabel(modality)} input`} title={`${modalityLabel(modality)} input`}>
        <ModalityIcon size={15} aria-hidden="true" />
      </span>
    {:else}
      <span class="modality-icon" role="img" aria-label="Input modalities not published" title="Input modalities not published"><CircleQuestionMark size={15} aria-hidden="true" /></span>
    {/each}
  </span>
  <ArrowRight class="modality-route-arrow" size={15} aria-hidden="true" />
  <span class="modality-set">
    {#each outputModalities as modality (`output-${modality}`)}
      {@const ModalityIcon = modalityIcon(modality)}
      <span class="modality-icon modality-output" role="img" aria-label={`${modalityLabel(modality)} output`} title={`${modalityLabel(modality)} output`}>
        <ModalityIcon size={15} aria-hidden="true" />
      </span>
    {:else}
      <span class="modality-icon" role="img" aria-label="Output modalities not published" title="Output modalities not published"><CircleQuestionMark size={15} aria-hidden="true" /></span>
    {/each}
  </span>
</span>
