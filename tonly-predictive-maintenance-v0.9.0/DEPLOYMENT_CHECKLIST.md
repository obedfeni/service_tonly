# v0.9 deployment checklist

## Before pushing
- [ ] `npm install` succeeds and `package-lock.json` is committed.
- [ ] `npm run lint`, `npm run typecheck`, config tests and forecast tests pass.
- [ ] Python 3.12 tests pass for both `ml/` and `ml-service/`.
- [ ] `npm run build` succeeds.
- [ ] `.env.local` is not staged or committed.
- [ ] Any previously exposed Supabase service-role key has been rotated.

## Supabase
- [ ] Planner email/password user exists and email verification is complete if required.
- [ ] Apply unapplied migrations 001–005 in order; do not rerun `schema.sql` on a populated DB.
- [ ] `ml_model_runs` exists with RLS enabled and no public write policy.

## Render ML service
- [ ] Deploy the root `render.yaml` Blueprint.
- [ ] Set/confirm `ML_API_SECRET` in Render.
- [ ] `/health` returns `status: ok` and the RF/XGBoost model names.
- [ ] `POST /forecast` rejects missing/wrong Bearer tokens.

## Vercel
- [ ] Configure `NEXT_PUBLIC_SUPABASE_URL` (base project URL), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PLANNER_EMAIL`, `ML_API_URL`, and `ML_API_SECRET`.
- [ ] Set the same ML secret in Render and Vercel.
- [ ] Build and deploy a Preview.
- [ ] Test sign-in, import preview, ML comparison, model-run persistence, forecast save and retrieval.
- [ ] Promote to Production only after all tests pass.
