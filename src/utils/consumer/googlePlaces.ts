/** Server-only Google Maps / Places key — set GOOGLE_MAPS_API_KEY in backend .env (never ship to apps). */
export function resolveGoogleMapsServerApiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
}

function mapsApiKey(): string | null {
  return resolveGoogleMapsServerApiKey();
}

async function googleGet(path: string, params: Record<string, string>) {
  const key = mapsApiKey();
  if (!key) {
    throw new Error(
      'Google Maps API key is not configured. Set GOOGLE_MAPS_API_KEY in the backend .env.'
    );
  }
  const url = new URL(`https://maps.googleapis.com/maps/api/${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set('key', key);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Maps request failed (${res.status})`);
  }
  return res.json();
}

export async function placeAutocomplete(searchText: string) {
  return googleGet('place/autocomplete/json', { input: searchText });
}

export async function placeDetails(placeId: string) {
  return googleGet('place/details/json', { placeid: placeId });
}

export async function distanceMatrix(params: {
  originLat: string;
  originLng: string;
  destinationLat: string;
  destinationLng: string;
}) {
  return googleGet('distancematrix/json', {
    origins: `${params.originLat},${params.originLng}`,
    destinations: `${params.destinationLat},${params.destinationLng}`,
    mode: 'walking',
  });
}

export async function geocodeLatLng(lat: string, lng: string) {
  return googleGet('geocode/json', { latlng: `${lat},${lng}` });
}
