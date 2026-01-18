"""Preprocess NTD metrics data for dashboard."""

import json
from pathlib import Path

import pandas as pd


def normalize_ntd_id(ntd_id, year: int):
    """Normalize NTD ID - for 2019-2021, use last 5 characters if longer than 5."""
    ntd_str = str(ntd_id)
    if year <= 2021 and len(ntd_str) > 5:
        # Extract last 5 characters (the actual NTD ID portion)
        ntd_str = ntd_str[-5:]
    # Convert to integer, stripping any leading zeros for consistency
    try:
        return int(ntd_str)
    except ValueError:
        return None


def load_and_normalize(year: int) -> pd.DataFrame:
    """Load a year's data and normalize column names."""
    df = pd.read_csv(f"metrics/{year}.csv", encoding="latin-1")

    # Normalize column names to snake_case
    df.columns = (
        df.columns.str.lower()
        .str.replace(r"\n", "", regex=True)
        .str.replace(r"\s+", "_", regex=True)
        .str.replace(r"[^\w]", "", regex=True)
    )

    # Normalize NTD IDs for 2019-2021 data
    if "ntd_id" in df.columns:
        df["ntd_id"] = df["ntd_id"].apply(lambda x: normalize_ntd_id(x, year))

    # Add year column if not present
    if "report_year" not in df.columns:
        df["report_year"] = year

    return df


