export interface RangeFilter {
  label: string;
  min: number;
  max: number | null;
}

export interface Metadata {
  years: number[];
  latest_year: number;
  modes: string[];
  mode_names: Record<string, string>;
  states: string[];
  organization_types: string[];
  reporter_types: string[];
  uza_names: string[];
  total_agencies: number;
  total_records: number;
  ridership_ranges: RangeFilter[];
  population_ranges: RangeFilter[];
}

export interface Agency {
  ntd_id: number;
  agency: string;
  city: string;
  state: string;
  organization_type: string;
  reporter_type: string;
  uza_name: string | null;
  primary_uza_population: number | null;
  agency_voms: number | null;
  modes: string[];
  unlinked_passenger_trips: number;
  total_operating_expenses: number;
  fare_revenues_earned: number;
  vehicle_revenue_hours: number;
  vehicle_revenue_miles: number;
  cost_per_trip: number | null;
  fare_per_trip: number | null;
  farebox_recovery: number | null;
  trips_per_hour: number | null;
}

export interface AgencyYearly {
  ntd_id: number;
  report_year: number;
  agency: string;
  unlinked_passenger_trips: number;
  total_operating_expenses: number;
  fare_revenues_earned: number;
  vehicle_revenue_hours: number;
  vehicle_revenue_miles: number;
  agency_voms: number | null;
}

export interface AgencyMode {
  ntd_id: number;
  mode: string;
  agency: string;
  unlinked_passenger_trips: number;
  total_operating_expenses: number;
  fare_revenues_earned: number;
  vehicle_revenue_hours: number;
  mode_voms: number;
}

export interface YearlyModeTotal {
  report_year: number;
  mode: string;
  unlinked_passenger_trips: number;
  total_operating_expenses: number;
  fare_revenues_earned: number;
  vehicle_revenue_hours: number;
}

// Similarity criteria that can be used for peer ranking
export type SimilarityCriterion =
  | 'population'
  | 'ridership'
  | 'fare_per_trip'
  | 'cost_per_trip'
  | 'operating_expenses'
  | 'vehicle_revenue_hours'
  | 'vehicle_revenue_miles';

export interface Filters {
  reporterTypes: string[];
  modes: string[];  // Matches agencies that operate ALL selected modes
  states: string[];
  searchQuery: string;
}

export interface SimilarityConfig {
  criteria: SimilarityCriterion[];
}
