# TONLY Predictive Maintenance Intelligence Platform

Version **0.9.0** — Next.js dashboard + Supabase persistence + Python Random Forest/XGBoost usage forecasting service.

## What this release does

- Preserves the existing fleet-maintenance dashboard UI.
- Imports charging logs from Excel/CSV or previews a configured Google Sheet.
- Audits source rows and estimates usage from validated odometer readings.
- Calculates preventive-maintenance due dates using the approved PM kilometre milestone and calendar interval, whichever comes first.
- Trains **Random Forest** and **XGBoost** usage-rate models from historical odometer intervals, with a chronological holdout and MAE comparison against a median baseline. Robust past-only rate checks exclude implausible odometer jumps; the latest suspicious reading blocks forecasting pending review.
- Saves authenticated ML comparison runs and provisional forecasts to Supabase.
- Does **not** claim to predict component failures. The models estimate future odometer usage (km/day); the approved PM rules remain authoritative.

## Architecture

- `app/`: Next.js dashboard and server routes, deployed to Vercel.
- `lib/`: shared PM forecast logic and Supabase helpers.
- `supabase/`: schema and ordered SQL migrations.
- `ml/`: source audit and daily feature pipeline.
- `ml-service/`: FastAPI service that trains/evaluates Random Forest and XGBoost on the uploaded real charging history.
- `render.yaml`: deploys the ML service separately on Render. Do not put Python ML dependencies in the Vercel Next.js runtime.

## Prerequisites

- Node.js 22 LTS and npm.
- A Supabase project with email/password auth and a planner account.
- Python 3.12 for local ML service/testing.
- A Python host for production ML service (the included Render Blueprint targets an always-on Starter service to avoid cold-start timeouts during a Vercel request).

## Local web application

1. Copy `.env.example` to `.env.local` and fill values locally. Never commit `.env.local`.
2. Install and check the web app:

   ```bash
   npm install
   npm run lint
   npm run typecheck
   npm run test:config
   npm run test:forecast
   npm run build
   npm run dev
   ```

3. Open `http://localhost:3000`.
4. Sign in with the configured planner account under **Data Quality**.
5. Upload a real Excel/CSV charging log, or preview a Google Sheet.
6. In **Predictive Intelligence**, choose a truck, enter its verified last-service date and odometer, approved calendar interval, and source references.
7. Run the RF/XGBoost comparison. The ML service requires enough valid historical next-interval usage examples; it returns an explicit insufficient-data result otherwise.
8. Choose Rule-based, Random Forest, XGBoost or Hybrid. Save only after reviewing the forecast and confirming the service-rule evidence.

## Configure Supabase

Apply the schema and migrations in this order, **only if they have not already been applied**:

1. `supabase/schema.sql` on a new/empty project only.
2. `supabase/migrations/20261015_001_import_foundation.sql`
3. `supabase/migrations/20261015_002_persistent_imports.sql`
4. `supabase/migrations/20261015_003_security_hardening.sql`
5. `supabase/migrations/20261015_004_service_baselines.sql`
6. `supabase/migrations/20261015_005_ml_model_runs.sql`

Do not rerun the base schema on a populated database. Run each unapplied migration once and stop if SQL reports an error.

## Deploy the Python ML service

1. Push the whole repository to GitHub.
2. In Render, create a Blueprint from the repository using the root `render.yaml`.
3. Render builds `ml-service/Dockerfile`, starts FastAPI, and generates `ML_API_SECRET`.
4. After deployment, verify `https://YOUR-ML-SERVICE/health` reports `status: ok` and both model names.
5. Copy the Render-generated `ML_API_SECRET` into Vercel's server-only `ML_API_SECRET` environment variable. Set `ML_API_URL` to the Render service base URL (no `/forecast` suffix).
6. Redeploy the Vercel app after setting variables.

The secret must be identical in Render and Vercel. Never expose it with a `NEXT_PUBLIC_` prefix.

## Deploy the Next.js app to GitHub and Vercel

1. Ensure `.env.local` is not tracked (`.gitignore` excludes `.env*`, except `.env.example`).
2. Run `npm install` locally first. It should generate `package-lock.json`; commit `package.json`, the generated lockfile, source files, SQL migrations, and tests. The authoring environment could not generate a lockfile because npm registry access timed out.
3. Push to a **private** GitHub repository because this is operational maintenance software.
4. Wait for the GitHub Actions CI checks to pass.
5. Import the repository into Vercel and configure the variables from `.env.example` in **Project Settings → Environment Variables**.
6. Add `ML_API_URL` and `ML_API_SECRET` after deploying the Python service.
7. Deploy a Preview first; test planner sign-in, `/api/health`, an ML comparison, saving a provisional forecast, and reloading saved predictions.
8. Promote to Production only after those tests pass.

## Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: project base URL, e.g. `https://<project-ref>.supabase.co` (not `/rest/v1/`).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public/anon key for the Supabase browser client.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only privileged key; never expose in browser code or GitHub.
- `PLANNER_EMAIL`: exact email allowlisted for server-side write routes.
- `ML_API_URL`: base URL for the separately hosted Python ML service.
- `ML_API_SECRET`: server-only shared secret, matching the Render service secret.
- Google Sheets variables are optional unless using the Sheets preview.

If a privileged Supabase key was shared or committed, rotate it before using operational data.

## Model and data limitations

- Random Forest and XGBoost target the **next observed odometer usage interval**, using only features available at the forecast timestamp.
- Validation is chronological and reports MAE in km/day against a median training-rate baseline. A model can produce a usage estimate without beating the baseline; the UI disables it as a saved forecast method unless its chronological-holdout MAE beats the median baseline.
- The hybrid forecast is the median of available rule-based/RF/XGBoost usage-rate estimates. It is a robust comparison method, not a separately trained model. RF, XGBoost and hybrid choices are enabled only when their chronological-holdout MAE beats the median-rate baseline.
- A last-service date/odometer is used for PM date calculation; it is not a labelled failure outcome. Component-failure or remaining-useful-life models need verified fault/failure labels.
- Imported source odometer rows remain review-only. This app does not automatically approve readings into operational history.
- PM1=5,000 km, PM2=15,000 km, PM3=25,000 km, then +10,000 km for each subsequent PM. The calendar interval must come from an approved maintenance source; no default interval is assumed.

## Tests

```bash
npm run lint
npm run typecheck
npm run test:config
npm run test:forecast
python -m pytest ml/tests -q
cd ml-service && python -m pytest -q
```

Full deployment readiness is determined by the GitHub Actions checks and a live end-to-end test against your own Supabase and Render projects. No source package can certify live credentials or external service availability without those tests.
