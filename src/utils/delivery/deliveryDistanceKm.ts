import { distanceMatrix } from '../consumer/googlePlaces';
import { distanceKm } from '../consumer/favouriteHelpers';

type GoogleDistanceMatrixResponse = {
  status?: string;
  rows?: Array<{
    elements?: Array<{
      status?: string;
      distance?: { value?: number };
    }>;
  }>;
};

/** Road distance via Google Distance Matrix (walking), with haversine fallback. */
export async function resolveDeliveryDistanceKm(params: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}): Promise<{ distance_km: number; source: 'google' | 'haversine' }> {
  const { originLat, originLng, destinationLat, destinationLng } = params;

  try {
    const raw = (await distanceMatrix({
      originLat: String(originLat),
      originLng: String(originLng),
      destinationLat: String(destinationLat),
      destinationLng: String(destinationLng),
    })) as GoogleDistanceMatrixResponse;

    const meters = raw?.rows?.[0]?.elements?.[0]?.distance?.value;
    if (raw?.status === 'OK' && typeof meters === 'number' && meters >= 0) {
      return {
        distance_km: Math.round((meters / 1000) * 1000) / 1000,
        source: 'google',
      };
    }
  } catch {
    /* fall through to haversine */
  }

  const km = distanceKm(originLat, originLng, destinationLat, destinationLng);
  return {
    distance_km: Math.round(km * 1000) / 1000,
    source: 'haversine',
  };
}
