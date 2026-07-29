import { getRadarData, unavailableRadarData } from "$lib/server/radar";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ setHeaders }) => {
  setHeaders({ "Cache-Control": "private, no-store" });
  try {
    return { radar: await getRadarData() };
  } catch (error) {
    console.error("Initial radar load failed", error);
    return { radar: unavailableRadarData() };
  }
};
