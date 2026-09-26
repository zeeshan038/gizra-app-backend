/** GeoJSON order: [longitude, latitude] (WGS84 / EPSG:4326). */
export type LngLatPair = [number, number];

export function normalizePolygonRing(coords: LngLatPair[]): LngLatPair[] {
  if (coords.length < 3) {
    throw new Error('coordinates must have at least 3 points');
  }
  for (const [lng, lat] of coords) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      throw new Error('invalid coordinate');
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error('coordinate out of range');
    }
  }
  const ring = coords.map(([lng, lat]) => [lng, lat] as LngLatPair);
  const [fLng, fLat] = ring[0];
  const [lLng, lLat] = ring[ring.length - 1];
  if (fLng !== lLng || fLat !== lLat) {
    ring.push([fLng, fLat]);
  }
  return ring;
}

export function ringToPolygonWkt(ring: LngLatPair[]): string {
  const closed = normalizePolygonRing(ring);
  const pairs = closed.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `POLYGON((${pairs}))`;
}

/** Legacy mobile-friendly ring: array of { lat, lng } */
export function ringToFormattedCoordinates(ring: LngLatPair[]): { lat: number; lng: number }[] {
  const closed = normalizePolygonRing(ring);
  return closed.map(([lng, lat]) => ({ lat, lng }));
}

/** Parse GeoJSON Polygon outer ring to LngLat pairs. */
export function geoJsonPolygonToRing(geo: {
  type?: string;
  coordinates?: number[][][];
}): LngLatPair[] | null {
  if (geo?.type !== 'Polygon' || !geo.coordinates?.[0]?.length) {
    return null;
  }
  return geo.coordinates[0].map((c) => [Number(c[0]), Number(c[1])] as LngLatPair);
}
