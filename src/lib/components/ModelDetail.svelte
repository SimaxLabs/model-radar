<script lang="ts">
  import {
    ArrowRight,
    AudioLines,
    Binary,
    Captions,
    CircleQuestionMark,
    ExternalLink,
    FileText,
    Image,
    ListOrdered,
    Speech,
    Type,
    Video,
    X,
  } from "@lucide/svelte";
  import { formatPrice, formatSyncTime, formatTokenCount, money } from "$lib/format";
  import type { ModelSegment, RadarModel } from "$lib/types";
  import ProviderLogo from "$lib/components/ProviderLogo.svelte";
  import PriceChange from "$lib/components/PriceChange.svelte";

  let {
    model,
    inputMillions,
    outputMillions,
    onclose,
  }: {
    model: RadarModel;
    inputMillions: number;
    outputMillions: number;
    onclose: () => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let monthlyCost = $derived(
    model.inputPrice * inputMillions + model.outputPrice * outputMillions,
  );

  $effect(() => {
    dialog.showModal();
    return () => dialog.close();
  });

  function segmentLabel(segment: ModelSegment) {
    if (segment === "state-of-the-art") return "Frontier";
    if (segment === "cheap") return "Cheap";
    if (segment === "free") return "Free";
    if (segment === "batch") return "Batch";
    return "Standard";
  }

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

<dialog
  bind:this={dialog}
  class="detail-panel"
  aria-label={`${model.name} details`}
  oncancel={(event) => { event.preventDefault(); onclose(); }}
  onclick={(event) => { if (event.target === dialog) onclose(); }}
>
  <div class="detail-header">
    <div class="detail-title">
      <ProviderLogo provider={model.provider} size="large" />
      <div><h2>{model.name}</h2></div>
    </div>
    <button class="detail-close" onclick={onclose} aria-label="Close details"><X size={18} /></button>
  </div>
  <div class="detail-badges">
    <span class={`segment-tag segment-${model.segment}`}>{segmentLabel(model.segment)}</span>
  </div>

  <section class="detail-section">
    <div class="section-heading compact"><div><span class="section-kicker">WORKLOAD</span><h3>Estimated cost</h3></div></div>
    <dl class="detail-list detail-estimate-list">
      <div><dt>Monthly estimate</dt><dd>{money.format(monthlyCost)}</dd></div>
      <div><dt>Token volume</dt><dd>{inputMillions}M in / {outputMillions}M out</dd></div>
    </dl>
  </section>

  <section class="detail-section">
    <div class="section-heading compact"><div><span class="section-kicker">PRICE CARD</span><h3>OpenRouter rates</h3></div></div>
    <dl class="detail-list">
      <div><dt>Input / 1M</dt><dd>{formatPrice(model.inputPrice)}</dd></div>
      <div><dt>Output / 1M</dt><dd>{formatPrice(model.outputPrice)}</dd></div>
    </dl>
  </section>

  <section class="detail-section">
    <div class="section-heading compact"><div><span class="section-kicker">PRICE MOVEMENT</span><h3>Direct rate changes</h3></div></div>
    <dl class="detail-list">
      <div><dt>Input movement</dt><dd><PriceChange value={model.inputPriceChangePercent} /></dd></div>
      {#if model.previousInputPrice !== null && model.previousOutputPrice !== null}
        <div><dt>Original input / 1M</dt><dd>{formatPrice(model.previousInputPrice)}</dd></div>
      {/if}
      <div><dt>Output movement</dt><dd><PriceChange value={model.outputPriceChangePercent} /></dd></div>
      {#if model.previousInputPrice !== null && model.previousOutputPrice !== null}
        <div><dt>Original output / 1M</dt><dd>{formatPrice(model.previousOutputPrice)}</dd></div>
        <div><dt>Price move recorded</dt><dd>{model.priceChangeRecordedAt ? formatSyncTime(model.priceChangeRecordedAt) : "Unavailable"}</dd></div>
      {/if}
    </dl>
  </section>

  <section class="detail-section">
    <div class="section-heading compact"><div><span class="section-kicker">OPENROUTER</span><h3>Model capabilities</h3></div></div>
    <p class="detail-section-note">OpenRouter returns text-output models by default; supported inputs can still vary by model.</p>
    <dl class="detail-list">
      <div class="detail-modality-row">
        <dt>Input / output</dt>
        <dd class="detail-modality-route">
          <span class="modality-set">
            {#each model.inputModalities as modality (`input-${modality}`)}
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
            {#each model.outputModalities as modality (`output-${modality}`)}
              {@const ModalityIcon = modalityIcon(modality)}
              <span class="modality-icon modality-output" role="img" aria-label={`${modalityLabel(modality)} output`} title={`${modalityLabel(modality)} output`}>
                <ModalityIcon size={15} aria-hidden="true" />
              </span>
            {:else}
              <span class="modality-icon" role="img" aria-label="Output modalities not published" title="Output modalities not published"><CircleQuestionMark size={15} aria-hidden="true" /></span>
            {/each}
          </span>
        </dd>
      </div>
      <div><dt>Context window</dt><dd>{formatTokenCount(model.contextLength)}</dd></div>
    </dl>
  </section>

  <section class="detail-section">
    <div class="section-heading compact"><div><span class="section-kicker">CAPABILITY</span><h3>Artificial Analysis via OpenRouter</h3></div></div>
    <dl class="detail-list">
      <div><dt>AA Index</dt><dd>{model.intelligence ?? "Not available"}</dd></div>
      <div><dt>Coding index</dt><dd>{model.coding ?? "-"}</dd></div>
      <div><dt>Agentic index</dt><dd>{model.agentic ?? "-"}</dd></div>
    </dl>
  </section>

  <div class="detail-links">
    <a href={`https://openrouter.ai/${model.id}`} target="_blank" rel="noreferrer">Open in OpenRouter <ExternalLink size={14} /></a>
  </div>
</dialog>
