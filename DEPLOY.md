# Deploy Guide

## Target Setup

- Backend API: `GolfWeb` on Render (or any .NET host)
- Frontend: `Visualization` on Vercel (static)

## 1) Deploy Backend (`GolfWeb`) to Render

Use the root `render.yaml`:

- Service name: `golfweb-api`
- Root dir: `GolfWeb`
- Build: `dotnet publish GolfWeb.csproj -c Release -o out`
- Start: `dotnet out/GolfWeb.dll`

After deploy, note your backend URL, for example:

- `https://golfweb-api.onrender.com`

Set Render environment variable:

- `Cors__AllowedOrigins__0=https://<your-vercel-app>.vercel.app`

Optional path overrides (if needed):

- `AppPaths__VisualizationDataPath`
- `AppPaths__CourseGeometryPath`
- `AppPaths__CsvPath`
- `AppPaths__SmartDistancesPath`
- `AppPaths__DashboardPath`
- `AppPaths__SimulationSettingsPath`

## 2) Deploy Frontend (`Visualization`) to Vercel

Create a Vercel project with root directory set to:

- `Visualization`

The `Visualization/vercel.json` is already included.

## 3) Connect Frontend to Backend

Open frontend with API base query parameter:

```text
https://<your-vercel-app>.vercel.app/?apiBase=https://<your-backend-host>
```

Example:

```text
https://golf-viz.vercel.app/?apiBase=https://golfweb-api.onrender.com
```

## 4) Smoke Test

- `GET https://<backend>/api/health`
- Open frontend URL with `apiBase` query
- Run `Run Sim API` from top bar
