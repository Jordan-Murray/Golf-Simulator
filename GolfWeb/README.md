# GolfWeb

Single-host web app that serves:

- The 3D visualization at `/viz`
- JSON data APIs at `/api/*`

## Run

```powershell
dotnet run --project .\GolfWeb\GolfWeb.csproj
```

Then open:

- `http://localhost:5000/viz/` (or the URL shown in console)

## API Endpoints

- `GET /api/health`
- `GET /api/data/latest?count=20`
- `GET /api/data/visualization`
- `GET /api/data/geometry`
- `POST /api/simulate`

## Notes

- Data is read from `Visualization/data/visualization_data.json`.
- Geometry is read from `Visualization/data/course_geometry.json`.
- If `visualization_data.json` is missing, run the Arccos scraper export flow first.

## Deploy Configuration

`GolfWeb` supports config-driven paths and CORS via `appsettings`/environment variables.

### CORS

```json
"Cors": {
  "AllowedOrigins": [
    "https://your-vercel-app.vercel.app"
  ]
}
```

Environment variable equivalent:

```text
Cors__AllowedOrigins__0=https://your-vercel-app.vercel.app
```

### Data Paths

`AppPaths` keys:

- `VisualizationRoot`
- `VisualizationDataPath`
- `CourseGeometryPath`
- `CsvPath`
- `SmartDistancesPath`
- `DashboardPath`
- `SimulationSettingsPath`

Environment variable example:

```text
AppPaths__CsvPath=/data/arccos_shot_data_comprehensive.csv
```

## Vercel + GolfWeb

- Deploy `Visualization` as static frontend on Vercel.
- Deploy `GolfWeb` on a .NET host (Render/Azure/etc).
- Point frontend to backend API with query parameter:
  - `https://your-vercel-app.vercel.app/?apiBase=https://your-golfweb-api.example.com`

## Simulate Example

```powershell
$body = @{
  courseName = "Pottergate GC"
  holes = 9
  rounds = 3
  verbose = $false
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:5000/api/simulate" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```
