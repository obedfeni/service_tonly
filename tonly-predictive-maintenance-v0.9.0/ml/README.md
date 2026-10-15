# ML baseline pipeline

## Current scope
- Imports a Google Sheets CSV export or Excel workbook.
- Standardizes common English/Chinese column names.
- Flags invalid dates/odometers, duplicate candidates, backwards odometer readings and long gaps.
- Builds daily observations and rolling usage features.
- Calculates a transparent kilometre-threshold baseline.

## Important limitation
The charging log alone cannot establish the actual next service date because it does not reliably contain the approved service interval or each truck's verified last service date/odometer. Those must come from maintenance records and approved service rules.

## Run
```bash
cd ml
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python pipeline.py path/to/charging-log.csv --out output
```

`quality-audit.json` retains flags for review. `daily-features.csv` is a feature table, not a validated production prediction.
