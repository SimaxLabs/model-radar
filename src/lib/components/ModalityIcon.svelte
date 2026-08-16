<script lang="ts">
  import {
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

  let { modality, size = 15 }: { modality: string; size?: number } = $props();

  let Icon = $derived.by(() => {
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
  });
</script>

<Icon {size} aria-hidden="true" />
