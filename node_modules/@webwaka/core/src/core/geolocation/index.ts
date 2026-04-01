/**
 * CORE-9: Geolocation & Mapping Engine
 * Blueprint Reference: Part 10.3 (Transport), Part 10.4 (Logistics)
 * 
 * Vendor-neutral abstraction layer for maps, routing, and geocoding.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Route {
  distanceMeters: number;
  durationSeconds: number;
  polyline: string;
}

export class GeolocationEngine {
  private provider: 'google' | 'mapbox' | 'osm';

  constructor(provider: 'google' | 'mapbox' | 'osm' = 'osm') {
    this.provider = provider;
  }

  /**
   * Calculates the distance and ETA between two points.
   */
  async calculateRoute(origin: Coordinates, destination: Coordinates): Promise<Route> {
    // In a real implementation, this would call the respective provider's API
    // For now, we return a mock calculation based on straight-line distance
    
    const distance = this.calculateStraightLineDistance(origin, destination);
    // Assume average speed of 30 km/h (8.33 m/s) in city traffic
    const duration = Math.floor(distance / 8.33);

    return {
      distanceMeters: Math.floor(distance),
      durationSeconds: duration,
      polyline: 'mock_polyline_data'
    };
  }

  /**
   * Checks if a coordinate is within a specific geofence (radius in meters).
   */
  isWithinGeofence(point: Coordinates, center: Coordinates, radiusMeters: number): boolean {
    const distance = this.calculateStraightLineDistance(point, center);
    return distance <= radiusMeters;
  }

  /**
   * Haversine formula to calculate distance between two coordinates in meters.
   */
  private calculateStraightLineDistance(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = coord1.lat * Math.PI / 180;
    const φ2 = coord2.lat * Math.PI / 180;
    const Δφ = (coord2.lat - coord1.lat) * Math.PI / 180;
    const Δλ = (coord2.lng - coord1.lng) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}
