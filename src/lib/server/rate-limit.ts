interface WindowEntry {
  count: number;
  resetsAt: number;
}

const windows = new Map<string, WindowEntry>();

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = windows.get(key);

  if (!current || current.resetsAt <= now) {
    windows.set(key, { count: 1, resetsAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((current.resetsAt - now) / 1000)),
    };
  }

  current.count += 1;
  if (windows.size > 5_000) {
    for (const [entryKey, entry] of windows) {
      if (entry.resetsAt <= now) windows.delete(entryKey);
    }
  }
  return { allowed: true, retryAfter: 0 };
}
