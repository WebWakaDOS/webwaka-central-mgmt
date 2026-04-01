import { describe, it, expect, beforeEach } from 'vitest';
import { GeolocationEngine } from './index';

describe('CORE-9: Geolocation & Mapping Engine', () => {
  let geoEngine: GeolocationEngine;

  beforeEach(() => {
    geoEngine = new GeolocationEngine('osm');
  });

  it('should calculate distance and ETA between two points', async () => {
    const origin = { lat: 6.5244, lng: 3.3792 }; // Lagos
    const destination = { lat: 9.0579, lng: 7.4951 }; // Abuja

    const route = await geoEngine.calculateRoute(origin, destination);

    expect(route.distanceMeters).toBeGreaterThan(500000);
    expect(route.distanceMeters).toBeLessThan(600000);
    expect(route.durationSeconds).toBeGreaterThan(0);
    expect(route.polyline).toBeDefined();
  });

  it('should correctly identify if a point is within a geofence', () => {
    const center = { lat: 6.5244, lng: 3.3792 }; // Lagos
    const pointInside = { lat: 6.5300, lng: 3.3800 };
    const pointOutside = { lat: 9.0579, lng: 7.4951 }; // Abuja

    expect(geoEngine.isWithinGeofence(pointInside, center, 5000)).toBe(true);
    expect(geoEngine.isWithinGeofence(pointOutside, center, 5000)).toBe(false);
  });

  it('should default to OSM provider when none is specified', async () => {
    const defaultEngine = new GeolocationEngine();
    const origin = { lat: 6.5244, lng: 3.3792 };
    const destination = { lat: 6.6018, lng: 3.3515 }; // Victoria Island
    const route = await defaultEngine.calculateRoute(origin, destination);
    expect(route.distanceMeters).toBeGreaterThan(0);
  });

  it('should support google and mapbox providers', async () => {
    for (const provider of ['google', 'mapbox'] as const) {
      const engine = new GeolocationEngine(provider);
      const route = await engine.calculateRoute(
        { lat: 6.5244, lng: 3.3792 },
        { lat: 6.4550, lng: 3.3841 }
      );
      expect(route.distanceMeters).toBeGreaterThan(0);
      expect(route.durationSeconds).toBeGreaterThan(0);
    }
  });

  it('should return zero distance for identical coordinates', async () => {
    const point = { lat: 6.5244, lng: 3.3792 };
    const route = await geoEngine.calculateRoute(point, point);
    expect(route.distanceMeters).toBe(0);
  });

  it('should return true when point is exactly at center of geofence', () => {
    const center = { lat: 6.5244, lng: 3.3792 };
    expect(geoEngine.isWithinGeofence(center, center, 1)).toBe(true);
  });

  it('should compute duration based on distance', async () => {
    const origin = { lat: 6.5244, lng: 3.3792 };
    const destination = { lat: 9.0579, lng: 7.4951 };
    const route = await geoEngine.calculateRoute(origin, destination);
    // At ~8.33 m/s, 536km should take well over 10000 seconds
    expect(route.durationSeconds).toBeGreaterThan(10000);
  });
});
