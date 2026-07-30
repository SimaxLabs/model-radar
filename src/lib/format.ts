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

export const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 0,
});

export function formatPrice(value: number) {
  return value < 0.01 ? preciseMoney.format(value) : money.format(value);
}

export function providerName(provider: string) {
  const normalizedProvider = provider.replace(/^~/, "");
  const labels: Record<string, string> = {
    alibaba: "Alibaba",
    amazon: "Amazon",
    anthropic: "Anthropic",
    baidu: "Baidu",
    bytedance: "ByteDance",
    "bytedance-seed": "ByteDance",
    cohere: "Cohere",
    deepseek: "DeepSeek",
    google: "Google",
    "meta-llama": "Meta",
    meta: "Meta",
    microsoft: "Microsoft",
    minimax: "MiniMax",
    mistralai: "Mistral",
    moonshotai: "Moonshot AI",
    nvidia: "NVIDIA",
    openai: "OpenAI",
    openrouter: "OpenRouter",
    perplexity: "Perplexity",
    qwen: "Qwen",
    tencent: "Tencent",
    "x-ai": "xAI",
    xiaomi: "Xiaomi",
    "z-ai": "Z.AI",
  };
  return (
    labels[normalizedProvider] ??
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
  if (value === null || Math.abs(value) < 0.001) return "No prior snapshot";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}
