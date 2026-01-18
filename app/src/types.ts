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
  cost_per_trip: number | null;
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

export interface Filters {
  states: string[];
  organizationTypes: string[];
  reporterTypes: string[];
  modes: string[];
  ridershipRange: RangeFilter | null;
  populationRange: RangeFilter | null;
  searchQuery: string;
}
