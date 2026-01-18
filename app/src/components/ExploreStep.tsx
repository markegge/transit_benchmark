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
  PieChart,
  Pie,
} from 'recharts';
import type { Agency, AgencyYearly, AgencyMode, Metadata } from '../types';
import { formatNumber, formatCurrency, formatPercent } from '../data';
import './ExploreStep.css';

interface Props {
  agencies: Agency[];
  agencyYearly: AgencyYearly[];
  agencyModes: AgencyMode[];
  metadata: Metadata;
  onBack: () => void;
}

type MetricKey = 'ridership' | 'expenses' | 'efficiency' | 'farebox';

const COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c',
  '#0891b2', '#4f46e5', '#0d9488', '#d946ef', '#84cc16',
  '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f97316', '#6366f1', '#10b981', '#f43f5e', '#a855f7',
];

export function ExploreStep({ agencies, agencyYearly, agencyModes, metadata, onBack }: Props) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('ridership');
  const [selectedAgencyId, setSelectedAgencyId] = useState<number | null>(
    agencies.length === 1 ? agencies[0].ntd_id : null
  );

  const agencyIds = useMemo(() => new Set(agencies.map((a) => a.ntd_id)), [agencies]);

  // Filter yearly data for selected agencies
  const filteredYearly = useMemo(
    () => agencyYearly.filter((ay) => agencyIds.has(ay.ntd_id)),
    [agencyYearly, agencyIds]
  );

  // Filter mode data for selected agencies
  const filteredModes = useMemo(
    () => agencyModes.filter((am) => agencyIds.has(am.ntd_id)),
    [agencyModes, agencyIds]
  );

  // Comparison bar chart data
  const comparisonData = useMemo(() => {
    return agencies.map((agency) => {
      let value: number;
      switch (selectedMetric) {
        case 'ridership':
          value = agency.unlinked_passenger_trips;
          break;
        case 'expenses':
          value = agency.total_operating_expenses;
          break;
        case 'efficiency':
          value = agency.trips_per_hour ?? 0;
          break;
        case 'farebox':
          value = (agency.farebox_recovery ?? 0) * 100;
          break;
      }
      return {
        name: agency.agency.length > 25 ? agency.agency.slice(0, 25) + '...' : agency.agency,
        fullName: agency.agency,
        value,
        ntd_id: agency.ntd_id,
      };
    }).sort((a, b) => b.value - a.value);
  }, [agencies, selectedMetric]);

  // Trend chart data - pivot by year
  const trendData = useMemo(() => {
    const years = metadata.years;
    return years.map((year) => {
      const yearData: Record<string, number | string> = { year };
      agencies.forEach((agency) => {
        const record = filteredYearly.find(
          (fy) => fy.ntd_id === agency.ntd_id && fy.report_year === year
        );
        if (record) {
          switch (selectedMetric) {
            case 'ridership':
              yearData[agency.agency] = record.unlinked_passenger_trips;
              break;
            case 'expenses':
              yearData[agency.agency] = record.total_operating_expenses;
              break;
            case 'efficiency':
              yearData[agency.agency] =
                record.vehicle_revenue_hours > 0
                  ? record.unlinked_passenger_trips / record.vehicle_revenue_hours
                  : 0;
              break;
            case 'farebox':
              yearData[agency.agency] =
                record.total_operating_expenses > 0
                  ? (record.fare_revenues_earned / record.total_operating_expenses) * 100
                  : 0;
              break;
          }
        }
      });
      return yearData;
    });
  }, [agencies, filteredYearly, selectedMetric, metadata.years]);

  // Mode breakdown for selected agency or all agencies combined
  const modeBreakdownData = useMemo(() => {
    const relevantModes = selectedAgencyId
      ? filteredModes.filter((m) => m.ntd_id === selectedAgencyId)
      : filteredModes;

    const byMode: Record<string, number> = {};
    relevantModes.forEach((m) => {
      byMode[m.mode] = (byMode[m.mode] || 0) + m.unlinked_passenger_trips;
    });

    return Object.entries(byMode)
      .map(([mode, value]) => ({
        mode,
        name: metadata.mode_names[mode] || mode,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredModes, selectedAgencyId, metadata.mode_names]);

  const formatValue = (val: number) => {
    switch (selectedMetric) {
      case 'ridership':
        return formatNumber(val);
      case 'expenses':
        return formatCurrency(val);
      case 'efficiency':
        return val.toFixed(1);
      case 'farebox':
        return `${val.toFixed(1)}%`;
    }
  };

  const metricLabel = {
    ridership: 'Annual Ridership',
    expenses: 'Operating Expenses',
    efficiency: 'Passengers per Hour',
    farebox: 'Farebox Recovery %',
  }[selectedMetric];

  const truncateName = (name: string) =>
    name.length > 20 ? name.slice(0, 20) + '...' : name;

  return (
    <div className="explore-step">
      <div className="explore-header">
        <button className="back-button" onClick={onBack}>
          ← Back to Selection
        </button>
        <div>
          <h2>Analyzing {agencies.length} {agencies.length === 1 ? 'Agency' : 'Agencies'}</h2>
          <p className="agency-list-summary">
            {agencies.slice(0, 5).map((a) => a.agency).join(', ')}
            {agencies.length > 5 && ` and ${agencies.length - 5} more`}
          </p>
        </div>
      </div>

      <div className="metric-selector">
        <span>Metric:</span>
        <button
          className={selectedMetric === 'ridership' ? 'active' : ''}
          onClick={() => setSelectedMetric('ridership')}
        >
          Ridership
        </button>
        <button
          className={selectedMetric === 'expenses' ? 'active' : ''}
          onClick={() => setSelectedMetric('expenses')}
        >
          Expenses
        </button>
        <button
          className={selectedMetric === 'efficiency' ? 'active' : ''}
          onClick={() => setSelectedMetric('efficiency')}
        >
          Efficiency
        </button>
        <button
          className={selectedMetric === 'farebox' ? 'active' : ''}
          onClick={() => setSelectedMetric('farebox')}
        >
          Farebox Recovery
        </button>
      </div>

      <div className="charts-grid">
        {/* Comparison Bar Chart */}
        <div className="chart-card">
          <h3>Agency Comparison: {metricLabel}</h3>
          <ResponsiveContainer width="100%" height={Math.max(300, agencies.length * 35)}>
            <BarChart
              data={comparisonData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 180, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={formatValue} />
              <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [formatValue(Number(value)), metricLabel]}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.fullName || ''
                }
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {comparisonData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Trend Line Chart */}
        <div className="chart-card">
          <h3>{metricLabel} Trends (2019-2024)</h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={trendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={formatValue} />
              <Tooltip formatter={(value) => [formatValue(Number(value)), '']} />
              <Legend formatter={truncateName} />
              {agencies.map((agency, index) => (
                <Line
                  key={agency.ntd_id}
                  type="monotone"
                  dataKey={agency.agency}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Mode Breakdown */}
        <div className="chart-card">
          <div className="chart-header-with-select">
            <h3>Ridership by Mode</h3>
            <select
              value={selectedAgencyId ?? 'all'}
              onChange={(e) =>
                setSelectedAgencyId(e.target.value === 'all' ? null : Number(e.target.value))
              }
            >
              <option value="all">All Selected Agencies</option>
              {agencies.map((a) => (
                <option key={a.ntd_id} value={a.ntd_id}>
                  {a.agency.length > 40 ? a.agency.slice(0, 40) + '...' : a.agency}
                </option>
              ))}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={modeBreakdownData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
              >
                {modeBreakdownData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatNumber(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Summary Table */}
        <div className="chart-card summary-table-card">
          <h3>Summary Statistics ({metadata.latest_year})</h3>
          <div className="summary-table-container">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Agency</th>
                  <th>Ridership</th>
                  <th>Expenses</th>
                  <th>Pass/Hr</th>
                  <th>Farebox</th>
                  <th>Cost/Trip</th>
                </tr>
              </thead>
              <tbody>
                {agencies.map((agency) => (
                  <tr key={agency.ntd_id}>
                    <td className="agency-name-cell">
                      {agency.agency.length > 30
                        ? agency.agency.slice(0, 30) + '...'
                        : agency.agency}
                    </td>
                    <td>{formatNumber(agency.unlinked_passenger_trips)}</td>
                    <td>{formatCurrency(agency.total_operating_expenses)}</td>
                    <td>{agency.trips_per_hour?.toFixed(1) ?? 'N/A'}</td>
                    <td>{formatPercent(agency.farebox_recovery)}</td>
                    <td>{formatCurrency(agency.cost_per_trip)}</td>
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
