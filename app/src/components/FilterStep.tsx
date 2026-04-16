import { useState, useMemo, useRef, useEffect } from 'react';
import type { Agency, Metadata, Filters, SimilarityCriterion } from '../types';
import { formatNumber, formatCurrency } from '../data';
import './FilterStep.css';

interface Props {
  agencies: Agency[];
  metadata: Metadata;
  initialHomeAgency: Agency | null;
  initialPeerIds: number[];
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  selectedCriteria: SimilarityCriterion[];
  onSelectedCriteriaChange: (criteria: SimilarityCriterion[]) => void;
  onSelectAgencies: (homeAgency: Agency, peers: Agency[]) => void;
  onStartOver: () => void;
  onSetShowVideo: (show: boolean) => void;
}

const INITIAL_FILTERS: Filters = {
  reporterTypes: [],
  ftaPrograms: [],
  modes: [],
  states: [],
  searchQuery: '',
};

const FTA_PROGRAMS = [
  { key: '5311', label: '5311 (Rural)', description: 'No UZA or population < 50,000' },
  { key: '5307-small', label: '5307 Small Urban', description: 'UZA population 50,000–199,999' },
  { key: '5307', label: '5307 (Urban)', description: 'UZA population 200,000+' },
];

function getAgencyFtaProgram(agency: Agency): string {
  const pop = agency.primary_uza_population;
  if (!pop || pop < 50000) return '5311';
  if (pop < 200000) return '5307-small';
  return '5307';
}

const SIMILARITY_CRITERIA: { key: SimilarityCriterion; label: string }[] = [
  { key: 'population', label: 'Population' },
  { key: 'ridership', label: 'Annual Ridership' },
  { key: 'fare_per_trip', label: 'Fare per Trip' },
  { key: 'cost_per_trip', label: 'Cost per Passenger' },
  { key: 'operating_expenses', label: 'Total Operating Expenses' },
  { key: 'vehicle_revenue_hours', label: 'Vehicle Revenue Hours' },
  { key: 'vehicle_revenue_miles', label: 'Vehicle Revenue Miles' },
  { key: 'rides_per_capita', label: 'Rides per Capita' },
  { key: 'service_area_sq_miles', label: 'Service Area (sq mi)' },
  { key: 'service_area_density', label: 'Service Area Density (pop/sq mi)' },
];

// Raw value for a criterion. Returns null when the agency doesn't have
// the underlying field (e.g. service-area data for Rural / Reduced
// Reporters); the similarity calc then excludes that agency-criterion
// pair rather than treating it as "0, i.e. most similar to smallest."
function getCriterionValue(agency: Agency, criterion: SimilarityCriterion): number | null {
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
    case 'service_area_sq_miles':
      return agency.service_area_sq_miles;
    case 'service_area_density':
      return agency.service_area_density;
  }
}

// Log transform and normalize the non-null values to a 0-1 scale. Agencies
// whose value for this criterion is null (missing) are omitted from the
// returned map — the similarity calc then skips them for this criterion.
function normalizeValues(
  values: Array<{ id: number; value: number | null }>
): Map<number, number> {
  const valid = values.filter((v): v is { id: number; value: number } => v.value !== null);
  if (valid.length === 0) return new Map();
  const logValues = valid.map((v) => Math.log(v.value + 1));
  const min = Math.min(...logValues);
  const max = Math.max(...logValues);
  const range = max - min || 1;
  const map = new Map<number, number>();
  valid.forEach((v, i) => map.set(v.id, (logValues[i] - min) / range));
  return map;
}

// Calculate similarity score (lower = more similar). If either agency is
// missing data for a criterion, that criterion is skipped for the pair —
// we don't want a missing service-area field to look like "identical".
function calculateSimilarity(
  homeAgency: Agency,
  otherAgency: Agency,
  criteria: SimilarityCriterion[],
  normalizedValues: Map<SimilarityCriterion, Map<number, number>>
): number {
  if (criteria.length === 0) return 0;

  let totalDiff = 0;
  let usedCount = 0;
  for (const criterion of criteria) {
    const map = normalizedValues.get(criterion);
    const homeNorm = map?.get(homeAgency.ntd_id);
    const otherNorm = map?.get(otherAgency.ntd_id);
    if (homeNorm === undefined || otherNorm === undefined) continue;
    totalDiff += Math.abs(homeNorm - otherNorm);
    usedCount += 1;
  }
  // Scale so ranks stay comparable across agencies even when some criteria
  // are excluded (e.g., peer missing service area). If nothing was usable
  // for this pair, push it to the bottom.
  if (usedCount === 0) return Number.POSITIVE_INFINITY;
  return (totalDiff * criteria.length) / usedCount;
}

