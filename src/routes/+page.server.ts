import { getArtificialAnalysisArticles } from "$lib/server/artificial-analysis";
import { getRadarData, unavailableRadarData } from "$lib/server/radar";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ setHeaders }) => {
  setHeaders({ "Cache-Control": "private, no-store" });
  const [radar, articles] = await Promise.all([
    getRadarData().catch((error) => {
      console.error("Initial radar load failed", error);
      return unavailableRadarData();
    }),
    getArtificialAnalysisArticles().catch((error) => {
      console.error("Artificial Analysis articles load failed", error);
      return [];
    }),
  ]);
  return { radar, articles };
};
