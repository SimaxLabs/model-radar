import { env } from "$env/dynamic/private";
import { getRadarData } from "$lib/server/radar";
import { consumeRateLimit } from "$lib/server/rate-limit";
import { json } from "@sveltejs/kit";
import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "./$types";

function isAuthorized(authorization: string | null, secret: string) {
  const actual = Buffer.from(authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const POST: RequestHandler = async ({ getClientAddress, request, setHeaders }) => {
  const rateLimit = consumeRateLimit(`sync:${getClientAddress()}`, 5, 60_000);
  if (!rateLimit.allowed) {
    setHeaders({ "Retry-After": String(rateLimit.retryAfter) });
    return json({ error: "Too many requests" }, { status: 429 });
  }

  const secret = env.CRON_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    return json({ error: "Sync endpoint is not configured" }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getRadarData(true);
    return json(
      {
        syncedAt: data.generatedAt,
        snapshotDate: data.snapshotDate,
        paidModels: data.summary.paidModels,
        rankedModels: data.summary.rankedModels,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Scheduled sync failed", error);
    return json({ error: "Sync failed" }, { status: 502 });
  }
};
