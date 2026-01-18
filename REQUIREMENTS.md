# NTD Dashboard

This web-based dashboard allows benchmarking and comparison between transit agencies.

## Data Prep

The underlying data for the dashboard is in the `metrics` folder and needs to be pre-processed to join the years of available data into a single dataset. Start by merging the 2022, 2023, and 2024 data. Then, if possible, join the 2021, 2020, and 2019 data (these datasets may not have the same schema - either correct the schema or ignore the dataset).

Script this out (Python) and save the script.

Omit any agencies without ridership data.

## Benchmarking App Features

### Peer Selection

The peer selection module allows users to select good peer agencies to compare to. Examine https://benchmarking.tpm-portal.com/peer-selection for a good example of what this module should do.

The first step is for the user to select their home agency (the agency being compared to) and then to select some peer agencies. This can be accomplished with a searchable dropdown selection.

The second step is for the user to define criteria for ranking and selecting potential peers. This should include both *filters* and *a similarity ranking based on selected similarity criteria*.

#### Filters

The filters should limit the table of agencies to only those matching the selected filters. Filters should include:

* Reporter type (matches ANY of the seleted reporter types)
* Transit Modes Operated (use full names, not abbreviations). Match based on agencies that operate ALL of the selected modes.
* State (matches ANY of the selected states)

#### Similarity Criteria

Criteria for ranking peers should include:

* Population
* Annual ridership
* Fare Revenues per Unlinked Passenger Trip
* Cost per Passenger
* Total Operating Expenses
* Vehicle Revenue Hours
* Vehicle Revenue Miles

For all agencies, log transform the values then normalize the similarity criteria to a 0 - 100 (or 0 - 1) scale. 
Similarity metric: sum the absolute value of the difference between the selected agency's normalized scores and all other agencies normalized scores.
In the table, display the raw values of all metrics selected. 
Sort the table based on descending value of the similarity metric (so that agencies that are most similar are displayed up top).

### Performance Comparison

On a separate tab, after the peers agencies (< 20) have been selected, allow the user to choose which metric to compare and display the selected metric as a line chart over time for the selected agencies. The line width for the "home agency" should be thicker than the peer agencies.

This module should have these feature:

* Selector for performance measures. Choose which metric to display.
* Chart. Time series line graph that shows the values for the selected performance measure.
* Download. Ability to download the underlying data as a CSV.

