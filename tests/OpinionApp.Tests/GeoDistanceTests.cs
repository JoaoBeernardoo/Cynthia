using OpinionApp.Domain;

namespace OpinionApp.Tests;

public sealed class GeoDistanceTests
{
    [Fact]
    public void SameCoordinatesHaveZeroDistance()
    {
        Assert.Equal(0, GeoDistance.InMeters(-22.9711, -43.1822, -22.9711, -43.1822), precision: 6);
    }

    [Fact]
    public void OneDegreeOfLatitudeIsAbout111Kilometers()
    {
        var distance = GeoDistance.InMeters(0, 0, 1, 0);

        Assert.InRange(distance, 111_000, 111_300);
    }

    [Fact]
    public void DistanceIsSymmetric()
    {
        var forward = GeoDistance.InMeters(-23.55, -46.63, -22.91, -43.17);
        var reverse = GeoDistance.InMeters(-22.91, -43.17, -23.55, -46.63);

        Assert.Equal(forward, reverse, precision: 6);
    }
}
