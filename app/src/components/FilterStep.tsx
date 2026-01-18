import { useState, useMemo } from 'react';
import type { Agency, Metadata, Filters, RangeFilter } from '../types';
import { formatNumber } from '../data';
import './FilterStep.css';

interface Props {
  agencies: Agency[];
  metadata: Metadata;
  onSelectAgencies: (agencies: Agency[]) => void;
}

const INITIAL_FILTERS: Filters = {
  states: [],
  organizationTypes: [],
  reporterTypes: [],
  modes: [],
  ridershipRange: null,
  populationRange: null,
  searchQuery: '',
};

export function FilterStep({ agencies, metadata, onSelectAgencies }: Props) {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Apply filters to get filtered agencies
  const filteredAgencies = useMemo(() => {
    return agencies.filter((agency) => {
      // Search query filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesSearch =
          agency.agency.toLowerCase().includes(query) ||
          agency.city.toLowerCase().includes(query) ||
          (agency.uza_name?.toLowerCase().includes(query) ?? false);
        if (!matchesSearch) return false;
      }

      // State filter
      if (filters.states.length > 0 && !filters.states.includes(agency.state)) {
        return false;
      }

      // Organization type filter
      if (
        filters.organizationTypes.length > 0 &&
        !filters.organizationTypes.includes(agency.organization_type)
      ) {
        return false;
      }

      // Reporter type filter
      if (
        filters.reporterTypes.length > 0 &&
        !filters.reporterTypes.includes(agency.reporter_type)
      ) {
        return false;
      }

      // Mode filter - agency must operate at least one selected mode
      if (filters.modes.length > 0) {
        const hasMode = filters.modes.some((m) => agency.modes.includes(m));
        if (!hasMode) return false;
      }

      // Ridership range filter
      if (filters.ridershipRange) {
        const { min, max } = filters.ridershipRange;
        const ridership = agency.unlinked_passenger_trips;
        if (ridership < min) return false;
        if (max !== null && ridership >= max) return false;
      }

      // Population range filter
      if (filters.populationRange) {
        const { min, max } = filters.populationRange;
        const pop = agency.primary_uza_population;
        if (pop === null) return false;
        if (pop < min) return false;
        if (max !== null && pop >= max) return false;
      }

      return true;
    });
  }, [agencies, filters]);

  const toggleState = (state: string) => {
    setFilters((prev) => ({
      ...prev,
      states: prev.states.includes(state)
        ? prev.states.filter((s) => s !== state)
        : [...prev.states, state],
    }));
  };

  const toggleOrgType = (type: string) => {
    setFilters((prev) => ({
      ...prev,
      organizationTypes: prev.organizationTypes.includes(type)
        ? prev.organizationTypes.filter((t) => t !== type)
        : [...prev.organizationTypes, type],
    }));
  };

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

  const setRidershipRange = (range: RangeFilter | null) => {
    setFilters((prev) => ({ ...prev, ridershipRange: range }));
  };

  const setPopulationRange = (range: RangeFilter | null) => {
    setFilters((prev) => ({ ...prev, populationRange: range }));
  };

  const toggleAgencySelection = (ntdId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ntdId)) {
        next.delete(ntdId);
      } else if (next.size < 20) {
        next.add(ntdId);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    const toAdd = filteredAgencies.slice(0, 20 - selectedIds.size);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      toAdd.forEach((a) => next.add(a.ntd_id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const clearFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const handleProceed = () => {
    const selected = agencies.filter((a) => selectedIds.has(a.ntd_id));
    onSelectAgencies(selected);
  };

  const selectedAgencies = agencies.filter((a) => selectedIds.has(a.ntd_id));

  return (
    <div className="filter-step">
      <div className="filter-header">
        <h2>Step 1: Select Agencies to Analyze</h2>
        <p>
          Use the filters below to narrow down agencies, then select up to 20 for detailed analysis.
        </p>
      </div>

      <div className="filter-layout">
        {/* Filter Panel */}
        <div className="filter-panel">
          <div className="filter-section">
            <label>Search</label>
            <input
              type="text"
              placeholder="Search by name, city, or metro area..."
              value={filters.searchQuery}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))
              }
            />
          </div>

          <div className="filter-section">
            <label>States</label>
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

          <div className="filter-section">
            <label>Annual Ridership</label>
            <div className="filter-chips">
              {metadata.ridership_ranges.map((range) => (
                <button
                  key={range.label}
                  className={filters.ridershipRange?.label === range.label ? 'active' : ''}
                  onClick={() =>
                    setRidershipRange(
                      filters.ridershipRange?.label === range.label ? null : range
                    )
                  }
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <label>UZA Population</label>
            <div className="filter-chips">
              {metadata.population_ranges.map((range) => (
                <button
                  key={range.label}
                  className={filters.populationRange?.label === range.label ? 'active' : ''}
                  onClick={() =>
                    setPopulationRange(
                      filters.populationRange?.label === range.label ? null : range
                    )
                  }
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <label>Transit Modes Operated</label>
            <div className="filter-chips">
              {metadata.modes.map((mode) => (
                <button
                  key={mode}
                  className={filters.modes.includes(mode) ? 'active' : ''}
                  onClick={() => toggleMode(mode)}
                  title={metadata.mode_names[mode]}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <label>Organization Type</label>
            <div className="filter-chips">
              {metadata.organization_types.map((type) => (
                <button
                  key={type}
                  className={filters.organizationTypes.includes(type) ? 'active' : ''}
                  onClick={() => toggleOrgType(type)}
                  title={type}
                >
                  {type.length > 30 ? type.slice(0, 30) + '...' : type}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <label>Reporter Type</label>
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

          <button className="clear-filters" onClick={clearFilters}>
            Clear All Filters
          </button>
        </div>

        {/* Results Panel */}
        <div className="results-panel">
          <div className="results-header">
            <span className="results-count">
              {filteredAgencies.length} agencies match filters
            </span>
            <div className="results-actions">
              <button onClick={selectAllVisible} disabled={selectedIds.size >= 20}>
                Select Top {Math.min(20 - selectedIds.size, filteredAgencies.length)}
              </button>
              <button onClick={clearSelection} disabled={selectedIds.size === 0}>
                Clear Selection
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
                  <th>Ridership</th>
                  <th>Modes</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgencies.slice(0, 100).map((agency) => (
                  <tr
                    key={agency.ntd_id}
                    className={selectedIds.has(agency.ntd_id) ? 'selected' : ''}
                    onClick={() => toggleAgencySelection(agency.ntd_id)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(agency.ntd_id)}
                        onChange={() => toggleAgencySelection(agency.ntd_id)}
                        disabled={!selectedIds.has(agency.ntd_id) && selectedIds.size >= 20}
                      />
                    </td>
                    <td className="agency-name">{agency.agency}</td>
                    <td>
                      {agency.city}, {agency.state}
                    </td>
                    <td>{formatNumber(agency.unlinked_passenger_trips)}</td>
                    <td className="modes-cell">
                      {agency.modes.map((m) => (
                        <span key={m} className="mode-badge" title={metadata.mode_names[m]}>
                          {m}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredAgencies.length > 100 && (
              <div className="table-note">
                Showing first 100 of {filteredAgencies.length} results. Use filters to narrow down.
              </div>
            )}
          </div>
        </div>

        {/* Selection Summary */}
        <div className="selection-panel">
          <h3>Selected Agencies ({selectedIds.size}/20)</h3>
          {selectedAgencies.length === 0 ? (
            <p className="empty-selection">
              Click agencies in the table to select them for analysis.
            </p>
          ) : (
            <ul className="selected-list">
              {selectedAgencies.map((agency) => (
                <li key={agency.ntd_id}>
                  <span>{agency.agency}</span>
                  <button onClick={() => toggleAgencySelection(agency.ntd_id)}>×</button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="proceed-button"
            onClick={handleProceed}
            disabled={selectedIds.size === 0}
          >
            Analyze {selectedIds.size} {selectedIds.size === 1 ? 'Agency' : 'Agencies'}
          </button>
        </div>
      </div>
    </div>
  );
}
