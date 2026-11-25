/** Server-only Google Maps / Places key — set GOOGLE_MAPS_API_KEY in backend .env (never ship to apps). */
export function resolveGoogleMapsServerApiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
}

function mapsApiKey(): string | null {
  return resolveGoogleMapsServerApiKey();
}

function requireApiKey(): string {
  const key = mapsApiKey();
  if (!key) {
    throw new Error(
      'Google Maps API key is not configured. Set GOOGLE_MAPS_API_KEY in the backend .env.'
    );
  }
  return key;
}

function includedRegionCodes(): string[] {
  const raw = process.env.GOOGLE_PLACES_REGION_CODES?.trim();
  if (!raw || raw === '*' || raw.toUpperCase() === 'ALL') return [];
  return raw
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
}

/** Geographic Israel + common delivery areas (not ISO `IL`-only, which can hide Hebron-area results). */
const COUNTRY_RECTANGLE_LOW = { latitude: 29.45, longitude: 34.15 };
const COUNTRY_RECTANGLE_HIGH = { latitude: 33.45, longitude: 35.95 };

function applyAutocompleteRegionScope(
  requestBody: Record<string, unknown>,
  options?: PlaceAutocompleteOptions,
  hasLocationBias = false
) {
  const requestCode = options?.regionCode?.trim().toUpperCase();
  if (requestCode && /^[A-Z]{2}$/.test(requestCode)) {
    requestBody.includedRegionCodes = [requestCode];
    return;
  }
  const codes = includedRegionCodes();
  if (codes.length) {
    requestBody.includedRegionCodes = codes;
    return;
  }
  // New Places API: cannot combine locationRestriction with locationBias.
  // When the app sends lat/lng bias, skip the rectangle.
  if (hasLocationBias) return;
  // Default: worldwide — no rectangle. Opt-in via GOOGLE_PLACES_USE_COUNTRY_BOUNDS=1.
  if (process.env.GOOGLE_PLACES_USE_COUNTRY_BOUNDS === '1') {
    requestBody.locationRestriction = {
      rectangle: {
        low: COUNTRY_RECTANGLE_LOW,
        high: COUNTRY_RECTANGLE_HIGH,
      },
    };
  }
}

/**
 * Prefer nearby results over global name matches.
 * Pass the user's map/GPS as biasLat/biasLng (e.g. Islamabad → local KFC first).
 */
export type PlaceAutocompleteOptions = {
  biasLat?: number;
  biasLng?: number;
  biasRadiusKm?: number;
  /** ISO-3166 alpha-2, e.g. PK / IL — limits suggestions to that country when set. */
  regionCode?: string;
};

function parseFiniteNumber(raw: string | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

function resolvePlacesBias(options?: PlaceAutocompleteOptions): {
  lat: number;
  lng: number;
  radiusM: number;
} | null {
  const envLat = parseFiniteNumber(process.env.GOOGLE_PLACES_BIAS_LAT);
  const envLng = parseFiniteNumber(process.env.GOOGLE_PLACES_BIAS_LNG);
  const envRadiusKm = parseFiniteNumber(process.env.GOOGLE_PLACES_BIAS_RADIUS_KM) ?? 85;

  let lat = options?.biasLat;
  let lng = options?.biasLng;
  let radiusKm = options?.biasRadiusKm;

  if (lat != null && lng != null) {
    radiusKm = radiusKm ?? envRadiusKm;
  } else if (envLat != null && envLng != null) {
    lat = envLat;
    lng = envLng;
    radiusKm = radiusKm ?? envRadiusKm;
  } else {
    return null;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  const km = Math.min(500, Math.max(1, radiusKm ?? 85));
  return { lat, lng, radiusM: km * 1000 };
}

/** Legacy Maps Platform GET (Geocoding, Distance Matrix). */
async function googleGet(path: string, params: Record<string, string>) {
  const key = requireApiKey();
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

type LegacyAutocompletePrediction = {
  description: string;
  place_id: string;
  structured_formatting?: {
    main_text: string;
    secondary_text?: string;
  };
};

type NewAutocompleteBody = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      place?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
  error?: { message?: string; status?: string };
};

function stripPlacesPrefix(placeId: string): string {
  return placeId.replace(/^places\//, '');
}

function mapNewAutocompleteToLegacy(body: NewAutocompleteBody): {
  predictions: LegacyAutocompletePrediction[];
  status: string;
  error_message?: string;
} {
  const predictions: LegacyAutocompletePrediction[] = [];
  for (const s of body.suggestions ?? []) {
    const p = s.placePrediction;
    if (!p) continue;
    const placeId = stripPlacesPrefix((p.placeId || p.place || '').trim());
    const description = p.text?.text?.trim() || '';
    if (!placeId || !description) continue;
    const main = p.structuredFormat?.mainText?.text ?? description;
    const secondary = p.structuredFormat?.secondaryText?.text ?? '';
    predictions.push({
      description,
      place_id: placeId,
      structured_formatting: {
        main_text: main,
        secondary_text: secondary || undefined,
      },
    });
  }
  if (body.error?.message) {
    return {
      predictions: [],
      status: 'REQUEST_DENIED',
      error_message: body.error.message,
    };
  }
  return {
    predictions,
    status: predictions.length ? 'OK' : 'ZERO_RESULTS',
  };
}

async function placesNewAutocomplete(searchText: string, options?: PlaceAutocompleteOptions) {
  const key = requireApiKey();
  const bias = resolvePlacesBias(options);
  const requestBody: Record<string, unknown> = {
    input: searchText,
  };
  applyAutocompleteRegionScope(requestBody, options, Boolean(bias));
  if (bias) {
    // Rank nearby first (does not hard-block other countries unless region is also set).
    requestBody.locationBias = {
      circle: {
        center: { latitude: bias.lat, longitude: bias.lng },
        radius: bias.radiusM,
      },
    };
    // Helps Google order by distance from the user.
    requestBody.origin = { latitude: bias.lat, longitude: bias.lng };
  }
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
    },
    body: JSON.stringify(requestBody),
  });
  const body = (await res.json()) as NewAutocompleteBody & { error?: { message?: string } };
  if (!res.ok) {
    const msg =
      body?.error?.message ||
      (typeof (body as { message?: string }).message === 'string'
        ? (body as { message: string }).message
        : `Places autocomplete failed (${res.status})`);
    return {
      predictions: [] as LegacyAutocompletePrediction[],
      status: 'REQUEST_DENIED',
      error_message: msg,
    };
  }
  return mapNewAutocompleteToLegacy(body);
}

