import type { Metadata, Agency, AgencyYearly, AgencyMode, YearlyModeTotal } from './types';

const DATA_PATH = '/data';

export async function loadMetadata(): Promise<Metadata> {
  const response = await fetch(`${DATA_PATH}/metadata.json`);
  return response.json();
}

export async function loadAgencies(): Promise<Agency[]> {
  const response = await fetch(`${DATA_PATH}/agencies.json`);
  return response.json();
}

export async function loadAgencyYearly(): Promise<AgencyYearly[]> {
  const response = await fetch(`${DATA_PATH}/agency_yearly.json`);
  return response.json();
}

export async function loadAgencyModes(): Promise<AgencyMode[]> {
  const response = await fetch(`${DATA_PATH}/agency_modes.json`);
  return response.json();
}

export async function loadYearlyModeTotals(): Promise<YearlyModeTotal[]> {
  const response = await fetch(`${DATA_PATH}/yearly_mode_totals.json`);
  return response.json();
}

export function formatNumber(num: number | null | undefined): string {
  if (num == null) return 'N/A';
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toFixed(0);
}

export function formatCurrency(num: number | null | undefined): string {
  if (num == null) return 'N/A';
  return `$${formatNumber(num)}`;
}

export function formatPercent(num: number | null | undefined): string {
  if (num == null) return 'N/A';
  return `${(num * 100).toFixed(1)}%`;
}
