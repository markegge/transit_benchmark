import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList,
  ReferenceLine,
  Customized,
  usePlotArea,
  useYAxisDomain,
} from 'recharts';
import type { Agency, AgencyYearly, AgencyModeYearly, Metadata } from '../types';
import { formatNumber, formatCurrency, formatPercent } from '../data';
import './ExploreStep.css';

interface Props {
  homeAgency: Agency;
  peerAgencies: Agency[];
  allAgencies: Agency[];
  agencyYearly: AgencyYearly[];
  agencyModeYearly: AgencyModeYearly[];
  metadata: Metadata;
  onBack: () => void;
  onStartOver: () => void;
  onPeersChange: (peers: Agency[]) => void;
}

type MetricKey =
  | 'ridership'
  | 'expenses'
  | 'fare_revenue'
  | 'vehicle_hours'
  | 'vehicle_miles'
  | 'cost_per_trip'
  | 'farebox_recovery'
  | 'rides_per_capita'
  | 'vrm_per_capita'
  | 'vrh_per_capita'
  | 'pmt_per_vrm'
  | 'pmt_per_vrh'
  | 'pmt_per_capita';

/**
 * End-of-line labels rendered inside a <Customized> slot. Uses Recharts v3's
 * useXAxis / useYAxis hooks to read the live scales so we can place each
 * label precisely past the last data point, then runs a one-pass downward
 * sweep to enforce a minimum vertical gap between labels (anti-collision).
 */
function EndOfLineLabels(props: {
  trendData: Array<Record<string, number | string>>;
  agencies: Agency[];
  homeNtdId: number;
  agencyColorMap: Map<number, string>;
  getDisplayName: (a: Agency) => string;
  truncateName: (name: string, maxLen?: number) => string;
}) {
  const { trendData, agencies, homeNtdId, agencyColorMap, getDisplayName, truncateName } = props;
  const plotArea = usePlotArea();
  const yDomain = useYAxisDomain(0);
  if (!plotArea || !yDomain || trendData.length === 0) return null;

  // yDomain comes from Recharts as [min, max] (numbers for a linear axis).
  // Guard against the categorical / string-array variant just in case.
  const yMin = typeof yDomain[0] === 'number' ? yDomain[0] : Number(yDomain[0]);
  const yMax = typeof yDomain[1] === 'number' ? yDomain[1] : Number(yDomain[1]);
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax === yMin) return null;

  const plotTop = plotArea.y;
  const plotBottom = plotArea.y + plotArea.height;
  const plotRight = plotArea.x + plotArea.width;

  // Map data value → SVG y pixel (SVG y grows downward, so invert).
  const valueToY = (v: number) =>
    plotBottom - ((v - yMin) / (yMax - yMin)) * (plotBottom - plotTop);

  const lastRow = trendData[trendData.length - 1];

  type EndLabel = {
    ntdId: number;
    name: string;
    y: number;
    color: string;
    isHome: boolean;
  };
  const labels: EndLabel[] = [];
  for (const agency of agencies) {
    const name = getDisplayName(agency);
    const raw = (lastRow as Record<string, unknown>)[name];
    if (raw === undefined || raw === null) continue;
    const numericValue = Number(raw);
    if (!Number.isFinite(numericValue)) continue;
    const y = valueToY(numericValue);
    if (!Number.isFinite(y)) continue;
    labels.push({
      ntdId: agency.ntd_id,
      name,
      y,
      color: agencyColorMap.get(agency.ntd_id) || '#888',
      isHome: agency.ntd_id === homeNtdId,
    });
  }

  labels.sort((a, b) => a.y - b.y);
  const MIN_GAP = 14;
  for (let i = 1; i < labels.length; i++) {
    const gap = labels[i].y - labels[i - 1].y;
    if (gap < MIN_GAP) labels[i].y = labels[i - 1].y + MIN_GAP;
  }

  return (
    <g pointerEvents="none">
      {labels.map((l) => (
        <text
          key={l.ntdId}
          x={plotRight + 8}
          y={l.y}
          fill={l.color}
          fontSize={11}
          textAnchor="start"
          dominantBaseline="middle"
          fontWeight={l.isHome ? 700 : 500}
        >
          {truncateName(l.name, 18)}
        </text>
      ))}
    </g>
  );
}