def main():
    # Load all years
    years = [2019, 2020, 2021, 2022, 2023, 2024]
    dfs = [load_and_normalize(year) for year in years]

    # Find common columns
    common_cols = set(dfs[0].columns)
    for df in dfs[1:]:
        common_cols &= set(df.columns)
    print(f"Common columns across all years: {len(common_cols)}")

    # Key columns we need - expanded for filtering
    key_cols = [
        "agency",
        "city",
        "state",
        "ntd_id",
        "organization_type",
        "reporter_type",
        "report_year",
        "primary_uza_population",
        "mode",
        "mode_name",
        "type_of_service",
        "mode_voms",
        "agency_voms",
        "fare_revenues_earned",
        "total_operating_expenses",
        "unlinked_passenger_trips",
        "vehicle_revenue_hours",
        "vehicle_revenue_miles",
        "passenger_miles",
        "cost_per_hour",
        "passengers_per_hour",
        "cost_per_passenger",
        "fare_revenues_per_unlinked",
    ]

    # Filter to key columns (only those that exist)
    available_cols = [c for c in key_cols if c in common_cols]
    print(f"Available key columns: {len(available_cols)}")

    # Combine data - use available columns per dataframe
    combined = pd.concat([df[[c for c in available_cols if c in df.columns]] for df in dfs], ignore_index=True)

    # Add uza_name from recent years only (2022+)
    recent_dfs = [df for df in dfs if df["report_year"].iloc[0] >= 2022]
    if recent_dfs:
        uza_lookup = pd.concat(recent_dfs)[["ntd_id", "uza_name"]].drop_duplicates().dropna()
        combined = combined.merge(uza_lookup, on="ntd_id", how="left")
    print(f"Combined rows: {len(combined)}")

    # Clean numeric columns
    numeric_cols = [
        "primary_uza_population",
        "mode_voms",
        "agency_voms",
        "fare_revenues_earned",
        "total_operating_expenses",
        "unlinked_passenger_trips",
        "vehicle_revenue_hours",
        "vehicle_revenue_miles",
        "passenger_miles",
        "cost_per_hour",
        "passengers_per_hour",
        "cost_per_passenger",
        "fare_revenues_per_unlinked",
    ]

    for col in numeric_cols:
        if col in combined.columns:
            combined[col] = pd.to_numeric(
                combined[col].astype(str).str.replace(",", ""), errors="coerce"
            )

    # Create output directory
    output_dir = Path("app/public/data")
    output_dir.mkdir(parents=True, exist_ok=True)

    # =========================================================================
    # 1. Create comprehensive agency list with attributes for filtering
    # =========================================================================
    latest_year = combined["report_year"].max()
    latest_data = combined[combined["report_year"] == latest_year]

    # Aggregate at agency level for latest year
    agg_dict = {
        "agency": "first",
        "city": "first",
        "state": "first",
        "organization_type": "first",
        "reporter_type": "first",
        "primary_uza_population": "first",
        "agency_voms": "first",
        "unlinked_passenger_trips": "sum",
        "total_operating_expenses": "sum",
        "fare_revenues_earned": "sum",
        "vehicle_revenue_hours": "sum",
        "vehicle_revenue_miles": "sum",
        "mode": lambda x: list(x.dropna().unique()),  # List of modes operated
    }
    if "uza_name" in latest_data.columns:
        agg_dict["uza_name"] = "first"

    agency_list = (
        latest_data.groupby("ntd_id")
        .agg(agg_dict)
        .reset_index()
    )

    # Rename mode column to modes
    agency_list = agency_list.rename(columns={"mode": "modes"})

    # Calculate derived metrics
    agency_list["cost_per_trip"] = (
        agency_list["total_operating_expenses"] / agency_list["unlinked_passenger_trips"]
    ).round(2)
    agency_list["fare_per_trip"] = (
        agency_list["fare_revenues_earned"] / agency_list["unlinked_passenger_trips"]
    ).round(2)
    agency_list["farebox_recovery"] = (
        agency_list["fare_revenues_earned"] / agency_list["total_operating_expenses"]
    ).round(4)
    agency_list["trips_per_hour"] = (
        agency_list["unlinked_passenger_trips"] / agency_list["vehicle_revenue_hours"]
    ).round(2)
    agency_list["rides_per_capita"] = (
        agency_list["unlinked_passenger_trips"] / agency_list["primary_uza_population"]
    ).round(2)

    # Filter out agencies without ridership data (per requirements)
    before_filter = len(agency_list)
    agency_list = agency_list[agency_list["unlinked_passenger_trips"] > 0]
    print(f"Filtered out {before_filter - len(agency_list)} agencies without ridership data")

    # Fill NaN with None for JSON
    agency_list = agency_list.where(pd.notnull(agency_list), None)

    # Sort by ridership
    agency_list = agency_list.sort_values("unlinked_passenger_trips", ascending=False)

    agency_list.to_json(output_dir / "agencies.json", orient="records")
    print(f"Saved agencies: {len(agency_list)} records")

    # =========================================================================
    # 2. Create full historical data for all agencies (by year)
    # =========================================================================
    # Only include agencies that have ridership data
    valid_agency_ids = set(agency_list["ntd_id"].tolist())

    agency_yearly = (
        combined[combined["ntd_id"].isin(valid_agency_ids)]
        .groupby(["ntd_id", "report_year"])
        .agg(
            {
                "agency": "first",
                "unlinked_passenger_trips": "sum",
                "total_operating_expenses": "sum",
                "fare_revenues_earned": "sum",
                "vehicle_revenue_hours": "sum",
                "vehicle_revenue_miles": "sum",
                "agency_voms": "first",
                "primary_uza_population": "first",
            }
        )
        .reset_index()
    )
    agency_yearly["rides_per_capita"] = (
        agency_yearly["unlinked_passenger_trips"] / agency_yearly["primary_uza_population"]
    ).round(2)
    agency_yearly.to_json(output_dir / "agency_yearly.json", orient="records")
    print(f"Saved agency yearly data: {len(agency_yearly)} records")

    # =========================================================================
    # 3. Create mode breakdown for each agency (latest year)
    # =========================================================================
    agency_modes = (
        latest_data.groupby(["ntd_id", "mode"])
        .agg(
            {
                "agency": "first",
                "unlinked_passenger_trips": "sum",
                "total_operating_expenses": "sum",
                "fare_revenues_earned": "sum",
                "vehicle_revenue_hours": "sum",
                "mode_voms": "sum",
            }
        )
        .reset_index()
    )
    agency_modes.to_json(output_dir / "agency_modes.json", orient="records")
    print(f"Saved agency mode breakdown: {len(agency_modes)} records")

    # =========================================================================
    # 4. National totals by year and mode
    # =========================================================================
    yearly_mode = (
        combined.groupby(["report_year", "mode"])
        .agg(
            {
                "unlinked_passenger_trips": "sum",
                "total_operating_expenses": "sum",
                "fare_revenues_earned": "sum",
                "vehicle_revenue_hours": "sum",
            }
        )
        .reset_index()
    )
    yearly_mode.to_json(output_dir / "yearly_mode_totals.json", orient="records")
    print(f"Saved yearly mode totals: {len(yearly_mode)} records")

    # =========================================================================
    # 5. Create filter options metadata
    # =========================================================================
    mode_names_map = {
        "AR": "Alaska Railroad",
        "CB": "Commuter Bus",
        "CC": "Cable Car",
        "CR": "Commuter Rail",
        "DR": "Demand Response",
        "DT": "Demand Response Taxi",
        "FB": "Ferryboat",
        "HR": "Heavy Rail",
        "IP": "Inclined Plane",
        "JT": "Jitney",
        "LR": "Light Rail",
        "MB": "Bus",
        "MG": "Monorail/Automated Guideway",
        "PB": "Publico",
        "RB": "Bus Rapid Transit",
        "SR": "Streetcar Rail",
        "TB": "Trolleybus",
        "TR": "Aerial Tramway",
        "VP": "Vanpool",
        "YR": "Hybrid Rail",
    }

    # Get unique values for filters
    states = sorted(combined["state"].dropna().unique().tolist())
    org_types = sorted(combined["organization_type"].dropna().unique().tolist())
    reporter_types = sorted(combined["reporter_type"].dropna().unique().tolist())
    uza_names = sorted(combined["uza_name"].dropna().unique().tolist()) if "uza_name" in combined.columns else []
    modes = sorted(combined["mode"].dropna().unique().tolist())

    metadata = {
        "years": years,
        "latest_year": int(latest_year),
        "modes": modes,
        "mode_names": mode_names_map,
        "states": states,
        "organization_types": org_types,
        "reporter_types": reporter_types,
        "uza_names": uza_names,
        "total_agencies": int(combined["ntd_id"].nunique()),
        "total_records": len(combined),
        # Ridership ranges for filtering
        "ridership_ranges": [
            {"label": "Very Large (>100M trips)", "min": 100_000_000, "max": None},
            {"label": "Large (10M-100M trips)", "min": 10_000_000, "max": 100_000_000},
            {"label": "Medium (1M-10M trips)", "min": 1_000_000, "max": 10_000_000},
            {"label": "Small (100K-1M trips)", "min": 100_000, "max": 1_000_000},
            {"label": "Very Small (<100K trips)", "min": 0, "max": 100_000},
        ],
        # Population ranges for filtering
        "population_ranges": [
            {"label": "Very Large (>2M)", "min": 2_000_000, "max": None},
            {"label": "Large (500K-2M)", "min": 500_000, "max": 2_000_000},
            {"label": "Medium (100K-500K)", "min": 100_000, "max": 500_000},
            {"label": "Small (50K-100K)", "min": 50_000, "max": 100_000},
            {"label": "Very Small (<50K)", "min": 0, "max": 50_000},
        ],
    }

    with open(output_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    print("Saved metadata")


if __name__ == "__main__":
    main()
