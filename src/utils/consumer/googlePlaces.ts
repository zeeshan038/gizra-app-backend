import { getBusinessSetting } from './businessSettings';

async function mapsApiKey(): Promise<string | null> {
  const server = await getBusinessSetting('map_api_key_server');
  if (server?.trim()) return server.trim();
  const client = await getBusinessSetting('map_api_key');
  if (client?.trim()) return client.trim();
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.MAP_API_KEY?.trim() || null;
}

async function googleGet(path: string, params: Record<string, string>) {
  const key = await mapsApiKey();
  if (!key) {
    throw new Error('Google Maps API key is not configured');
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
