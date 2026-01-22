import { useState, useMemo, useRef, useEffect } from 'react';
import type { Agency, Metadata, Filters, SimilarityCriterion } from '../types';
import { formatNumber, formatCurrency } from '../data';
import './FilterStep.css';

interface Props {
  agencies: Agency[];
  metadata: Metadata;
  initialHomeAgency: Agency | null;
  initialPeerIds: number[];
  onSelectAgencies: (homeAgency: Agency, peers: Agency[]) => void;
  onStartOver: () => void;
}

const INITIAL_FILTERS: Filters = {
  reporterTypes: [],
  modes: [],
  states: [],
  searchQuery: '',
};

const SIMILARITY_CRITERIA: { key: SimilarityCriterion; label: string }[] = [
  { key: 'population', label: 'Population' },
  { key: 'ridership', label: 'Annual Ridership' },
  { key: 'fare_per_trip', label: 'Fare per Trip' },
  { key: 'cost_per_trip', label: 'Cost per Passenger' },
  { key: 'operating_expenses', label: 'Total Operating Expenses' },
  { key: 'vehicle_revenue_hours', label: 'Vehicle Revenue Hours' },
  { key: 'vehicle_revenue_miles', label: 'Vehicle Revenue Miles' },
  { key: 'rides_per_capita', label: 'Rides per Capita' },
];

// Get raw value for a criterion
function getCriterionValue(agency: Agency, criterion: SimilarityCriterion): number {
  switch (criterion) {
    case 'population':
      return agency.primary_uza_population ?? 0;
    case 'ridership':
      return agency.unlinked_passenger_trips;
    case 'fare_per_trip':
      return agency.fare_per_trip ?? 0;
    case 'cost_per_trip':
      return agency.cost_per_trip ?? 0;
    case 'operating_expenses':
      return agency.total_operating_expenses;
    case 'vehicle_revenue_hours':
      return agency.vehicle_revenue_hours;
    case 'vehicle_revenue_miles':
      return agency.vehicle_revenue_miles;
    case 'rides_per_capita':
      return agency.rides_per_capita ?? 0;
  }
}

// Log transform and normalize values to 0-1 scale
function normalizeValues(values: number[]): number[] {
  // Log transform (add 1 to handle zeros)
  const logValues = values.map((v) => Math.log(v + 1));
  const min = Math.min(...logValues);
  const max = Math.max(...logValues);
  const range = max - min || 1;
  return logValues.map((v) => (v - min) / range);
}

// Calculate similarity score (lower = more similar)
function calculateSimilarity(
  homeAgency: Agency,
  otherAgency: Agency,
  criteria: SimilarityCriterion[],
  normalizedValues: Map<SimilarityCriterion, Map<number, number>>
): number {
  if (criteria.length === 0) return 0;

  let totalDiff = 0;
  for (const criterion of criteria) {
    const homeNorm = normalizedValues.get(criterion)?.get(homeAgency.ntd_id) ?? 0;
    const otherNorm = normalizedValues.get(criterion)?.get(otherAgency.ntd_id) ?? 0;
    totalDiff += Math.abs(homeNorm - otherNorm);
  }
  return totalDiff;
}

