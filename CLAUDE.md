# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

### Frontend (app/)
```bash
cd app
npm run dev      # Start Vite dev server with HMR
npm run build    # TypeScript compile + Vite production build
npm run lint     # ESLint with TypeScript rules
npm run preview  # Preview production build
```

### Data Processing
```bash
source .venv/bin/activate
python preprocess.py   # Process metrics/*.csv → app/public/data/*.json
```

### Environment Setup
- Python: Uses `uv` for package management with Python 3.12
- Node: npm for frontend dependencies

## Architecture

### Data Pipeline
```
metrics/*.csv (2019-2024) → preprocess.py → app/public/data/*.json → React UI
```

The preprocessing script:
- Normalizes NTD IDs (2019-2021 have different format than 2022+)
- Imputes missing population data across years
- Calculates derived metrics (cost_per_trip, rides_per_capita, farebox_recovery, etc.)
- Filters to agencies with ridership data only
- Outputs 5 JSON files: agencies, agency_yearly, agency_modes, yearly_mode_totals, metadata

### Frontend (Two-Step Workflow)
1. **FilterStep** (`app/src/components/FilterStep.tsx`): Home agency selection, peer filtering by reporter type/modes/states, similarity ranking using log-normalized scores
2. **ExploreStep** (`app/src/components/ExploreStep.tsx`): Performance comparison charts (Recharts), CSV export, summary tables

### State Persistence
- Home agency and peer selections stored in cookies (30-day expiry)
- Restored on page reload; "Start Over" button clears selections

### Key Types (`app/src/types.ts`)
- `Agency`: Latest year snapshot with calculated metrics
- `AgencyYearly`: Historical data by NTD ID and year
- `SimilarityCriterion`: 8 criteria for peer ranking (population, ridership, cost_per_trip, etc.)

## Data Processing Notes

### NTD ID Normalization
2019-2021 IDs may be longer than 5 characters (e.g., "7R03-70133"). The `normalize_ntd_id()` function extracts the last 5 characters for consistency with 2022+ data.

### Monetary Value Parsing
2019-2021 CSVs have formatted values (`$5,206,727,193`). The preprocessing strips `$`, commas, and whitespace before numeric conversion.

### Population Imputation
For agencies missing population in some years, the `impute_population()` function backfills using the nearest available non-zero value, preferring 2022+ data which has better coverage.