type NewPlaceDetailsBody = {
  id?: string;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  error?: { message?: string };
};

async function placesNewPlaceDetails(placeId: string) {
  const key = requireApiKey();
  const bare = stripPlacesPrefix(placeId.trim());
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(bare)}`;
  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'id,formattedAddress,location',
    },
  });
  const body = (await res.json()) as NewPlaceDetailsBody;
  if (!res.ok) {
    return {
      status: 'REQUEST_DENIED',
      error_message: body?.error?.message || `Place details failed (${res.status})`,
    };
  }
  const lat = body.location?.latitude;
  const lng = body.location?.longitude;
  if (lat == null || lng == null) {
    return {
      status: 'ZERO_RESULTS',
      error_message: 'Place has no coordinates',
    };
  }
  return {
    status: 'OK',
    result: {
      formatted_address: body.formattedAddress ?? '',
      geometry: {
        location: { lat, lng },
      },
      place_id: stripPlacesPrefix(body.id ?? bare),
    },
  };
}

/** Pass-through legacy GET when GOOGLE_PLACES_USE_LEGACY=1 */
async function legacyPlaceAutocomplete(searchText: string, options?: PlaceAutocompleteOptions) {
  const bias = resolvePlacesBias(options);
  const params: Record<string, string> = { input: searchText };
  if (bias) {
    params.location = `${bias.lat},${bias.lng}`;
    params.radius = String(Math.round(bias.radiusM));
    params.strictbounds = 'false';
  }
  const region =
    options?.regionCode?.trim().toUpperCase() ||
    includedRegionCodes()[0] ||
    undefined;
  if (region) params.components = `country:${region.toLowerCase()}`;
  return googleGet('place/autocomplete/json', params);
}

async function legacyPlaceDetails(placeId: string) {
  return googleGet('place/details/json', { placeid: placeId });
}

function useLegacyPlaces(): boolean {
  return process.env.GOOGLE_PLACES_USE_LEGACY === '1';
}

export async function placeAutocomplete(searchText: string, options?: PlaceAutocompleteOptions) {
  if (useLegacyPlaces()) {
    return legacyPlaceAutocomplete(searchText, options);
  }
  return placesNewAutocomplete(searchText, options);
}

export async function placeDetails(placeId: string) {
  if (useLegacyPlaces()) {
    return legacyPlaceDetails(placeId);
  }
  return placesNewPlaceDetails(placeId);
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

type ComputeRoutesResponse = {
  routes?: Array<{ distanceMeters?: number }>;
  error?: { message?: string; status?: string };
};

/**
 * Driving distance via Google Routes API `computeRoutes` (TRAVEL_MODE DRIVE).
 * Uses TRAFFIC_UNAWARE for stable fee distances (not live traffic ETA).
 */
export async function computeDrivingRouteDistanceMeters(params: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}): Promise<number> {
  const key = requireApiKey();
  const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';
  const body = {
    origin: {
      location: {
        latLng: {
          latitude: params.originLat,
          longitude: params.originLng,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: params.destinationLat,
          longitude: params.destinationLng,
        },
      },
    },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.distanceMeters',
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as ComputeRoutesResponse;
  if (!res.ok) {
    const msg = data?.error?.message || `Google Routes request failed (${res.status})`;
    throw new Error(msg);
  }

  const meters = data?.routes?.[0]?.distanceMeters;
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) {
    throw new Error('Google Routes returned no driving distance');
  }
  return meters;
}

type LegacyGeocodeResult = {
  formatted_address: string;
  geometry: {
    location: { lat: number; lng: number };
    location_type?: string;
  };
  place_id?: string;
  types?: string[];
  /** Nearby POI / business name when reverse-geocode finds one close to the pin. */
  name?: string | null;
};

/** Prefer a nearby place name when the pin is within this distance (meters). */
const NEARBY_PLACE_NAME_MAX_M = 80;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

type V4GeocodeBody = {
  results?: Array<{
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    place?: string;
    types?: string[];
  }>;
  error?: { message?: string };
};

async function geocodeV4(lat: string, lng: string) {
  const key = requireApiKey();
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
    return { status: 'INVALID_REQUEST', results: [] as LegacyGeocodeResult[], error_message: 'Invalid lat/lng' };
  }
  const url = `https://geocode.googleapis.com/v4/geocode/location/${latN},${lngN}`;
  const res = await fetch(url, { headers: { 'X-Goog-Api-Key': key } });
  const body = (await res.json()) as V4GeocodeBody;
  if (!res.ok) {
    return {
      status: 'REQUEST_DENIED',
      results: [] as LegacyGeocodeResult[],
      error_message: body?.error?.message || `Geocode failed (${res.status})`,
      _v4Denied: true,
    };
  }
  const results: LegacyGeocodeResult[] = [];
  for (const row of body.results ?? []) {
    const plat = row.location?.latitude;
    const plng = row.location?.longitude;
    const formatted = row.formattedAddress?.trim() ?? '';
    if (plat == null || plng == null || !formatted) continue;
    results.push({
      formatted_address: formatted,
      geometry: {
        location: { lat: plat, lng: plng },
        location_type: 'APPROXIMATE',
      },
      place_id: row.place ? stripPlacesPrefix(row.place) : undefined,
      types: row.types,
    });
  }

  return {
    status: results.length ? 'OK' : 'ZERO_RESULTS',
    results,
  };
}

