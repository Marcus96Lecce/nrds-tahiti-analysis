Raw automated sync from Metabase (`metabase.nrds.io`), refreshed periodically by
`.github/workflows/sync-metabase.yml` / `scripts/sync-metabase.mjs`. Not yet read by the
app itself — these files exist so the current official-NRDS data is available for future
features (e.g. comparing against what's entered locally in this app).

Column names for `deratisation.json`, `deratisation_checks.json`, and
`historical_management_units.json` were cleaned up and cross-checked against known values.

`habitat_restoration.json` keeps Metabase's raw, unmodified column names
(e.g. `esp_ce_esp_ce_name`, `pr_cision_localisation_rat_st`, `_cleaned_at_arrival`). NRDS's
own sync into Metabase truncates/mangles some column names for this table, and at least one
other table (`Espece`) was found to have two columns silently swapped by that sync — verify
a given column's real meaning against actual values (or the original
`Habitat Restoration.csv` export) before building anything on top of it.
