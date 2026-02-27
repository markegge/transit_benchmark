# Transit Peers

A benchmarking tool for comparing US public transit agency performance using [National Transit Database (NTD)](https://www.transit.gov/ntd) data from 2019–2024.

**Live at [transitpeers.net](https://transitpeers.net)**

## What It Does

Transit Peers helps transit professionals identify peer agencies and compare performance over time. The workflow has two steps:

1. **Peer Selection** — Pick a home agency, then filter and rank ~1,000+ agencies by similarity across criteria like population, ridership, operating costs, and more.
2. **Performance Comparison** — View trend charts, bar charts, and summary tables comparing your agency against selected peers across 8 metrics. Export data as CSV.

## Tech Stack

- **Frontend:** React 19, TypeScript, Recharts, Vite
- **Data Processing:** Python 3.12 (pandas), managed with `uv`
- **Data Source:** NTD annual metrics CSVs (2019–2024)

## Project Structure

```
transit_benchmark/
├── preprocess.py              # CSV → JSON data pipeline
├── metrics/                   # Raw NTD CSV files (2019–2024)
│   └── data_dictionary.csv
└── app/                       # React frontend
    ├── src/
    │   ├── App.tsx            # Main app with state management
    │   ├── types.ts           # TypeScript interfaces
    │   ├── data.ts            # Data loading utilities
    │   └── components/
    │       ├── FilterStep.tsx  # Peer selection & similarity ranking
    │       └── ExploreStep.tsx # Charts, tables, CSV export
    └── public/data/           # Generated JSON (from preprocess.py)
```

## Setup

### Prerequisites

- Python 3.12+ with [uv](https://docs.astral.sh/uv/)
- Node.js with npm

### Data Processing

```bash
source .venv/bin/activate
python preprocess.py   # Processes metrics/*.csv → app/public/data/*.json
```

This generates 5 JSON files consumed by the frontend: `agencies.json`, `agency_yearly.json`, `agency_modes.json`, `yearly_mode_totals.json`, and `metadata.json`.

### Frontend

```bash
cd app
npm install
npm run dev       # Start dev server at http://localhost:5173
npm run build     # Production build → app/dist/
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

## Data Pipeline

The preprocessing script handles several NTD data quirks:

- **NTD ID normalization** — 2019–2021 data uses longer IDs (e.g., `7R03-70133`); the script extracts the last 5 characters for consistency with 2022+ data.
- **Currency parsing** — Older CSVs have formatted values like `$5,206,727,193` that get stripped to numeric.
- **Population imputation** — Missing population values are backfilled from the nearest available year, preferring 2022+ data.
- **Derived metrics** — Calculates cost per trip, farebox recovery, rides per capita, fare per trip, and trips per hour.
- **Filtering** — Removes agencies with zero ridership.

## Similarity Ranking

Agencies are ranked by similarity to the home agency using a configurable set of criteria:

1. Log-transform values (handles wide ranges across small and large agencies)
2. Normalize each criterion to 0–1
3. Sum the absolute differences across selected criteria
4. Lower score = more similar

Available criteria: population, ridership, fare per trip, cost per trip, operating expenses, vehicle revenue hours, vehicle revenue miles, rides per capita.
