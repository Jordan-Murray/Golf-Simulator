# Visualization Geometry

The viewer can render real hole layouts from:

- `Visualization/data/visualization_data.json` (shots/pin from scraper export)
- `Visualization/data/course_geometry.json` (optional hole polygons)

If `course_geometry.json` is missing or a hole is not defined, the viewer falls back to procedural fairway/green.

## API Mode

The viewer now prefers API endpoints when available:

- `/api/data/visualization`
- `/api/data/geometry`
- `/api/simulate` (for top-bar sim button)

If API endpoints are unavailable, it falls back to local files under `Visualization/data`.

To point a static deploy (for example Vercel) at a hosted backend:

- append `?apiBase=https://your-golfweb-api.example.com` to the viewer URL.

## `course_geometry.json` schema

```json
{
  "courses": [
    {
      "courseName": "Pottergate GC",
      "holes": [
        {
          "holeNumber": 1,
          "forceMirrored": false,
          "forceFlip180": false,
          "forceMirrorShots": false,
          "tee": [[x, z], [x, z], [x, z]],
          "fairway": [
            [[x, z], [x, z], [x, z]],
            [[x, z], [x, z], [x, z]]
          ],
          "green": [[x, z], [x, z], [x, z]],
          "bunkers": [
            [[x, z], [x, z], [x, z]]
          ],
          "water": [
            [[x, z], [x, z], [x, z]]
          ],
          "trees": [[x, z], [x, z]]
        }
      ]
    }
  ]
}
```

Notes:
- Coordinates are in the same local meter space as exported shot coordinates.
- Tee is `(0, 0)`.
- `x` is left/right, `z` is down-hole distance.
- Polygons should be ordered around the shape (clockwise or anti-clockwise).
- Minimum 3 points per polygon.
- Optional per-hole overrides:
  - `forceMirrored`: `true|false` to force mirror mode
  - `forceFlip180`: `true|false` to force 180-degree rotation
  - `forceMirrorShots`: `true|false` to mirror shot tracks about tee->pin axis (use only when geometry orientation is correct but shots appear laterally inverted)
  - If unset, the viewer auto-evaluates both mirrored/non-mirrored and selects best fit from shot geometry.

## How to map a real hole quickly

1. Export `visualization_data.json` from Arccos scraper.
2. Open the viewer and inspect shot positions for that hole.
3. Draw fairway/green polygons around where shots actually lie.
4. Add bunker/water polygons and optional tree points.
5. Refresh the viewer.

## GeoJSON/KML conversion pipeline

You can now generate `course_geometry.json` directly from ArccosScraper:

1. Run `ArccosScraper`.
2. Ensure shot CSV exists (`option 2` first if needed).
3. Optional: choose `option 7` to validate the source file first.
4. Choose `option 6` (`Import Course Geometry (GeoJSON/KML)`).
5. Provide source file path (`.geojson`, `.json`, or `.kml`).
6. Accept default output path (or set your own).

The importer:
- Matches each feature to `courseName + holeNumber`.
- Reads tee/pin references from `arccos_shot_data_comprehensive.csv`.
- Converts lat/lon to local tee-based meters.
- Rotates geometry so tee->pin aligns with the same visualization frame as shots.

### Required feature properties

GeoJSON/KML features should provide:
- `courseName` (or `course`)
- `holeNumber` (or `hole`)
- `featureType` (or `type`/`surface`) with one of:
  - `fairway`
  - `tee`
  - `green`
  - `bunker` (or `sand`)
  - `water`
  - `trees`

Notes:
- Polygon geometries map to tee/fairway/green/bunkers/water.
- Point or MultiPoint geometries map to trees.
- In KML, if fields are missing, the importer will also try parsing from Placemark name (e.g. `Hole 4 Fairway`).
