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
} from 'recharts';
import type { Agency, AgencyYearly, Metadata } from '../types';
import { formatNumber, formatCurrency, formatPercent } from '../data';
import './ExploreStep.css';

interface Props {
  homeAgency: Agency;
  peerAgencies: Agency[];
  agencyYearly: AgencyYearly[];
  metadata: Metadata;
  onBack: () => void;
  onStartOver: () => void;
}

type MetricKey =
  | 'ridership'
  | 'expenses'
  | 'fare_revenue'
  | 'vehicle_hours'
  | 'vehicle_miles'
  | 'cost_per_trip'
  | 'farebox_recovery'
  | 'rides_per_capita';

const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'ridership', label: 'Ridership' },
  { key: 'expenses', label: 'Operating Expenses' },
  { key: 'fare_revenue', label: 'Fare Revenue' },
  { key: 'vehicle_hours', label: 'Vehicle Revenue Hours' },
  { key: 'vehicle_miles', label: 'Vehicle Revenue Miles' },
  { key: 'cost_per_trip', label: 'Cost per Trip' },
  { key: 'farebox_recovery', label: 'Farebox Recovery' },
  { key: 'rides_per_capita', label: 'Rides per Capita' },
];

const COLORS = [
  '#dc2626', // Home agency - red (stands out)
  '#3b82f6', '#16a34a', '#9333ea', '#ea580c',
  '#0891b2', '#4f46e5', '#0d9488', '#d946ef', '#84cc16',
  '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f97316', '#6366f1', '#10b981', '#f43f5e', '#a855f7',
];

function getYearlyValue(record: AgencyYearly, metric: MetricKey): number {
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
      return value.toFixed(1);
    default:
      return formatNumber(value);
  }
}

export function ExploreStep({
  homeAgency,
  peerAgencies,
  agencyYearly,
  metadata,
  onBack,
  onStartOver,
}: Props) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('ridership');

  // All agencies = home + peers
  const allAgencies = useMemo(
    () => [homeAgency, ...peerAgencies],
    [homeAgency, peerAgencies]
  );

  const agencyIds = useMemo(
    () => new Set(allAgencies.map((a) => a.ntd_id)),
    [allAgencies]
  );

  // Filter yearly data for selected agencies
  const filteredYearly = useMemo(
    () => agencyYearly.filter((ay) => agencyIds.has(ay.ntd_id)),
    [agencyYearly, agencyIds]
  );

  // Trend chart data - pivot by year
  const trendData = useMemo(() => {
    const years = metadata.years;
    return years.map((year) => {
      const yearData: Record<string, number | string> = { year };
      allAgencies.forEach((agency) => {
        const record = filteredYearly.find(
          (fy) => fy.ntd_id === agency.ntd_id && fy.report_year === year
        );
        if (record) {
          yearData[agency.agency] = getYearlyValue(record, selectedMetric);
        }
      });
      return yearData;
    });
  }, [allAgencies, filteredYearly, selectedMetric, metadata.years]);

  // Generate CSV data for download
  const generateCSV = () => {
    const headers = ['Year', ...allAgencies.map((a) => a.agency)];
    const rows = trendData.map((row) => {
      return [
        row.year,
        ...allAgencies.map((a) => row[a.agency] ?? ''),
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

  // Custom legend formatter that bolds the home agency
  const renderLegendText = (value: string) => {
    const isHome = value === homeAgency.agency;
    const displayName = truncateName(value);
    return isHome ? <strong>{displayName}</strong> : displayName;
  };

  const metricLabel = METRICS.find((m) => m.key === selectedMetric)?.label || selectedMetric;

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
        <div>
          <h2>Performance Comparison</h2>
          <p className="agency-list-summary">
            <strong>{homeAgency.agency}</strong>
            {peerAgencies.length > 0 && ` vs ${peerAgencies.length} peer${peerAgencies.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

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
      </div>

      <div className="charts-grid">
        {/* Trend Line Chart - Main visualization */}
        <div className="chart-card chart-card-full">
          <div className="chart-header-with-actions">
            <h3>{metricLabel} Over Time</h3>
            <button className="download-button" onClick={handleDownload}>
              Download CSV
            </button>
          </div>
          <ResponsiveContainer width="100%" height={450}>
            <LineChart data={trendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={(val) => formatMetricValue(val, selectedMetric)} />
              <Tooltip
                formatter={(value, name) => [
                  formatMetricValue(Number(value), selectedMetric),
                  truncateName(String(name), 40),
                ]}
              />
              <Legend formatter={renderLegendText} />
              {allAgencies.map((agency, index) => {
                const isHome = agency.ntd_id === homeAgency.ntd_id;
                return (
                  <Line
                    key={agency.ntd_id}
                    type="monotone"
                    dataKey={agency.agency}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={isHome ? 4 : 2}
                    dot={{ r: isHome ? 5 : 3 }}
                    activeDot={{ r: isHome ? 8 : 5 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
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
                {allAgencies.map((agency, index) => (
                  <Cell
                    key={agency.ntd_id}
                    fill={agency.ntd_id === homeAgency.ntd_id ? '#dc2626' : COLORS[(index + 1) % COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Summary Table */}
        <div className="chart-card">
          <h3>Agency Summary ({metadata.latest_year})</h3>
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
                {allAgencies.map((agency) => (
                  <tr
                    key={agency.ntd_id}
                    className={agency.ntd_id === homeAgency.ntd_id ? 'home-row' : ''}
                  >
                    <td className="agency-name-cell">
                      {agency.ntd_id === homeAgency.ntd_id && <span className="home-badge">HOME</span>}
                      {agency.agency.length > 25 ? agency.agency.slice(0, 25) + '...' : agency.agency}
                    </td>
                    <td>{formatNumber(agency.unlinked_passenger_trips)}</td>
                    <td>{formatCurrency(agency.total_operating_expenses)}</td>
                    <td>{formatCurrency(agency.cost_per_trip)}</td>
                    <td>{formatPercent(agency.farebox_recovery)}</td>
                    <td>{agency.rides_per_capita?.toFixed(1) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