export function FilterStep({
  agencies,
  metadata,
  initialHomeAgency,
  initialPeerIds,
  filters,
  onFiltersChange: setFilters,
  selectedCriteria,
  onSelectedCriteriaChange: setSelectedCriteria,
  onSelectAgencies,
  onStartOver,
  onSetShowVideo,
}: Props) {
  const [homeAgency, setHomeAgency] = useState<Agency | null>(initialHomeAgency);
  const [selectedPeerIds, setSelectedPeerIds] = useState<Set<number>>(
    new Set(initialPeerIds)
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [showModesDropdown, setShowModesDropdown] = useState(false);
  const [agencySearch, setAgencySearch] = useState('');
  const [videoFabDismissed, setVideoFabDismissed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modesDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (modesDropdownRef.current && !modesDropdownRef.current.contains(event.target as Node)) {
        setShowModesDropdown(false);
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

      // FTA program filter (matches ANY)
      if (filters.ftaPrograms.length > 0 && !filters.ftaPrograms.includes(getAgencyFtaProgram(agency))) {
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
      const pairs = agencies.map((a) => ({
        id: a.ntd_id,
        value: getCriterionValue(a, key),
      }));
      result.set(key, normalizeValues(pairs));
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
    setFilters({
      ...filters,
      reporterTypes: filters.reporterTypes.includes(type)
        ? filters.reporterTypes.filter((t) => t !== type)
        : [...filters.reporterTypes, type],
    });
  };

  const toggleFtaProgram = (program: string) => {
    setFilters({
      ...filters,
      ftaPrograms: filters.ftaPrograms.includes(program)
        ? filters.ftaPrograms.filter((p) => p !== program)
        : [...filters.ftaPrograms, program],
    });
  };

  const toggleMode = (mode: string) => {
    setFilters({
      ...filters,
      modes: filters.modes.includes(mode)
        ? filters.modes.filter((m) => m !== mode)
        : [...filters.modes, mode],
    });
  };

  const toggleState = (state: string) => {
    setFilters({
      ...filters,
      states: filters.states.includes(state)
        ? filters.states.filter((s) => s !== state)
        : [...filters.states, state],
    });
  };

  const toggleCriterion = (criterion: SimilarityCriterion) => {
    setSelectedCriteria(
      selectedCriteria.includes(criterion)
        ? selectedCriteria.filter((c) => c !== criterion)
        : [...selectedCriteria, criterion]
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
    if (value === null) return '—';
    switch (criterion) {
      case 'fare_per_trip':
      case 'cost_per_trip':
      case 'operating_expenses':
        return formatCurrency(value);
      case 'rides_per_capita':
        return value.toFixed(1);
      case 'service_area_density':
        return formatNumber(Math.round(value));
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
        <p className="intro-text">
          Transit Peers is a free benchmarking tool for US public transit agencies.
          Using data from the National Transit Database (NTD), you can compare ridership,
          operating expenses, farebox recovery, cost per trip, and other key performance
          metrics across more than 1,000 agencies from 2019 to 2024. Select your agency,
          find similar peers, and explore how your system performs over time.
        </p>
      </div>

      {/* Floating Quick Start Video Button */}
      {!videoFabDismissed && !homeAgency && (
        <div className="video-fab">
          <button className="video-fab-dismiss" onClick={() => setVideoFabDismissed(true)} title="Dismiss">&times;</button>
          <button className="video-fab-trigger" onClick={() => onSetShowVideo(true)}>
            <img
              src="https://img.youtube.com/vi/NKduIzIZUBE/mqdefault.jpg"
              alt="Quick start video thumbnail"
            />
            <span className="video-fab-label">Quick Start Video</span>
          </button>
        </div>
      )}


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
              <label>States (match any)</label>
              <div className="filter-chips states-chips">
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
              <label>FTA Program (match any)</label>
              <div className="filter-chips">
                {FTA_PROGRAMS.map(({ key, label }) => (
                  <button
                    key={key}
                    className={filters.ftaPrograms.includes(key) ? 'active' : ''}
                    onClick={() => toggleFtaProgram(key)}
                    title={FTA_PROGRAMS.find((p) => p.key === key)?.description}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-section">
              <label>Transit Modes (must operate ALL selected)</label>
              <div className="modes-dropdown-container" ref={modesDropdownRef}>
                <button
                  className={`modes-dropdown-trigger${filters.modes.length > 0 ? ' has-selection' : ''}`}
                  onClick={() => setShowModesDropdown((v) => !v)}
                >
                  {filters.modes.length === 0
                    ? 'Any mode'
                    : `${filters.modes.length} mode${filters.modes.length > 1 ? 's' : ''} selected`}
                  <span className="modes-dropdown-arrow">{showModesDropdown ? '▲' : '▼'}</span>
                </button>
                {showModesDropdown && (
                  <div className="modes-dropdown-list">
                    {metadata.modes.map((mode) => (
                      <label key={mode} className="modes-dropdown-item">
                        <input
                          type="checkbox"
                          checked={filters.modes.includes(mode)}
                          onChange={() => toggleMode(mode)}
                        />
                        <span>{metadata.mode_names[mode] || mode}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {filters.modes.length > 0 && (
                <div className="modes-selected-chips">
                  {filters.modes.map((mode) => (
                    <span key={mode} className="mode-selected-chip">
                      {metadata.mode_names[mode] || mode}
                      <button onClick={() => toggleMode(mode)}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button className="clear-filters" onClick={clearFilters}>
              Clear All Filters
            </button>
          </div>

          {/* Results Panel (with similarity criteria above) */}
          <div className="results-column">
            <div className="similarity-section">
              <label>Similarity Criteria</label>
              <p className="helper-text">
                Select criteria to rank peers by similarity to your home agency.
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

          <div className="results-panel">
            <div className="results-header">
              <span className="results-count">{rankedAgencies.length} potential peers</span>
              <div className="results-actions">
                <input
                  type="text"
                  className="peer-search-input"
                  placeholder="Search..."
                  value={filters.searchQuery}
                  onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
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

          {/* Selection Summary — inline in results column */}
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
          </div>{/* end results-column */}
        </div>
      )}
    </div>
  );
}
