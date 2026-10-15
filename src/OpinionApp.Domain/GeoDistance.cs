namespace OpinionApp.Domain;

public static class GeoDistance
{
    private const double EarthRadiusMeters = 6_371_000;

    public static double InMeters(double latitude1, double longitude1, double latitude2, double longitude2)
    {
        var deltaLatitude = (latitude2 - latitude1) * Math.PI / 180;
        var deltaLongitude = (longitude2 - longitude1) * Math.PI / 180;
        var haversine = Math.Pow(Math.Sin(deltaLatitude / 2), 2)
            + Math.Cos(latitude1 * Math.PI / 180) * Math.Cos(latitude2 * Math.PI / 180)
            * Math.Pow(Math.Sin(deltaLongitude / 2), 2);
        return EarthRadiusMeters * 2 * Math.Asin(Math.Min(1, Math.Sqrt(haversine)));
    }
}
