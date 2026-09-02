export const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const preciseMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const unitMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
});
const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  bytedance: "ByteDance",
  "bytedance-seed": "ByteDance",
  deepseek: "DeepSeek",
  "meta-llama": "Meta",
  minimax: "MiniMax",
  mistralai: "Mistral",
  moonshotai: "Moonshot AI",
  nvidia: "NVIDIA",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  "x-ai": "xAI",
  "z-ai": "Z.AI",
};

export const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatTokenCount(value: number) {
  return compactNumber.format(value);
}

export function formatPrice(value: number) {
  return value < 0.01 ? preciseMoney.format(value) : money.format(value);
}

export function formatUnitPrice(value: number) {
  return unitMoney.format(value);
}

export function displayModelName(name: string) {
  return name.match(/^[^:]+:\s*(.+)$/)?.[1] ?? name;
}

export function displayModalityName(modality: string) {
  return modality
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function providerName(provider: string) {
  const normalizedProvider = provider.replace(/^~/, "");
  return (
    PROVIDER_LABELS[normalizedProvider] ??
    normalizedProvider
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function formatSyncTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function formatChange(value: number | null) {
  if (value === null || Math.abs(value) < 0.001) return "No active change";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}
