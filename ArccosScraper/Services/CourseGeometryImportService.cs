using Microsoft.VisualBasic.FileIO;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Xml.Linq;

namespace ArccosScraper.Services;

public static class CourseGeometryImportService
{
    public static void ValidateSource(string sourcePath)
    {
        if (!File.Exists(sourcePath))
            throw new FileNotFoundException("Geometry source file not found.", sourcePath);

        var extension = Path.GetExtension(sourcePath).ToLowerInvariant();
        switch (extension)
        {
            case ".geojson":
            case ".json":
                ValidateGeoJson(sourcePath);
                break;
            case ".kml":
                ValidateKml(sourcePath);
                break;
            default:
                throw new InvalidOperationException("Unsupported geometry format. Use .geojson/.json or .kml.");
        }
    }

    public static void Import(string sourcePath, string csvPath, string outputPath)
    {
        if (!File.Exists(sourcePath))
            throw new FileNotFoundException("Geometry source file not found.", sourcePath);
        if (!File.Exists(csvPath))
            throw new FileNotFoundException("Shot CSV file not found.", csvPath);

        var references = LoadHoleReferences(csvPath);
        if (references.Count == 0)
            throw new InvalidOperationException("No valid tee/pin references found in shot CSV.");

        var extension = Path.GetExtension(sourcePath).ToLowerInvariant();
        var features = extension switch
        {
            ".geojson" or ".json" => ReadGeoJson(sourcePath),
            ".kml" => ReadKml(sourcePath),
            _ => throw new InvalidOperationException("Unsupported geometry format. Use .geojson/.json or .kml.")
        };

        var output = LoadExistingOutputOrNew(outputPath);
        var clearedFeatureSlots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var mapped = 0;
        var skipped = 0;

        foreach (var feature in features)
        {
            var key = new HoleKey(feature.CourseName, feature.HoleNumber);
            if (!references.TryGetValue(key, out var holeRef))
            {
                skipped++;
                continue;
            }

            var course = GetOrAddCourse(output, feature.CourseName);
            var hole = GetOrAddHole(course, feature.HoleNumber);
            EnsureFeatureSlotCleared(hole, feature.Type, feature.CourseName, feature.HoleNumber, clearedFeatureSlots);

            var pinRaw = GpsToMeters(holeRef.PinLat, holeRef.PinLng, holeRef.TeeLat, holeRef.TeeLng);
            var angle = Math.Atan2(pinRaw.x, pinRaw.z);

            switch (feature.Type)
            {
                case GeometryType.Tee:
                    ApplyPrimaryPolygon(feature.Polygons, holeRef, angle, p => hole.Tee = p, hole.Tee);
                    break;
                case GeometryType.Fairway:
                    foreach (var poly in feature.Polygons)
                    {
                        var transformed = TransformPolygon(poly, holeRef, angle);
                        if (transformed.Count >= 3) hole.Fairway.Add(transformed);
                    }
                    break;
                case GeometryType.Green:
                    ApplyPrimaryPolygon(feature.Polygons, holeRef, angle, p => hole.Green = p, hole.Green);
                    break;
                case GeometryType.Bunker:
                    foreach (var poly in feature.Polygons)
                    {
                        var transformed = TransformPolygon(poly, holeRef, angle);
                        if (transformed.Count >= 3) hole.Bunkers.Add(transformed);
                    }
                    break;
                case GeometryType.Water:
                    foreach (var poly in feature.Polygons)
                    {
                        var transformed = TransformPolygon(poly, holeRef, angle);
                        if (transformed.Count >= 3) hole.Water.Add(transformed);
                    }
                    break;
                case GeometryType.Trees:
                    foreach (var point in feature.Points)
                    {
                        var transformed = TransformPoint(point, holeRef, angle);
                        hole.Trees.Add(transformed);
                    }
                    break;
            }

            mapped++;
        }

        output.Courses = output.Courses
            .OrderBy(c => c.CourseName, StringComparer.OrdinalIgnoreCase)
            .Select(c =>
            {
                c.Holes = c.Holes.OrderBy(h => h.HoleNumber).ToList();
                return c;
            })
            .ToList();

        Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? Directory.GetCurrentDirectory());
        var options = new JsonSerializerOptions
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };
        File.WriteAllText(outputPath, JsonSerializer.Serialize(output, options));

        Console.WriteLine($"Geometry import complete. Mapped features: {mapped}, skipped (no tee/pin ref): {skipped}.");
        Console.WriteLine($"Saved: {Path.GetFullPath(outputPath)}");
    }

    private static Dictionary<HoleKey, HoleReference> LoadHoleReferences(string csvPath)
    {
        var bestByHole = new Dictionary<HoleKey, HoleReferenceCandidate>();
        using var parser = new TextFieldParser(csvPath);
        parser.SetDelimiters(",");
        parser.HasFieldsEnclosedInQuotes = true;
        parser.TrimWhiteSpace = false;

        _ = parser.ReadFields(); // header
        while (!parser.EndOfData)
        {
            var row = parser.ReadFields();
            if (row is null || row.Length < 31) continue;

            var courseName = row[2];
            if (!int.TryParse(row[12], out var holeNumber)) continue;
            if (!int.TryParse(row[18], out var shotNumber)) continue;
            if (!TryParseDouble(row[25], out var teeLat)) continue;
            if (!TryParseDouble(row[26], out var teeLng)) continue;
            if (!TryParseDouble(row[16], out var pinLat)) continue;
            if (!TryParseDouble(row[17], out var pinLng)) continue;

            DateTime.TryParse(row[21], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var shotTime);

            var key = new HoleKey(courseName, holeNumber);
            var candidate = new HoleReferenceCandidate(shotNumber, shotTime, teeLat, teeLng, pinLat, pinLng);

            if (!bestByHole.TryGetValue(key, out var current) || IsBetterReference(candidate, current))
            {
                bestByHole[key] = candidate;
            }
        }

        return bestByHole.ToDictionary(
            kvp => kvp.Key,
            kvp => new HoleReference(kvp.Value.TeeLat, kvp.Value.TeeLng, kvp.Value.PinLat, kvp.Value.PinLng));
    }

    private static CourseGeometryFile LoadExistingOutputOrNew(string outputPath)
    {
        if (!File.Exists(outputPath))
            return new CourseGeometryFile();

        try
        {
            var existing = JsonSerializer.Deserialize<CourseGeometryFile>(
                File.ReadAllText(outputPath),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            return existing ?? new CourseGeometryFile();
        }
        catch
        {
            return new CourseGeometryFile();
        }
    }

    private static void EnsureFeatureSlotCleared(
        CourseGeometryHole hole,
        GeometryType type,
        string courseName,
        int holeNumber,
        HashSet<string> cleared)
    {
        var key = $"{courseName}|{holeNumber}|{type}";
        if (!cleared.Add(key)) return;

        switch (type)
        {
            case GeometryType.Tee:
                hole.Tee = null;
                break;
            case GeometryType.Fairway:
                hole.Fairway = [];
                break;
            case GeometryType.Green:
                hole.Green = null;
                break;
            case GeometryType.Bunker:
                hole.Bunkers = [];
                break;
            case GeometryType.Water:
                hole.Water = [];
                break;
            case GeometryType.Trees:
                hole.Trees = [];
                break;
        }
    }

    private static bool IsBetterReference(HoleReferenceCandidate candidate, HoleReferenceCandidate current)
    {
        if (candidate.ShotNumber != current.ShotNumber)
            return candidate.ShotNumber < current.ShotNumber;
        return candidate.ShotTime > current.ShotTime;
    }

    private static List<GeometryFeature> ReadGeoJson(string path)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        var root = doc.RootElement;
        if (!root.TryGetProperty("features", out var featuresElement) || featuresElement.ValueKind != JsonValueKind.Array)
            throw new InvalidOperationException("GeoJSON must be a FeatureCollection with a 'features' array.");

        var features = new List<GeometryFeature>();
        foreach (var featureElement in featuresElement.EnumerateArray())
        {
            var properties = featureElement.TryGetProperty("properties", out var p) ? p : default;
            var geometry = featureElement.TryGetProperty("geometry", out var g) ? g : default;
            if (geometry.ValueKind == JsonValueKind.Undefined || geometry.ValueKind == JsonValueKind.Null) continue;

            var courseName = GetString(properties, "courseName")
                ?? GetString(properties, "course")
                ?? GetString(properties, "course_name")
                ?? "Unknown Course";
            var holeNumber = GetInt(properties, "holeNumber")
                ?? GetInt(properties, "hole")
                ?? GetInt(properties, "hole_no");
            if (!holeNumber.HasValue) continue;

            var rawType = GetString(properties, "featureType")
                ?? GetString(properties, "type")
                ?? GetString(properties, "surface")
                ?? GetString(properties, "name");
            var geomType = NormalizeType(rawType, defaultToTrees: IsPointGeometry(geometry));
            if (!geomType.HasValue) continue;

            var parsed = ParseGeoJsonGeometry(geometry);
            if (parsed is null) continue;

            features.Add(new GeometryFeature(courseName, holeNumber.Value, geomType.Value, parsed.Polygons, parsed.Points));
        }

        return features;
    }

    private static void ValidateGeoJson(string path)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        var root = doc.RootElement;
        if (!root.TryGetProperty("features", out var featuresElement) || featuresElement.ValueKind != JsonValueKind.Array)
            throw new InvalidOperationException("GeoJSON must be a FeatureCollection with a 'features' array.");

        var total = 0;
        var missingCourse = 0;
        var missingHole = 0;
        var missingType = 0;
        var unsupportedGeometry = 0;

        foreach (var featureElement in featuresElement.EnumerateArray())
        {
            total++;
            var properties = featureElement.TryGetProperty("properties", out var p) ? p : default;
            var geometry = featureElement.TryGetProperty("geometry", out var g) ? g : default;

            var courseName = GetString(properties, "courseName")
                ?? GetString(properties, "course")
                ?? GetString(properties, "course_name");
            var holeNumber = GetInt(properties, "holeNumber")
                ?? GetInt(properties, "hole")
                ?? GetInt(properties, "hole_no");
            var rawType = GetString(properties, "featureType")
                ?? GetString(properties, "type")
                ?? GetString(properties, "surface")
                ?? GetString(properties, "name");

            if (string.IsNullOrWhiteSpace(courseName)) missingCourse++;
            if (!holeNumber.HasValue) missingHole++;
            if (!NormalizeType(rawType, defaultToTrees: IsPointGeometry(geometry)).HasValue) missingType++;

            var geomType = geometry.TryGetProperty("type", out var t) ? t.GetString() : null;
            if (geomType is not ("Polygon" or "MultiPolygon" or "Point" or "MultiPoint"))
            {
                unsupportedGeometry++;
            }
        }

        Console.WriteLine($"\nGeoJSON validation for {Path.GetFullPath(path)}");
        Console.WriteLine($"Features: {total}");
        Console.WriteLine($"Missing courseName/course: {missingCourse}");
        Console.WriteLine($"Missing holeNumber/hole: {missingHole}");
        Console.WriteLine($"Missing/unknown featureType: {missingType}");
        Console.WriteLine($"Unsupported geometry types: {unsupportedGeometry}");
        Console.WriteLine(missingCourse + missingHole + missingType + unsupportedGeometry == 0
            ? "Validation passed."
            : "Validation has issues. Fix properties before import.");
    }

    private static List<GeometryFeature> ReadKml(string path)
    {
        var doc = XDocument.Load(path);
        XNamespace ns = "http://www.opengis.net/kml/2.2";

        var defaultCourseName = doc.Descendants(ns + "Document").Elements(ns + "name").FirstOrDefault()?.Value?.Trim()
            ?? "Unknown Course";

        var features = new List<GeometryFeature>();
        foreach (var placemark in doc.Descendants(ns + "Placemark"))
        {
            var name = placemark.Element(ns + "name")?.Value?.Trim() ?? string.Empty;

            var extData = placemark
                .Descendants(ns + "Data")
                .Where(d => d.Attribute("name") != null)
                .ToDictionary(
                    d => d.Attribute("name")!.Value,
                    d => d.Element(ns + "value")?.Value ?? string.Empty,
                    StringComparer.OrdinalIgnoreCase);

            var courseName = GetExtValue(extData, "courseName")
                ?? GetExtValue(extData, "course")
                ?? defaultCourseName;

            var holeNumber = TryParseInt(GetExtValue(extData, "holeNumber"))
                ?? TryParseInt(GetExtValue(extData, "hole"))
                ?? ParseHoleNumberFromName(name);
            if (!holeNumber.HasValue) continue;

            var rawType = GetExtValue(extData, "featureType")
                ?? GetExtValue(extData, "type")
                ?? GetExtValue(extData, "surface")
                ?? name;
            var geomType = NormalizeType(rawType, defaultToTrees: false);
            if (!geomType.HasValue) continue;

            var polygons = new List<List<GeoPoint>>();
            var points = new List<GeoPoint>();

            foreach (var polygon in placemark.Descendants(ns + "Polygon"))
            {
                var coordsText = polygon
                    .Descendants(ns + "outerBoundaryIs")
                    .Descendants(ns + "LinearRing")
                    .Elements(ns + "coordinates")
                    .FirstOrDefault()?.Value;
                var ring = ParseKmlCoordinateList(coordsText);
                if (ring.Count >= 3) polygons.Add(ring);
            }

            foreach (var point in placemark.Descendants(ns + "Point"))
            {
                var coordsText = point.Element(ns + "coordinates")?.Value;
                var parsed = ParseKmlCoordinateList(coordsText);
                if (parsed.Count > 0) points.Add(parsed[0]);
            }

            if (polygons.Count == 0 && points.Count == 0) continue;
            if (geomType == GeometryType.Trees && points.Count == 0)
            {
                points = polygons.SelectMany(p => p).ToList();
                polygons.Clear();
            }

            features.Add(new GeometryFeature(courseName, holeNumber.Value, geomType.Value, polygons, points));
        }

        return features;
    }

    private static void ValidateKml(string path)
    {
        var doc = XDocument.Load(path);
        XNamespace ns = "http://www.opengis.net/kml/2.2";

        var total = 0;
        var missingCourse = 0;
        var missingHole = 0;
        var missingType = 0;
        var unsupportedGeometry = 0;

        foreach (var placemark in doc.Descendants(ns + "Placemark"))
        {
            total++;
            var name = placemark.Element(ns + "name")?.Value?.Trim() ?? string.Empty;
            var extData = placemark
                .Descendants(ns + "Data")
                .Where(d => d.Attribute("name") != null)
                .ToDictionary(
                    d => d.Attribute("name")!.Value,
                    d => d.Element(ns + "value")?.Value ?? string.Empty,
                    StringComparer.OrdinalIgnoreCase);

            var courseName = GetExtValue(extData, "courseName")
                ?? GetExtValue(extData, "course");
            var holeNumber = TryParseInt(GetExtValue(extData, "holeNumber"))
                ?? TryParseInt(GetExtValue(extData, "hole"))
                ?? ParseHoleNumberFromName(name);
            var rawType = GetExtValue(extData, "featureType")
                ?? GetExtValue(extData, "type")
                ?? GetExtValue(extData, "surface")
                ?? name;

            if (string.IsNullOrWhiteSpace(courseName)) missingCourse++;
            if (!holeNumber.HasValue) missingHole++;
            if (!NormalizeType(rawType, defaultToTrees: false).HasValue) missingType++;

            var hasPolygon = placemark.Descendants(ns + "Polygon").Any();
            var hasPoint = placemark.Descendants(ns + "Point").Any();
            if (!hasPolygon && !hasPoint) unsupportedGeometry++;
        }

        Console.WriteLine($"\nKML validation for {Path.GetFullPath(path)}");
        Console.WriteLine($"Placemarks: {total}");
        Console.WriteLine($"Missing courseName/course: {missingCourse}");
        Console.WriteLine($"Missing holeNumber/hole: {missingHole}");
        Console.WriteLine($"Missing/unknown featureType: {missingType}");
        Console.WriteLine($"No Polygon/Point geometry: {unsupportedGeometry}");
        Console.WriteLine(missingCourse + missingHole + missingType + unsupportedGeometry == 0
            ? "Validation passed."
            : "Validation has issues. Fix properties before import.");
    }

    private static ParsedGeometry? ParseGeoJsonGeometry(JsonElement geometry)
    {
        if (!geometry.TryGetProperty("type", out var typeEl)) return null;
        var type = typeEl.GetString();
        if (string.IsNullOrWhiteSpace(type)) return null;
        if (!geometry.TryGetProperty("coordinates", out var coords)) return null;

        return type switch
        {
            "Polygon" => new ParsedGeometry(
                Polygons: ParsePolygonCoordinates(coords).Where(p => p.Count >= 3).ToList(),
                Points: []),
            "MultiPolygon" => new ParsedGeometry(
                Polygons: ParseMultiPolygonCoordinates(coords).Where(p => p.Count >= 3).ToList(),
                Points: []),
            "Point" => new ParsedGeometry(
                Polygons: [],
                Points: ParsePointCoordinates(coords).ToList()),
            "MultiPoint" => new ParsedGeometry(
                Polygons: [],
                Points: ParseMultiPointCoordinates(coords).ToList()),
            _ => null
        };
    }

    private static IEnumerable<GeoPoint> ParsePointCoordinates(JsonElement coords)
    {
        if (coords.ValueKind != JsonValueKind.Array || coords.GetArrayLength() < 2) yield break;
        if (!TryReadLonLat(coords, out var p)) yield break;
        yield return p;
    }

    private static IEnumerable<GeoPoint> ParseMultiPointCoordinates(JsonElement coords)
    {
        if (coords.ValueKind != JsonValueKind.Array) yield break;
        foreach (var point in coords.EnumerateArray())
        {
            if (TryReadLonLat(point, out var p)) yield return p;
        }
    }

    private static List<List<GeoPoint>> ParsePolygonCoordinates(JsonElement coords)
    {
        var polygons = new List<List<GeoPoint>>();
        if (coords.ValueKind != JsonValueKind.Array || coords.GetArrayLength() == 0) return polygons;

        // GeoJSON Polygon: [ [outer ring], [hole ring], ... ]
        var outerRing = coords[0];
        var parsed = ParseRing(outerRing);
        if (parsed.Count >= 3) polygons.Add(parsed);
        return polygons;
    }

    private static List<List<GeoPoint>> ParseMultiPolygonCoordinates(JsonElement coords)
    {
        var polygons = new List<List<GeoPoint>>();
        if (coords.ValueKind != JsonValueKind.Array) return polygons;

        foreach (var polygon in coords.EnumerateArray())
        {
            if (polygon.ValueKind != JsonValueKind.Array || polygon.GetArrayLength() == 0) continue;
            var outerRing = polygon[0];
            var parsed = ParseRing(outerRing);
            if (parsed.Count >= 3) polygons.Add(parsed);
        }

        return polygons;
    }

    private static List<GeoPoint> ParseRing(JsonElement ring)
    {
        var points = new List<GeoPoint>();
        if (ring.ValueKind != JsonValueKind.Array) return points;

        foreach (var coord in ring.EnumerateArray())
        {
            if (TryReadLonLat(coord, out var p))
                points.Add(p);
        }
        return points;
    }

    private static bool TryReadLonLat(JsonElement coord, out GeoPoint point)
    {
        point = default;
        if (coord.ValueKind != JsonValueKind.Array || coord.GetArrayLength() < 2) return false;
        if (!coord[0].TryGetDouble(out var lon)) return false;
        if (!coord[1].TryGetDouble(out var lat)) return false;
        point = new GeoPoint(lat, lon);
        return true;
    }

    private static List<GeoPoint> ParseKmlCoordinateList(string? text)
    {
        var points = new List<GeoPoint>();
        if (string.IsNullOrWhiteSpace(text)) return points;

        var chunks = text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        foreach (var chunk in chunks)
        {
            var parts = chunk.Split(',', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2) continue;
            if (!double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var lon)) continue;
            if (!double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var lat)) continue;
            points.Add(new GeoPoint(lat, lon));
        }
        return points;
    }

    private static void ApplyPrimaryPolygon(
        List<List<GeoPoint>> polygons,
        HoleReference holeRef,
        double angle,
        Action<List<double[]>> setPrimary,
        List<double[]>? existing)
    {
        if (polygons.Count == 0) return;
        var transformed = polygons
            .Select(p => TransformPolygon(p, holeRef, angle))
            .Where(p => p.Count >= 3)
            .ToList();

        if (transformed.Count == 0) return;
        var bestIncoming = transformed.OrderByDescending(PolygonArea).First();
        if (existing is null || existing.Count < 3 || PolygonArea(bestIncoming) > PolygonArea(existing))
        {
            setPrimary(bestIncoming);
        }
    }

    private static List<double[]> TransformPolygon(List<GeoPoint> polygon, HoleReference holeRef, double angle)
    {
        var transformed = new List<double[]>(polygon.Count);
        foreach (var point in polygon)
        {
            transformed.Add(TransformPoint(point, holeRef, angle));
        }
        return transformed;
    }

    private static double[] TransformPoint(GeoPoint point, HoleReference holeRef, double angle)
    {
        var raw = GpsToMeters(point.Lat, point.Lng, holeRef.TeeLat, holeRef.TeeLng);
        var rotated = RotatePoint(raw.x, raw.z, -angle);
        return [Round2(rotated.x), Round2(rotated.z)];
    }

    private static double PolygonArea(List<double[]> polygon)
    {
        if (polygon.Count < 3) return 0;
        var area = 0d;
        for (var i = 0; i < polygon.Count; i++)
        {
            var a = polygon[i];
            var b = polygon[(i + 1) % polygon.Count];
            area += (a[0] * b[1]) - (b[0] * a[1]);
        }
        return Math.Abs(area) * 0.5;
    }

    private static CourseGeometryCourse GetOrAddCourse(CourseGeometryFile file, string courseName)
    {
        var course = file.Courses.FirstOrDefault(c =>
            string.Equals(c.CourseName, courseName, StringComparison.OrdinalIgnoreCase));
        if (course is not null) return course;

        course = new CourseGeometryCourse { CourseName = courseName };
        file.Courses.Add(course);
        return course;
    }

    private static CourseGeometryHole GetOrAddHole(CourseGeometryCourse course, int holeNumber)
    {
        var hole = course.Holes.FirstOrDefault(h => h.HoleNumber == holeNumber);
        if (hole is not null) return hole;

        hole = new CourseGeometryHole { HoleNumber = holeNumber };
        course.Holes.Add(hole);
        return hole;
    }

    private static GeometryType? NormalizeType(string? rawType, bool defaultToTrees)
    {
        if (string.IsNullOrWhiteSpace(rawType))
            return defaultToTrees ? GeometryType.Trees : null;

        var s = rawType.Trim().ToLowerInvariant();
        if (s.Contains("tee")) return GeometryType.Tee;
        if (s.Contains("fairway")) return GeometryType.Fairway;
        if (s.Contains("green")) return GeometryType.Green;
        if (s.Contains("bunker") || s.Contains("sand")) return GeometryType.Bunker;
        if (s.Contains("water") || s.Contains("pond") || s.Contains("lake")) return GeometryType.Water;
        if (s.Contains("tree")) return GeometryType.Trees;
        return defaultToTrees ? GeometryType.Trees : null;
    }

    private static bool IsPointGeometry(JsonElement geometry)
    {
        var type = geometry.TryGetProperty("type", out var t) ? t.GetString() : null;
        return type is "Point" or "MultiPoint";
    }

    private static string? GetString(JsonElement properties, string name)
    {
        if (properties.ValueKind != JsonValueKind.Object) return null;
        if (!properties.TryGetProperty(name, out var el)) return null;
        return el.ValueKind switch
        {
            JsonValueKind.String => el.GetString(),
            JsonValueKind.Number => el.GetRawText(),
            _ => null
        };
    }

    private static int? GetInt(JsonElement properties, string name)
    {
        if (properties.ValueKind != JsonValueKind.Object) return null;
        if (!properties.TryGetProperty(name, out var el)) return null;
        if (el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out var i)) return i;
        if (el.ValueKind == JsonValueKind.String && int.TryParse(el.GetString(), out i)) return i;
        return null;
    }

    private static string? GetExtValue(Dictionary<string, string> extData, string name) =>
        extData.TryGetValue(name, out var value) ? value : null;

    private static int? ParseHoleNumberFromName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var match = System.Text.RegularExpressions.Regex.Match(name, @"\bhole\s*(\d+)\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (!match.Success) return null;
        return int.TryParse(match.Groups[1].Value, out var hole) ? hole : null;
    }

    private static int? TryParseInt(string? value) =>
        int.TryParse(value, out var i) ? i : null;

    private static bool TryParseDouble(string value, out double result) =>
        double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out result);

    private static (double x, double z) GpsToMeters(double lat, double lng, double originLat, double originLng)
    {
        const double metersPerDegree = 111_320.0;
        var x = (lng - originLng) * metersPerDegree * Math.Cos(originLat * Math.PI / 180.0);
        var z = (lat - originLat) * metersPerDegree;
        return (x, z);
    }

    private static (double x, double z) RotatePoint(double x, double z, double angle)
    {
        var cos = Math.Cos(angle);
        var sin = Math.Sin(angle);
        return (x * cos - z * sin, x * sin + z * cos);
    }

    private static double Round2(double value) => Math.Round(value, 2);

    private enum GeometryType
    {
        Tee,
        Fairway,
        Green,
        Bunker,
        Water,
        Trees
    }

    private sealed record ParsedGeometry(List<List<GeoPoint>> Polygons, List<GeoPoint> Points);
    private sealed record GeometryFeature(string CourseName, int HoleNumber, GeometryType Type, List<List<GeoPoint>> Polygons, List<GeoPoint> Points);
    private readonly record struct GeoPoint(double Lat, double Lng);
    private sealed record HoleReference(double TeeLat, double TeeLng, double PinLat, double PinLng);
    private sealed record HoleReferenceCandidate(int ShotNumber, DateTime ShotTime, double TeeLat, double TeeLng, double PinLat, double PinLng);
    private readonly record struct HoleKey(string CourseName, int HoleNumber)
    {
        public bool Equals(HoleKey other) =>
            HoleNumber == other.HoleNumber &&
            string.Equals(CourseName, other.CourseName, StringComparison.OrdinalIgnoreCase);

        public override int GetHashCode() =>
            HashCode.Combine(StringComparer.OrdinalIgnoreCase.GetHashCode(CourseName ?? string.Empty), HoleNumber);
    }
}

public sealed class CourseGeometryFile
{
    public List<CourseGeometryCourse> Courses { get; set; } = [];
}

public sealed class CourseGeometryCourse
{
    public string CourseName { get; set; } = string.Empty;
    public List<CourseGeometryHole> Holes { get; set; } = [];
}

public sealed class CourseGeometryHole
{
    public int HoleNumber { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? ForceMirrored { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? ForceFlip180 { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? ForceMirrorShots { get; set; }
    public List<double[]>? Tee { get; set; }
    public List<List<double[]>> Fairway { get; set; } = [];
    public List<double[]>? Green { get; set; }
    public List<List<double[]>> Bunkers { get; set; } = [];
    public List<List<double[]>> Water { get; set; } = [];
    public List<double[]> Trees { get; set; } = [];
}