const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'ridership', label: 'Ridership' },
  { key: 'expenses', label: 'Operating Expenses' },
  { key: 'fare_revenue', label: 'Fare Revenue' },
  { key: 'vehicle_hours', label: 'Vehicle Rev. Hours' },
  { key: 'vehicle_miles', label: 'Vehicle Rev. Miles' },
  { key: 'cost_per_trip', label: 'Cost per Trip' },
  { key: 'farebox_recovery', label: 'Farebox Recovery' },
  { key: 'rides_per_capita', label: 'Rides per Capita' },
  { key: 'vrm_per_capita', label: 'VRM per Capita' },
  { key: 'vrh_per_capita', label: 'VRH per Capita' },
  { key: 'pmt_per_vrm', label: 'PMT per VRM' },
  { key: 'pmt_per_vrh', label: 'PMT per VRH' },
  { key: 'pmt_per_capita', label: 'PMT per Capita' },
];

// STIC incentive thresholds (FY 2025) — applies to small UZAs (50k–199,999 population)
// Source: FTA Section 5307 STIC formula, FY 2025 apportionment
const STIC_THRESHOLDS: Partial<Record<MetricKey, number>> = {
  pmt_per_vrm:    4.358,   // Factor 1: PMT / Vehicle Revenue Mile
  pmt_per_vrh:    73.552,  // Factor 2: PMT / Vehicle Revenue Hour
  vrm_per_capita: 10.196,  // Factor 3: Vehicle Revenue Miles / Capita
  vrh_per_capita: 0.641,   // Factor 4: Vehicle Revenue Hours / Capita
  pmt_per_capita: 50.268,  // Factor 5: Passenger Miles / Capita
  rides_per_capita: 8.017, // Factor 6: Unlinked Passenger Trips / Capita
};

const STIC_FACTOR_LABELS: Partial<Record<MetricKey, string>> = {
  pmt_per_vrm:    'STIC Factor 1',
  pmt_per_vrh:    'STIC Factor 2',
  vrm_per_capita: 'STIC Factor 3',
  vrh_per_capita: 'STIC Factor 4',
  pmt_per_capita: 'STIC Factor 5',
  rides_per_capita: 'STIC Factor 6',
};

// Small UZA = 50,000–199,999 population (STIC-eligible range)
function isSmallUza(population: number | null): boolean {
  return population !== null && population >= 50_000 && population <= 199_999;
}

const COLORS = [
  '#dc2626', // Home agency - red (stands out)
  '#3b82f6', '#16a34a', '#9333ea', '#ea580c',
  '#0891b2', '#4f46e5', '#0d9488', '#d946ef', '#84cc16',
  '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f97316', '#6366f1', '#10b981', '#f43f5e', '#a855f7',
];

function getYearlyValue(record: AgencyYearly, metric: MetricKey): number {
  const pmt = record.passenger_miles ?? 0;
  const pop = record.primary_uza_population ?? 0;
  switch (metric) {
    case 'ridership':
      return record.unlinked_passenger_trips;
    case 'expenses':
      return record.total_operating_expenses;
    case 'fare_revenue':
      return record.fare_revenues_earned;
    case 'vehicle_hours':
      return record.vehicle_revenue_hours;
    case 'vehicle_miles':
      return record.vehicle_revenue_miles;
    case 'cost_per_trip':
      return record.unlinked_passenger_trips > 0
        ? record.total_operating_expenses / record.unlinked_passenger_trips
        : 0;
    case 'farebox_recovery':
      return record.total_operating_expenses > 0
        ? (record.fare_revenues_earned / record.total_operating_expenses) * 100
        : 0;
    case 'rides_per_capita':
      return record.rides_per_capita ?? 0;
    case 'vrm_per_capita':
      return pop > 0 ? record.vehicle_revenue_miles / pop : 0;
    case 'vrh_per_capita':
      return pop > 0 ? record.vehicle_revenue_hours / pop : 0;
    case 'pmt_per_vrm':
      return pmt > 0 && record.vehicle_revenue_miles > 0
        ? pmt / record.vehicle_revenue_miles
        : 0;
    case 'pmt_per_vrh':
      return pmt > 0 && record.vehicle_revenue_hours > 0
        ? pmt / record.vehicle_revenue_hours
        : 0;
    case 'pmt_per_capita':
      return pmt > 0 && pop > 0 ? pmt / pop : 0;
  }
}

