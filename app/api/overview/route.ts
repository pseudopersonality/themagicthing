import { getDataset, parseScenario } from "@/lib/source";
import { kpis, campaignMetrics, funnel, dailySeries, dataQuality, clampAsOf } from "@/lib/metrics";
import { insights } from "@/lib/insights";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const { ds, label, scenario } = await getDataset(parseScenario(u.searchParams.get("scenario")));
    const asOf = clampAsOf(ds, u.searchParams.get("asOf") || undefined);
    const campaign = u.searchParams.get("campaign") || undefined;
    return json({
      scenario, label, asOf, event: ds.event, targets: ds.targets,
      campaigns: ds.campaigns.map((c) => ({ campaign_id: c.campaign_id, campaign_name: c.campaign_name, channel: c.channel, owner_name: c.owner_name })),
      kpis: kpis(ds, asOf), campaignMetrics: campaignMetrics(ds, asOf).rows,
      funnel: funnel(ds, asOf, campaign), series: dailySeries(ds, asOf, campaign),
      quality: dataQuality(ds), insights: insights(ds, asOf),
    });
  } catch (e) { return bad(`Could not compute metrics: ${(e as Error).message}`, 500); }
}
