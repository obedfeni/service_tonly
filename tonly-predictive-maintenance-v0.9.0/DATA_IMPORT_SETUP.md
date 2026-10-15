# Data import and maintenance baseline setup — v0.9

## Charging log
1. Sign in under **Data Quality** with the authorized Supabase planner account.
2. Upload the real Excel/CSV charging log or preview a configured Google Sheet.
3. Review invalid dates, missing odometers, future dates, duplicate candidates, non-canonical truck IDs and decreasing readings.
4. Save the source batch for review if you want a persistent audit trail. Imported odometer rows remain review-only; the app does not silently approve them into operational history.

Supported source columns should identify a date, canonical truck ID (`ET###`) and odometer in km. Common English/Chinese header aliases are recognized. The first Excel worksheet is used. Maximum upload preview: 10,000 rows and 100 columns.

## Last-service baseline
In **Predictive Intelligence**, select a truck and enter:
- verified last-service date;
- odometer at the last service;
- approved calendar interval in days;
- source reference for the approved PM rule;
- evidence reference for the completed service.

The values are checked against the latest charging-log reading. The app requires the planner to confirm the data against approved records before saving a forecast. Calendar intervals are never assumed by the app.

## Machine-learning comparison
The RF/XGBoost comparison requires a signed-in planner and a deployed Python ML service. After loading a real charging log and entering the verified service baseline:

1. Click **Run Random Forest + XGBoost**.
2. Review the training/test example counts, validation start date, MAE in km/day, median-baseline MAE, predicted usage and estimated PM date.
3. If the service reports insufficient data, continue with the rule-based baseline and gather more valid odometer history. Do not substitute fake data.
4. Select the method to use for the forecast and save it as provisional only after verifying PM rules and service evidence.

The models predict future odometer usage rate, not component failure. The chronological holdout is designed to avoid training on future target intervals. A model should not be preferred solely because it is XGBoost; compare its held-out MAE with the median baseline.

## Google Sheets
1. Create a Google Cloud service account and enable the Google Sheets API.
2. Share the spreadsheet with the service-account email as Viewer.
3. Configure `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` on the server only.
4. In Data Quality, paste the spreadsheet URL/ID and a bounded range such as `'Charging Log'!A1:Z5000`.

Never place Google or Supabase server secrets in `NEXT_PUBLIC_` variables or commit `.env.local`.