function formatMetricValue(value: number, metric: MetricKey): string {
  switch (metric) {
    case 'expenses':
    case 'fare_revenue':
    case 'cost_per_trip':
      return formatCurrency(value);
    case 'farebox_recovery':
      return `${value.toFixed(1)}%`;
    case 'rides_per_capita':
    case 'vrm_per_capita':
    case 'vrh_per_capita':
    case 'pmt_per_vrm':
    case 'pmt_per_vrh':
    case 'pmt_per_capita':
      return value.toFixed(3);
    default:
      return formatNumber(value);
  }
}

export function ExploreStep({
  homeAgency,
  peerAgencies,
  allAgencies: allAgenciesPool,
  agencyYearly,
  agencyModeYearly,
  metadata,
  onBack,
  onStartOver,
  onPeersChange,
}: Props) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('ridership');
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const [selectedModes, setSelectedModes] = useState<string[]>([]);
  const [showSticThresholds, setShowSticThresholds] = useState(false);
  const [showSticInfo, setShowSticInfo] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showPeerPanel, setShowPeerPanel] = useState(false);
  const [labelMode, setLabelMode] = useState<'legend' | 'chart'>('legend');
  const [displayNames, setDisplayNames] = useState<Map<number, string>>(new Map());
  const [peerSearch, setPeerSearch] = useState('');

  const getDisplayName = (agency: Agency) => displayNames.get(agency.ntd_id) || agency.agency;

  const removePeer = (ntdId: number) => {
    onPeersChange(peerAgencies.filter((p) => p.ntd_id !== ntdId));
  };

  const addPeer = (agency: Agency) => {
    if (peerAgencies.length >= 19) return;
    if (peerAgencies.some((p) => p.ntd_id === agency.ntd_id)) return;
    onPeersChange([...peerAgencies, agency]);
    setPeerSearch('');
  };

  const renamePeer = (ntdId: number, name: string) => {
    setDisplayNames((prev) => {
      const next = new Map(prev);
      if (name.trim()) next.set(ntdId, name.trim());
      else next.delete(ntdId);
      return next;
    });
  };

  const addableAgencies = useMemo(() => {
    if (!peerSearch) return [];
    const currentIds = new Set([homeAgency.ntd_id, ...peerAgencies.map((p) => p.ntd_id)]);
    const query = peerSearch.toLowerCase();
    return allAgenciesPool
      .filter((a) => !currentIds.has(a.ntd_id) && (
        a.agency.toLowerCase().includes(query) ||
        a.city.toLowerCase().includes(query) ||
        a.state.toLowerCase().includes(query)
      ))
      .slice(0, 20);
  }, [peerSearch, allAgenciesPool, homeAgency, peerAgencies]);

  // All agencies = home + peers
  const allAgencies = useMemo(
    () => [homeAgency, ...peerAgencies],
    [homeAgency, peerAgencies]
  );

  const agencyIds = useMemo(
    () => new Set(allAgencies.map((a) => a.ntd_id)),
    [allAgencies]
  );

  // Modes available across selected agencies
  const availableModes = useMemo(() => {
    const modeSet = new Set<string>();
    allAgencies.forEach((a) => a.modes.forEach((m) => modeSet.add(m)));
    return Array.from(modeSet).sort((a, b) => {
      const nameA = metadata.mode_names[a] || a;
      const nameB = metadata.mode_names[b] || b;
      return nameA.localeCompare(nameB);
    });
  }, [allAgencies, metadata.mode_names]);

  const toggleMode = (mode: string) => {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  };

  // Filter yearly data for selected agencies, aggregating by mode if needed
  const filteredYearly = useMemo(() => {
    if (selectedModes.length === 0) {
      // No mode filter - use aggregate agency yearly data
      return agencyYearly.filter((ay) => agencyIds.has(ay.ntd_id));
    }

    // Filter mode-yearly data and aggregate across selected modes per agency/year
    const modeData = agencyModeYearly.filter(
      (amy) => agencyIds.has(amy.ntd_id) && selectedModes.includes(amy.mode)
    );

    // Group by ntd_id + year and sum
    const grouped = new Map<string, AgencyYearly>();
    for (const row of modeData) {
      const key = `${row.ntd_id}-${row.report_year}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.unlinked_passenger_trips += row.unlinked_passenger_trips;
        existing.total_operating_expenses += row.total_operating_expenses;
        existing.fare_revenues_earned += row.fare_revenues_earned;
        existing.vehicle_revenue_hours += row.vehicle_revenue_hours;
        existing.vehicle_revenue_miles += row.vehicle_revenue_miles;
        existing.passenger_miles = (existing.passenger_miles ?? 0) + (row.passenger_miles ?? 0);
      } else {
        // Find population from the full yearly data for rides_per_capita
        const fullRecord = agencyYearly.find(
          (ay) => ay.ntd_id === row.ntd_id && ay.report_year === row.report_year
        );
        grouped.set(key, {
          ntd_id: row.ntd_id,
          report_year: row.report_year,
          agency: row.agency,
          unlinked_passenger_trips: row.unlinked_passenger_trips,
          total_operating_expenses: row.total_operating_expenses,
          fare_revenues_earned: row.fare_revenues_earned,
          vehicle_revenue_hours: row.vehicle_revenue_hours,
          vehicle_revenue_miles: row.vehicle_revenue_miles,
          passenger_miles: row.passenger_miles ?? null,
          agency_voms: null,
          primary_uza_population: fullRecord?.primary_uza_population ?? null,
          rides_per_capita: null, // will be calculated below
        });
      }
    }

    // Calculate rides_per_capita for aggregated records
    for (const record of grouped.values()) {
      if (record.primary_uza_population && record.primary_uza_population > 0) {
        record.rides_per_capita = Math.round(
          (record.unlinked_passenger_trips / record.primary_uza_population) * 100
        ) / 100;
      }
    }

    return Array.from(grouped.values());
  }, [agencyYearly, agencyModeYearly, agencyIds, selectedModes]);

  // Trend chart data - pivot by year, using display names as keys
  const trendData = useMemo(() => {
    const years = metadata.years;
    return years.map((year) => {
      const yearData: Record<string, number | string> = { year };
      allAgencies.forEach((agency) => {
        const record = filteredYearly.find(
          (fy) => fy.ntd_id === agency.ntd_id && fy.report_year === year
        );
        if (record) {
          yearData[getDisplayName(agency)] = getYearlyValue(record, selectedMetric);
        }
      });
      return yearData;
    });
  }, [allAgencies, filteredYearly, selectedMetric, metadata.years, displayNames]);

  // Generate CSV data for download
  const generateCSV = () => {
    const headers = ['Year', ...allAgencies.map((a) => getDisplayName(a))];
    const rows = trendData.map((row) => {
      return [
        row.year,
        ...allAgencies.map((a) => row[getDisplayName(a)] ?? ''),
      ].join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  };

  const handleDownload = () => {
    const csv = generateCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ntd_${selectedMetric}_${metadata.years[0]}-${metadata.years[metadata.years.length - 1]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const truncateName = (name: string, maxLen = 35) =>
    name.length > maxLen ? name.slice(0, maxLen) + '...' : name;

  // Build a lookup from display name to agency object for legend tooltips
  const agencyByName = useMemo(() => {
    const map = new Map<string, Agency>();
    allAgencies.forEach((a) => map.set(getDisplayName(a), a));
    return map;
  }, [allAgencies, displayNames]);

  // Consistent color map: ntd_id → color, matching trend chart index order
  const agencyColorMap = useMemo(() => {
    const map = new Map<number, string>();
    allAgencies.forEach((a, i) => map.set(a.ntd_id, COLORS[i % COLORS.length]));
    return map;
  }, [allAgencies]);

  // Custom legend formatter that bolds the home agency and adds hover tooltip
  const renderLegendText = (value: string) => {
    const isHome = value === getDisplayName(homeAgency);
    const displayName = truncateName(value);
    const agency = agencyByName.get(value);
    const tooltip = agency
      ? `${agency.agency}\n${agency.city}, ${agency.state}${agency.uza_name ? `\nUZA: ${agency.uza_name}` : ''}${agency.primary_uza_population ? `\nPopulation: ${agency.primary_uza_population.toLocaleString()}` : ''}`
      : value;
    return (
      <span title={tooltip} style={{ cursor: 'default' }}>
        {isHome ? <strong>{displayName}</strong> : displayName}
      </span>
    );
  };

  const metricLabel = METRICS.find((m) => m.key === selectedMetric)?.label || selectedMetric;

  const sticThreshold = STIC_THRESHOLDS[selectedMetric];
  const sticEligible = isSmallUza(homeAgency.primary_uza_population);
  const sticLineActive = showSticThresholds && sticEligible && sticThreshold !== undefined;

  // Check if home agency has any PMT data (some agencies don't report to NTD)
  const homeHasPmtData = useMemo(() => {
    const pmtMetrics: MetricKey[] = ['pmt_per_vrm', 'pmt_per_vrh', 'pmt_per_capita'];
    if (!pmtMetrics.includes(selectedMetric)) return true;
    const homeRecords = agencyYearly.filter((ay) => ay.ntd_id === homeAgency.ntd_id);
    return homeRecords.some((r) => (r.passenger_miles ?? 0) > 0);
  }, [selectedMetric, agencyYearly, homeAgency.ntd_id]);

  return (
    <div className="explore-step">
      <div className="explore-header">
        <div className="explore-header-buttons">
          <button className="back-button" onClick={onBack}>
            ← Back to Peer Selection
          </button>
          <button className="start-over-button" onClick={onStartOver}>
            Start Over
          </button>
        </div>
        <div className="explore-header-title">
          <h2>Performance Comparison</h2>
          <p className="agency-list-summary">
            <strong>{homeAgency.agency}</strong>
            {peerAgencies.length > 0 && ` vs ${peerAgencies.length} peer${peerAgencies.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="header-buttons-right">
          <button
            className={`peers-toggle-button${showPeerPanel ? ' active' : ''}`}
            onClick={() => setShowPeerPanel((v) => !v)}
          >
            Peers ({peerAgencies.length})
          </button>
          <button
            className="share-button"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href).then(() => {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              });
            }}
            title="Copy shareable link to clipboard"
          >
            {linkCopied ? '✓ Link copied!' : '⎘ Share'}
          </button>
          <button className="download-button" onClick={handleDownload}>
            Download CSV
          </button>
        </div>
      </div>

      {/* Peer management panel */}
      {showPeerPanel && (
        <div className="peer-management-panel">
          <div className="peer-mgmt-header">
            <h3>Manage Peers</h3>
            <div className="peer-add-search">
              <input
                type="text"
                placeholder="Search to add a peer..."
                value={peerSearch}
                onChange={(e) => setPeerSearch(e.target.value)}
              />
              {addableAgencies.length > 0 && (
                <div className="peer-add-dropdown">
                  {addableAgencies.map((a) => (
                    <div key={a.ntd_id} className="peer-add-item" onClick={() => addPeer(a)}>
                      <span className="peer-add-name">{a.agency}</span>
                      <span className="peer-add-loc">{a.city}, {a.state}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="peer-mgmt-list">
            {/* Home agency (not removable) */}
            <div className="peer-mgmt-item home">
              <span className="peer-color" style={{ background: agencyColorMap.get(homeAgency.ntd_id) }} />
              <span className="peer-name-display">{getDisplayName(homeAgency)} (home)</span>
            </div>
            {peerAgencies.map((peer) => (
              <div key={peer.ntd_id} className="peer-mgmt-item">
                <span className="peer-color" style={{ background: agencyColorMap.get(peer.ntd_id) }} />
                <input
                  className="peer-rename-input"
                  value={displayNames.get(peer.ntd_id) ?? peer.agency}
                  onChange={(e) => renamePeer(peer.ntd_id, e.target.value)}
                  title={peer.agency}
                />
                <span className="peer-loc">{peer.city}, {peer.state}</span>
                <button className="peer-remove" onClick={() => removePeer(peer.ntd_id)} title="Remove peer">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="metric-selector">
        <span>Performance Measure:</span>
        {METRICS.map(({ key, label }) => (
          <button
            key={key}
            className={selectedMetric === key ? 'active' : ''}
            onClick={() => setSelectedMetric(key)}
          >
            {label}
          </button>
        ))}
        {sticEligible && (
          <div className="stic-toggle-group">
            <button
              className={`stic-toggle${showSticThresholds ? ' stic-toggle-active' : ''}`}
              onClick={() => setShowSticThresholds((v) => !v)}
              title="Show STIC incentive threshold on the chart (applies to small UZA agencies, 50k–199k population)"
            >
              {showSticThresholds ? '★ STIC thresholds on' : '☆ Show STIC thresholds'}
            </button>
            <button
              className="stic-info-button"
              onClick={() => setShowSticInfo(true)}
              title="About STIC incentives"
              aria-label="About STIC incentives"
            >
              ℹ
            </button>
          </div>
        )}
      </div>

      <div className="mode-selector">
        <span>Transit Modes:</span>
        <button
          className={selectedModes.length === 0 ? 'active' : ''}
          onClick={() => setSelectedModes([])}
        >
          All Modes
        </button>
        {availableModes.map((mode) => (
          <button
            key={mode}
            className={selectedModes.includes(mode) ? 'active' : ''}
            onClick={() => toggleMode(mode)}
          >
            {metadata.mode_names[mode] || mode}
          </button>
        ))}
      </div>

      <div className="charts-grid">
        {/* Trend Line Chart - Main visualization */}
        <div className="chart-card chart-card-full">
          <div className="chart-header-with-actions">
            <h3>{metricLabel} Over Time</h3>
            <div className="label-toggle-segmented" role="group" aria-label="Label display mode">
              <button
                className={labelMode === 'legend' ? 'active' : ''}
                onClick={() => setLabelMode('legend')}
                aria-pressed={labelMode === 'legend'}
              >
                Legend
              </button>
              <button
                className={labelMode === 'chart' ? 'active' : ''}
                onClick={() => setLabelMode('chart')}
                aria-pressed={labelMode === 'chart'}
              >
                Labels on chart
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={sticLineActive ? 583 : 563}>
            <LineChart
              data={trendData}
              margin={{ top: 20, right: labelMode === 'chart' ? 140 : 30, left: 20, bottom: 60 }}
              onMouseMove={(state: { activeLabel?: string | number }) => {
                if (state?.activeLabel) {
                  setHoveredYear(Number(state.activeLabel));
                }
              }}
              onMouseLeave={() => setHoveredYear(null)}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis
                tickFormatter={(val) => formatMetricValue(val, selectedMetric)}
                domain={
                  sticLineActive && sticThreshold !== undefined
                    ? [0, (dataMax: number) => Math.max(dataMax, sticThreshold) * 1.1]
                    : [0, 'auto']
                }
              />
              {labelMode === 'legend' && (
                <Legend formatter={renderLegendText} wrapperStyle={{ paddingTop: 20 }} />
              )}
              {allAgencies.map((agency) => {
                const isHome = agency.ntd_id === homeAgency.ntd_id;
                const color = agencyColorMap.get(agency.ntd_id)!;
                const name = getDisplayName(agency);
                return (
                  <Line
                    key={agency.ntd_id}
                    type="monotone"
                    dataKey={name}
                    stroke={color}
                    strokeWidth={isHome ? 4 : 2}
                    dot={{ r: isHome ? 5 : 3, fill: color, strokeWidth: 0 }}
                    activeDot={{ r: isHome ? 8 : 5, fill: color, strokeWidth: 0 }}
                  >
                    <LabelList
                      dataKey={name}
                      position="top"
                      content={({ x, y, value, index: pointIndex }) => {
                        // Hover-only value label (both modes)
                        const year = trendData[pointIndex as number]?.year;
                        if (year !== hoveredYear || value === undefined) return null;
                        return (
                          <text
                            x={x}
                            y={(y as number) - 10}
                            fill={color}
                            fontSize={10}
                            textAnchor="middle"
                          >
                            {formatMetricValue(Number(value), selectedMetric)}
                          </text>
                        );
                      }}
                    />
                  </Line>
                );
              })}
              {/* End-of-line labels with anti-collision. Rendered in a single
                  pass so we can space overlapping labels apart, and so they
                  can extend past the plot area (the LineChart's right margin
                  above is widened in chart mode to make room). */}
              {labelMode === 'chart' && (
                <Customized
                  component={
                    <EndOfLineLabels
                      trendData={trendData}
                      agencies={allAgencies}
                      homeNtdId={homeAgency.ntd_id}
                      agencyColorMap={agencyColorMap}
                      getDisplayName={getDisplayName}
                      truncateName={truncateName}
                    />
                  }
                />
              )}
              {sticLineActive && sticThreshold !== undefined && (
                <ReferenceLine
                  y={sticThreshold}
                  stroke="#E8734A"
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  label={{
                    value: `${STIC_FACTOR_LABELS[selectedMetric]} threshold: ${formatMetricValue(sticThreshold, selectedMetric)} (FY 2025)`,
                    position: 'insideTopRight',
                    fill: '#E8734A',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          {sticLineActive && (
            <p className="stic-footnote">
              * STIC threshold shown is the FY 2025 value ({STIC_FACTOR_LABELS[selectedMetric]}: {formatMetricValue(sticThreshold!, selectedMetric)}).
              Thresholds are recalculated annually by the FTA based on the national average for mid-size UZAs (200,000–999,999 population).
              STIC incentives apply to small UZAs (50,000–199,999 population) that meet or exceed these thresholds.
              {!homeHasPmtData && ' Note: this agency does not report Passenger Miles Traveled (PMT) to the NTD, so values shown are zero.'}
            </p>
          )}
        </div>

        {/* Latest Year Comparison Bar Chart */}
        <div className="chart-card">
          <h3>{metricLabel} ({metadata.latest_year})</h3>
          <ResponsiveContainer width="100%" height={Math.max(300, allAgencies.length * 36)}>
            <BarChart
              data={allAgencies
                .map((agency) => {
                  const record = filteredYearly.find(
                    (fy) => fy.ntd_id === agency.ntd_id && fy.report_year === metadata.latest_year
                  );
                  return {
                    name: truncateName(agency.agency, 32),
                    fullName: agency.agency,
                    value: record ? getYearlyValue(record, selectedMetric) : 0,
                    isHome: agency.ntd_id === homeAgency.ntd_id,
                    ntd_id: agency.ntd_id,
                  };
                })
                .sort((a, b) => b.value - a.value)}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(val) => formatMetricValue(val, selectedMetric)} />
              <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [formatMetricValue(Number(value), selectedMetric), metricLabel]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {allAgencies
                  .map((agency) => {
                    const record = filteredYearly.find(
                      (fy) => fy.ntd_id === agency.ntd_id && fy.report_year === metadata.latest_year
                    );
                    return {
                      ntd_id: agency.ntd_id,
                      value: record ? getYearlyValue(record, selectedMetric) : 0,
                    };
                  })
                  .sort((a, b) => b.value - a.value)
                  .map((item) => (
                    <Cell
                      key={item.ntd_id}
                      fill={agencyColorMap.get(item.ntd_id)!}
                    />
                  ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Summary Table */}
        <div className="chart-card">
          <h3>Agency Summary ({metadata.latest_year}){selectedModes.length > 0 && ` — ${selectedModes.map((m) => metadata.mode_names[m] || m).join(', ')}`}</h3>
          <div className="summary-table-container">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Agency</th>
                  <th>Ridership</th>
                  <th>Expenses</th>
                  <th>Cost/Trip</th>
                  <th>Farebox</th>
                  <th>Rides/Cap</th>
                </tr>
              </thead>
              <tbody>
                {allAgencies.map((agency) => {
                  const record = filteredYearly.find(
                    (fy) => fy.ntd_id === agency.ntd_id && fy.report_year === metadata.latest_year
                  );
                  const trips = record?.unlinked_passenger_trips ?? 0;
                  const expenses = record?.total_operating_expenses ?? 0;
                  const fare = record?.fare_revenues_earned ?? 0;
                  const costPerTrip = trips > 0 ? expenses / trips : null;
                  const fareboxRecovery = expenses > 0 ? fare / expenses : null;
                  const ridesPerCapita = record?.rides_per_capita ?? null;
                  return (
                    <tr
                      key={agency.ntd_id}
                      className={agency.ntd_id === homeAgency.ntd_id ? 'home-row' : ''}
                    >
                      <td className="agency-name-cell">
                        {agency.ntd_id === homeAgency.ntd_id && <span className="home-badge">HOME</span>}
                        {agency.agency.length > 25 ? agency.agency.slice(0, 25) + '...' : agency.agency}
                      </td>
                      <td>{formatNumber(trips)}</td>
                      <td>{formatCurrency(expenses)}</td>
                      <td>{formatCurrency(costPerTrip)}</td>
                      <td>{formatPercent(fareboxRecovery)}</td>
                      <td>{ridesPerCapita?.toFixed(1) ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Transit Modes */}
        <div className="chart-card">
          <h3>Transit Modes</h3>
          <div className="modes-table-container">
            <table className="modes-table">
              <tbody>
                {allAgencies.map((agency) => (
                  <tr
                    key={agency.ntd_id}
                    className={agency.ntd_id === homeAgency.ntd_id ? 'home-row' : ''}
                  >
                    <td className="agency-name-cell">
                      {agency.ntd_id === homeAgency.ntd_id && <span className="home-badge">HOME</span>}
                      {agency.agency.length > 25 ? agency.agency.slice(0, 25) + '...' : agency.agency}
                    </td>
                    <td className="modes-cell">
                      {agency.modes.map((mode) => (
                        <span key={mode} className="mode-chip" title={metadata.mode_names[mode] || mode}>
                          {metadata.mode_names[mode] || mode}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showSticInfo && (
        <div className="stic-modal-overlay" onClick={() => setShowSticInfo(false)}>
          <div className="stic-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stic-modal-header">
              <h3>About STIC Incentives</h3>
              <button className="stic-modal-close" onClick={() => setShowSticInfo(false)} aria-label="Close">×</button>
            </div>
            <div className="stic-modal-body">
              <p>
                The <strong>Small Transit Intensive Cities (STIC)</strong> program is a federal incentive under FTA Section 5307 that rewards small urbanized areas (50,000–199,999 population) for providing high-quality transit service. Agencies in qualifying UZAs that meet or exceed performance thresholds earn a share of additional apportionment funds beyond their base formula allocation.
              </p>
              <p>
                Eligibility is determined by comparing an agency's performance against the national average for mid-size UZAs (200,000–999,999 population) on six metrics: <strong>Passenger Miles per Vehicle Revenue Mile</strong>, <strong>Passenger Miles per Vehicle Revenue Hour</strong>, <strong>Vehicle Revenue Miles per Capita</strong>, <strong>Vehicle Revenue Hours per Capita</strong>, <strong>Passenger Miles per Capita</strong>, and <strong>Unlinked Passenger Trips per Capita</strong>. An agency qualifies for each factor on which it meets or exceeds the threshold, and additional funding is apportioned based on the number of factors met.
              </p>
              <p>
                Thresholds are recalculated each fiscal year. The values shown here are the <strong>FY 2025</strong> thresholds. Note that some agencies do not report Passenger Miles Traveled (PMT) to the NTD, which affects eligibility for the three PMT-based factors.
              </p>
              <p className="stic-modal-link">
                <a
                  href="https://www.transit.dot.gov/funding/apportionments/small-transit-intensive-cities-formula"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  FTA STIC Formula documentation →
                </a>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