type NearbyPlace = {
  id?: string;
  formattedAddress?: string;
  displayName?: { text?: string; languageCode?: string };
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  primaryType?: string;
};

type NearbyLookup = {
  status: string;
  results: LegacyGeocodeResult[];
  error_message?: string;
  /** Closest place with a display name, if within NEARBY_PLACE_NAME_MAX_M. */
  nearby_name?: string | null;
  nearby_place_id?: string | null;
  nearby_distance_m?: number | null;
};

function nearbyDisplayName(p: NearbyPlace): string | null {
  const text = p.displayName?.text?.trim();
  return text || null;
}

function buildFormattedWithName(name: string | null | undefined, address: string): string {
  const addr = address.trim();
  const n = name?.trim();
  if (!n) return addr;
  if (!addr) return n;
  if (addr.toLowerCase().startsWith(n.toLowerCase())) return addr;
  return `${n}, ${addr}`;
}

async function reverseGeocodePlacesNearby(lat: string, lng: string): Promise<NearbyLookup> {
  const key = requireApiKey();
  const latN = Number(lat);
  const lngN = Number(lng);
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType',
    },
    body: JSON.stringify({
      locationRestriction: {
        circle: {
          center: { latitude: latN, longitude: lngN },
          radius: 150,
        },
      },
      maxResultCount: 10,
    }),
  });
  const body = (await res.json()) as { places?: NearbyPlace[]; error?: { message?: string } };
  if (!res.ok) {
    return {
      status: 'REQUEST_DENIED',
      results: [] as LegacyGeocodeResult[],
      error_message: body?.error?.message || `Reverse geocode failed (${res.status})`,
    };
  }
  const places = body.places ?? [];
  if (!places.length) {
    return { status: 'ZERO_RESULTS', results: [] as LegacyGeocodeResult[] };
  }

  let best: NearbyPlace | null = null;
  let bestKm = Infinity;
  let bestNamed: NearbyPlace | null = null;
  let bestNamedKm = Infinity;

  for (const p of places) {
    const plat = p.location?.latitude;
    const plng = p.location?.longitude;
    if (plat == null || plng == null) continue;
    const km = haversineKm(latN, lngN, plat, plng);
    if (km < bestKm) {
      bestKm = km;
      best = p;
    }
    if (nearbyDisplayName(p) && km < bestNamedKm) {
      bestNamedKm = km;
      bestNamed = p;
    }
  }

  const namedWithin =
    bestNamed && bestNamedKm * 1000 <= NEARBY_PLACE_NAME_MAX_M ? bestNamed : null;
  const placeName = namedWithin ? nearbyDisplayName(namedWithin) : null;
  const namedDistM = namedWithin ? Math.round(bestNamedKm * 1000) : null;

  // Prefer address from the named POI; else closest place with an address.
  const addressSource =
    namedWithin?.formattedAddress?.trim()
      ? namedWithin
      : best?.formattedAddress?.trim()
        ? best
        : null;

  if (
    !addressSource?.formattedAddress ||
    addressSource.location?.latitude == null ||
    addressSource.location?.longitude == null
  ) {
    return { status: 'ZERO_RESULTS', results: [] as LegacyGeocodeResult[] };
  }

  const idSource = namedWithin ?? addressSource;
  const result: LegacyGeocodeResult = {
    formatted_address: buildFormattedWithName(placeName, addressSource.formattedAddress),
    geometry: {
      // Keep returned geometry near the pin's nearest place; Flutter still uses request lat/lng as truth.
      location: {
        lat: addressSource.location.latitude,
        lng: addressSource.location.longitude,
      },
      location_type: placeName ? 'ROOFTOP' : 'APPROXIMATE',
    },
    place_id: idSource.id ? stripPlacesPrefix(idSource.id) : undefined,
    types: idSource.types?.length
      ? idSource.types
      : placeName
        ? ['establishment', 'point_of_interest', 'geocode']
        : ['geocode'],
    name: placeName,
  };
  return {
    status: 'OK',
    results: [result],
    nearby_name: placeName,
    nearby_place_id: result.place_id ?? null,
    nearby_distance_m: namedDistM ?? Math.round(bestKm * 1000),
  };
}

