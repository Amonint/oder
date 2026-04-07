import { useParams, Navigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { FilterProvider, useFilter } from "@/context/FilterContext";
import {
  fetchPageInsights,
  fetchPagePlacements,
  fetchPageGeo,
  fetchPageActions,
  fetchPageTimeseries,
  type GeoInsightRow,
  type GeoMetadata,
} from "@/api/client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import KpiGrid from "@/components/KpiGrid";
import PlacementChart from "@/components/PlacementChart";
import ActionsChart from "@/components/ActionsChart";
import TimeseriesChart from "@/components/TimeseriesChart";
import GeoMap from "@/components/GeoMap";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { value: "last_7d", label: "Últimos 7 días" },
  { value: "last_14d", label: "Últimos 14 días" },
  { value: "last_30d", label: "Últimos 30 días" },
  { value: "last_90d", label: "Últimos 90 días" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Inner component — has access to FilterContext
// ─────────────────────────────────────────────────────────────────────────────

function DashboardContent({
  accountId,
  pageId,
}: {
  accountId: string;
  pageId: string;
}) {
  const { datePreset, campaignId, adsetId, adId, setFilter } = useFilter();

  // Local state for text inputs (updated on blur / Enter)
  const [campaignInput, setCampaignInput] = useState(campaignId ?? "");
  const [adsetInput, setAdsetInput] = useState(adsetId ?? "");
  const [adInput, setAdInput] = useState(adId ?? "");

  const filterOpts = { datePreset, campaignId, adsetId, adId };

  // Data queries
  const kpiQuery = useQuery({
    queryKey: ["page-insights", accountId, pageId, filterOpts],
    queryFn: () => fetchPageInsights(accountId, pageId, filterOpts),
  });

  const placementsQuery = useQuery({
    queryKey: ["page-placements", accountId, pageId, filterOpts],
    queryFn: () => fetchPagePlacements(accountId, pageId, filterOpts),
  });

  const geoQuery = useQuery({
    queryKey: ["page-geo", accountId, pageId, filterOpts],
    queryFn: () => fetchPageGeo(accountId, pageId, filterOpts),
  });

  const actionsQuery = useQuery({
    queryKey: ["page-actions", accountId, pageId, filterOpts],
    queryFn: () => fetchPageActions(accountId, pageId, filterOpts),
  });

  const timeseriesQuery = useQuery({
    queryKey: ["page-timeseries", accountId, pageId, filterOpts],
    queryFn: () => fetchPageTimeseries(accountId, pageId, filterOpts),
  });

  // Adapt PageGeoRow[] → GeoInsightRow[] + GeoMetadata for GeoMap
  const geoRows: GeoInsightRow[] = (geoQuery.data?.data ?? []).map((row) => ({
    region: row.region ?? "",
    region_name: row.region ?? "",
    impressions: parseInt(row.impressions ?? "0"),
    clicks: 0,
    spend: row.spend ?? "0",
    reach: parseInt(row.reach ?? "0"),
  }));

  const geoMetadata: GeoMetadata = {
    scope: "account",
    ad_id: null,
    total_rows: geoRows.length,
    complete_coverage: false,
    note: "",
  };

  // Text input helpers
  function commitCampaign() {
    const val = campaignInput.trim() || null;
    setFilter({ campaignId: val });
  }

  function commitAdset() {
    const val = adsetInput.trim() || null;
    setFilter({ adsetId: val });
  }

  function commitAd() {
    const val = adInput.trim() || null;
    setFilter({ adId: val });
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    commit: () => void
  ) {
    if (e.key === "Enter") commit();
  }

  return (
    <div className="w-full space-y-6 py-6 px-4 max-w-screen-xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/accounts" className="hover:underline text-foreground">
          Cuentas
        </Link>
        <span className="mx-1">›</span>
        <Link
          to={`/accounts/${encodeURIComponent(accountId)}/pages`}
          className="hover:underline text-foreground"
        >
          Páginas
        </Link>
        <span className="mx-1">›</span>
        <span className="text-foreground font-medium">{pageId}</span>
      </nav>

      {/* FilterBar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Periodo */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            Periodo
          </span>
          <Select
            value={datePreset}
            onValueChange={(v) => setFilter({ datePreset: v })}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Campaña */}
        <input
          type="text"
          value={campaignInput}
          placeholder="ID de campaña (opcional)"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 w-[220px]"
          onChange={(e) => setCampaignInput(e.target.value)}
          onBlur={commitCampaign}
          onKeyDown={(e) => handleKeyDown(e, commitCampaign)}
        />

        {/* Conjunto */}
        <input
          type="text"
          value={adsetInput}
          placeholder="ID de conjunto (opcional)"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 w-[220px]"
          onChange={(e) => setAdsetInput(e.target.value)}
          onBlur={commitAdset}
          onKeyDown={(e) => handleKeyDown(e, commitAdset)}
        />

        {/* Anuncio */}
        <input
          type="text"
          value={adInput}
          placeholder="ID de anuncio (opcional)"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 w-[220px]"
          onChange={(e) => setAdInput(e.target.value)}
          onBlur={commitAd}
          onKeyDown={(e) => handleKeyDown(e, commitAd)}
        />
      </div>

      {/* KpiGrid — full width */}
      <KpiGrid
        data={kpiQuery.data?.data}
        isLoading={kpiQuery.isLoading}
      />

      {/* PlacementChart + GeoMap — two columns on md+ */}
      <div className="grid gap-6 md:grid-cols-2">
        <PlacementChart
          data={placementsQuery.data?.data}
          isLoading={placementsQuery.isLoading}
        />
        {geoQuery.isLoading ? (
          <div className="h-64 rounded-xl bg-muted animate-pulse" />
        ) : (
          <GeoMap data={geoRows} metadata={geoMetadata} metric="impressions" />
        )}
      </div>

      {/* ActionsChart — full width */}
      <ActionsChart
        data={actionsQuery.data?.data}
        isLoading={actionsQuery.isLoading}
      />

      {/* TimeseriesChart — full width */}
      <TimeseriesChart
        data={timeseriesQuery.data?.data}
        isLoading={timeseriesQuery.isLoading}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell — reads route params and wraps with FilterProvider
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { accountId, pageId } = useParams<{
    accountId: string;
    pageId: string;
  }>();

  if (!accountId || !pageId) {
    return <Navigate to="/" replace />;
  }

  return (
    <FilterProvider>
      <DashboardContent accountId={accountId} pageId={pageId} />
    </FilterProvider>
  );
}
