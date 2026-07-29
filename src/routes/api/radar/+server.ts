import { getRadarData } from "$lib/server/radar";
import { consumeRateLimit } from "$lib/server/rate-limit";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ getClientAddress, setHeaders }) => {
  const rateLimit = consumeRateLimit(`radar:${getClientAddress()}`, 30, 60_000);
  if (!rateLimit.allowed) {
    setHeaders({ "Retry-After": String(rateLimit.retryAfter) });
    return json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const data = await getRadarData();
    return json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Radar refresh failed", error);
    return json({ error: "Unable to refresh model data" }, { status: 502 });
  }
};
