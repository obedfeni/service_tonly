# Deploying the Random Forest + XGBoost service

The ML service is separate from Next.js because scikit-learn and XGBoost are Python libraries. Vercel hosts the web app; Render hosts the Python model API.

1. Push the full repository to GitHub.
2. In Render, create a new Blueprint and select this repository. Render reads root `render.yaml` and builds `ml-service/Dockerfile`.
3. Wait for the service to become healthy. Open `/health`; it should report `status: ok`, the service version, both model names and whether a secret is configured.
4. In Render environment settings, copy the generated `ML_API_SECRET` value (do not share it in chat).
5. In Vercel Project Settings → Environment Variables, set `ML_API_URL` to the service base URL (for example `https://tonly-predictive-maintenance-ml.onrender.com`) and set `ML_API_SECRET` to the same value.
6. Redeploy Vercel so the server route sees the new environment variables.
7. From the app, sign in as the planner, load a valid charging log and run the ML comparison.

The API requires `Authorization: Bearer <ML_API_SECRET>`. Do not add the secret to a `NEXT_PUBLIC_` variable or browser request. The Next.js server route is the only component that calls the ML service.

## Model behavior

The service trains Random Forest and XGBoost using actual, valid odometer intervals from the supplied charging log. It predicts the next observed usage rate (km/day), validates chronologically, and reports MAE on held-out examples. If the dataset does not have enough examples, the service returns `insufficient_data` rather than generating fake ML predictions. It does not predict component failures.