export function FilterStep({
  agencies,
  metadata,
  initialHomeAgency,
  initialPeerIds,
  onSelectAgencies,
  onStartOver,
}: Props) {
  const [homeAgency, setHomeAgency] = useState<Agency | null>(initialHomeAgency);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [selectedCriteria, setSelectedCriteria] = useState<SimilarityCriterion[]>([
    'population',
    'ridership',
  ]);
  const [selectedPeerIds, setSelectedPeerIds] = useState<Set<number>>(
    new Set(initialPeerIds)
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [agencySearch, setAgencySearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter agencies for home agency dropdown
  const filteredDropdownAgencies = useMemo(() => {
    if (!agencySearch) return agencies.slice(0, 50);
    const query = agencySearch.toLowerCase();
    return agencies
      .filter(
        (a) =>
          a.agency.toLowerCase().includes(query) ||
          a.city.toLowerCase().includes(query) ||
          a.state.toLowerCase().includes(query)
      )
      .slice(0, 50);
  }, [agencies, agencySearch]);

  // Apply filters to get potential peers
  const filteredAgencies = useMemo(() => {
    return agencies.filter((agency) => {
      // Exclude home agency from peers
      if (homeAgency && agency.ntd_id === homeAgency.ntd_id) return false;

      // Search query filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesSearch =
          agency.agency.toLowerCase().includes(query) ||
          agency.city.toLowerCase().includes(query) ||
          (agency.uza_name?.toLowerCase().includes(query) ?? false);
        if (!matchesSearch) return false;
      }

      // Reporter type filter (matches ANY)
      if (filters.reporterTypes.length > 0 && !filters.reporterTypes.includes(agency.reporter_type)) {
        return false;
      }

      // Mode filter - agency must operate ALL selected modes
      if (filters.modes.length > 0) {
        const hasAllModes = filters.modes.every((m) => agency.modes.includes(m));
        if (!hasAllModes) return false;
      }

      // State filter (matches ANY)
      if (filters.states.length > 0 && !filters.states.includes(agency.state)) {
        return false;
      }

      return true;
    });
  }, [agencies, homeAgency, filters]);

  // Pre-compute normalized values for all criteria
  const normalizedValues = useMemo(() => {
    const result = new Map<SimilarityCriterion, Map<number, number>>();

    for (const { key } of SIMILARITY_CRITERIA) {
      const values = agencies.map((a) => getCriterionValue(a, key));
      const normalized = normalizeValues(values);
      const valueMap = new Map<number, number>();
      agencies.forEach((a, i) => valueMap.set(a.ntd_id, normalized[i]));
      result.set(key, valueMap);
    }

    return result;
  }, [agencies]);

  // Calculate similarity and sort agencies
  const rankedAgencies = useMemo(() => {
    if (!homeAgency) return filteredAgencies;

    return [...filteredAgencies]
      .map((agency) => ({
        agency,
        similarity: calculateSimilarity(homeAgency, agency, selectedCriteria, normalizedValues),
      }))
      .sort((a, b) => a.similarity - b.similarity)
      .map((item) => item.agency);
  }, [filteredAgencies, homeAgency, selectedCriteria, normalizedValues]);

  const toggleReporterType = (type: string) => {
    setFilters((prev) => ({
      ...prev,
      reporterTypes: prev.reporterTypes.includes(type)
        ? prev.reporterTypes.filter((t) => t !== type)
        : [...prev.reporterTypes, type],
    }));
  };

  const toggleMode = (mode: string) => {
    setFilters((prev) => ({
      ...prev,
      modes: prev.modes.includes(mode)
        ? prev.modes.filter((m) => m !== mode)
        : [...prev.modes, mode],
    }));
  };

  const toggleState = (state: string) => {
    setFilters((prev) => ({
      ...prev,
      states: prev.states.includes(state)
        ? prev.states.filter((s) => s !== state)
        : [...prev.states, state],
    }));
  };

  const toggleCriterion = (criterion: SimilarityCriterion) => {
    setSelectedCriteria((prev) =>
      prev.includes(criterion)
        ? prev.filter((c) => c !== criterion)
        : [...prev, criterion]
    );
  };

  const togglePeerSelection = (ntdId: number) => {
    setSelectedPeerIds((prev) => {
      const next = new Set(prev);
      if (next.has(ntdId)) {
        next.delete(ntdId);
      } else if (next.size < 19) {
        // Max 19 peers (+ 1 home = 20 total)
        next.add(ntdId);
      }
      return next;
    });
  };

  const selectTopN = (n: number) => {
    const toSelect = rankedAgencies.slice(0, n).map((a) => a.ntd_id);
    setSelectedPeerIds(new Set(toSelect));
  };

  const clearSelection = () => {
    setSelectedPeerIds(new Set());
  };

  const clearFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const handleProceed = () => {
    if (!homeAgency) return;
    const peers = agencies.filter((a) => selectedPeerIds.has(a.ntd_id));
    onSelectAgencies(homeAgency, peers);
  };

  const formatCriterionValue = (agency: Agency, criterion: SimilarityCriterion): string => {
    const value = getCriterionValue(agency, criterion);
    switch (criterion) {
      case 'fare_per_trip':
      case 'cost_per_trip':
      case 'operating_expenses':
        return formatCurrency(value);
      case 'rides_per_capita':
        return value.toFixed(1);
      default:
        return formatNumber(value);
    }
  };

  return (
    <div className="filter-step">
      <div className="filter-header">
        <div className="filter-header-row">
          <div>
            <h2>Step 1: Select Your Agency and Peers</h2>
            <p>First select your home agency, then use filters and similarity criteria to find peer agencies.</p>
          </div>
          {homeAgency && (
            <button className="start-over-button" onClick={onStartOver}>
              Start Over
            </button>
          )}
        </div>
      </div>

      {/* Home Agency Selection */}
      <div className="home-agency-section">
        <label>Home Agency (Your Agency)</label>
        <div className="agency-dropdown" ref={dropdownRef}>
          <input
            type="text"
            placeholder="Search for your agency..."
            value={homeAgency ? homeAgency.agency : agencySearch}
            onChange={(e) => {
              setAgencySearch(e.target.value);
              if (homeAgency) setHomeAgency(null);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
          />
          {showDropdown && (
            <div className="dropdown-list">
              {filteredDropdownAgencies.map((agency) => (
                <div
                  key={agency.ntd_id}
                  className="dropdown-item"
                  onClick={() => {
                    setHomeAgency(agency);
                    setAgencySearch('');
                    setShowDropdown(false);
                  }}
                >
                  <span className="agency-name">{agency.agency}</span>
                  <span className="agency-location">
                    {agency.city}, {agency.state}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        {homeAgency && (
          <div className="home-agency-card">
            <strong>{homeAgency.agency}</strong>
            <span>
              {homeAgency.city}, {homeAgency.state} | {formatNumber(homeAgency.unlinked_passenger_trips)} trips
            </span>
          </div>
        )}
      </div>

      {homeAgency && (
        <div className="filter-layout">
          {/* Filter Panel */}
          <div className="filter-panel">
            <div className="filter-section">
              <label>Reporter Type (match any)</label>
              <div className="filter-chips">
                {metadata.reporter_types.map((type) => (
                  <button
                    key={type}
                    className={filters.reporterTypes.includes(type) ? 'active' : ''}
                    onClick={() => toggleReporterType(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-section">
              <label>Transit Modes (must operate ALL selected)</label>
              <div className="filter-chips">
                {metadata.modes.map((mode) => (
                  <button
                    key={mode}
                    className={filters.modes.includes(mode) ? 'active' : ''}
                    onClick={() => toggleMode(mode)}
                    title={metadata.mode_names[mode]}
                  >
                    {metadata.mode_names[mode] || mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-section">
              <label>States (match any)</label>
              <div className="filter-chips scrollable">
                {metadata.states.map((state) => (
                  <button
                    key={state}
                    className={filters.states.includes(state) ? 'active' : ''}
                    onClick={() => toggleState(state)}
                  >
                    {state}
                  </button>
                ))}
              </div>
            </div>

            <button className="clear-filters" onClick={clearFilters}>
              Clear All Filters
            </button>

            <div className="filter-section similarity-section">
              <label>Similarity Criteria</label>
              <p className="helper-text">
                Select criteria to rank agencies by similarity to your home agency.
              </p>
              <div className="filter-chips">
                {SIMILARITY_CRITERIA.map(({ key, label }) => (
                  <button
                    key={key}
                    className={selectedCriteria.includes(key) ? 'active' : ''}
                    onClick={() => toggleCriterion(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="results-panel">
            <div className="results-header">
              <span className="results-count">{rankedAgencies.length} potential peers</span>
              <div className="results-actions">
                <input
                  type="text"
                  className="peer-search-input"
                  placeholder="Search..."
                  value={filters.searchQuery}
                  onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
                />
                <button onClick={() => selectTopN(5)}>Select Top 5</button>
                <button onClick={() => selectTopN(10)}>Select Top 10</button>
                <button onClick={clearSelection} disabled={selectedPeerIds.size === 0}>
                  Clear
                </button>
              </div>
            </div>

            <div className="agency-table-container">
              <table className="agency-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Agency</th>
                    <th>Location</th>
                    {selectedCriteria.map((criterion) => (
                      <th key={criterion}>
                        {SIMILARITY_CRITERIA.find((c) => c.key === criterion)?.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankedAgencies.slice(0, 100).map((agency, index) => (
                    <tr
                      key={agency.ntd_id}
                      className={selectedPeerIds.has(agency.ntd_id) ? 'selected' : ''}
                      onClick={() => togglePeerSelection(agency.ntd_id)}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedPeerIds.has(agency.ntd_id)}
                          onChange={() => togglePeerSelection(agency.ntd_id)}
                          onClick={(e) => e.stopPropagation()}
                          disabled={!selectedPeerIds.has(agency.ntd_id) && selectedPeerIds.size >= 19}
                        />
                      </td>
                      <td className="agency-name-cell">
                        <span className="rank">#{index + 1}</span>
                        {agency.agency}
                      </td>
                      <td>
                        {agency.city}, {agency.state}
                      </td>
                      {selectedCriteria.map((criterion) => (
                        <td key={criterion}>{formatCriterionValue(agency, criterion)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rankedAgencies.length > 100 && (
                <div className="table-note">
                  Showing top 100 of {rankedAgencies.length} results (sorted by similarity).
                </div>
              )}
            </div>
          </div>

          {/* Selection Summary */}
          <div className="selection-panel">
            <h3>Selected Peers ({selectedPeerIds.size}/19)</h3>
            {selectedPeerIds.size === 0 ? (
              <p className="empty-selection">Click agencies in the table to select them as peers.</p>
            ) : (
              <ul className="selected-list">
                {agencies
                  .filter((a) => selectedPeerIds.has(a.ntd_id))
                  .map((agency) => (
                    <li key={agency.ntd_id}>
                      <span>{agency.agency}</span>
                      <button onClick={() => togglePeerSelection(agency.ntd_id)}>×</button>
                    </li>
                  ))}
              </ul>
            )}
            <button
              className="proceed-button"
              onClick={handleProceed}
            >
              {selectedPeerIds.size === 0
                ? 'View Charts (No Peers)'
                : `Compare ${selectedPeerIds.size + 1} Agencies`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