/** Merge street geocode with a nearby business name when the pin is on/near a POI. */
async function enrichGeocodeWithNearbyPlaceName(
  lat: string,
  lng: string,
  base: { status: string; results: LegacyGeocodeResult[]; error_message?: string }
): Promise<{ status: string; results: LegacyGeocodeResult[]; error_message?: string }> {
  if (base.status !== 'OK' || !base.results.length) return base;
  try {
    const nearby = await reverseGeocodePlacesNearby(lat, lng);
    const name = nearby.nearby_name?.trim();
    if (!name) return base;

    const top = { ...base.results[0] };
    top.name = name;
    top.formatted_address = buildFormattedWithName(name, top.formatted_address);
    if (nearby.nearby_place_id) top.place_id = nearby.nearby_place_id;
    const types = new Set([...(top.types ?? []), 'establishment', 'point_of_interest']);
    top.types = [...types];
    if (top.geometry) {
      top.geometry = { ...top.geometry, location_type: 'ROOFTOP' };
    }
    return { status: 'OK', results: [top, ...base.results.slice(1)] };
  } catch (err) {
    console.warn('[geocode] nearby place-name enrich failed', err);
    return base;
  }
}

function useLegacyGeocode(): boolean {
  return process.env.GOOGLE_GEOCODE_USE_LEGACY === '1' || process.env.GOOGLE_PLACES_USE_LEGACY === '1';
}

export async function geocodeLatLng(lat: string, lng: string) {
  if (useLegacyGeocode()) {
    const legacy = (await googleGet('geocode/json', { latlng: `${lat},${lng}` })) as {
      status: string;
      results: LegacyGeocodeResult[];
      error_message?: string;
    };
    return enrichGeocodeWithNearbyPlaceName(lat, lng, {
      status: legacy.status,
      results: legacy.results ?? [],
      error_message: legacy.error_message,
    });
  }

  const v4 = (await geocodeV4(lat, lng)) as {
    status: string;
    results: LegacyGeocodeResult[];
    error_message?: string;
    _v4Denied?: boolean;
  };

  if (v4.status === 'OK' && v4.results.length) {
    // Street geocode alone often misses shop names (e.g. "Palace Bakers") — enrich from Nearby.
    return enrichGeocodeWithNearbyPlaceName(lat, lng, {
      status: v4.status,
      results: v4.results,
    });
  }

  if (v4._v4Denied || v4.status === 'REQUEST_DENIED') {
    const nearby = await reverseGeocodePlacesNearby(lat, lng);
    if (nearby.status === 'OK' && nearby.results.length) {
      return {
        status: nearby.status,
        results: nearby.results,
      };
    }
    return {
      status: nearby.status,
      results: nearby.results,
      error_message: nearby.error_message || v4.error_message,
    };
  }

  if (v4.status === 'ZERO_RESULTS') {
    const nearby = await reverseGeocodePlacesNearby(lat, lng);
    if (nearby.status === 'OK') {
      return { status: nearby.status, results: nearby.results };
    }
  }

  return { status: v4.status, results: v4.results, error_message: v4.error_message };
}
