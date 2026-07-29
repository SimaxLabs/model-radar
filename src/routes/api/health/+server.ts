import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () =>
  json(
    {
      status: "ok",
      uptime: Math.floor(process.uptime()),
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
