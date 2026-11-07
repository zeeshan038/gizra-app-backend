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
  const raw = process.env.GOOGLE_PLACES_REGION_CODES?.trim() || 'IL';
  return raw
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
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

async function placesNewAutocomplete(searchText: string) {
  const key = requireApiKey();
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
    },
    body: JSON.stringify({
      input: searchText,
      includedRegionCodes: includedRegionCodes(),
    }),
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
async function legacyPlaceAutocomplete(searchText: string) {
  return googleGet('place/autocomplete/json', { input: searchText });
}

async function legacyPlaceDetails(placeId: string) {
  return googleGet('place/details/json', { placeid: placeId });
}

function useLegacyPlaces(): boolean {
  return process.env.GOOGLE_PLACES_USE_LEGACY === '1';
}

export async function placeAutocomplete(searchText: string) {
  if (useLegacyPlaces()) {
    return legacyPlaceAutocomplete(searchText);
  }
  return placesNewAutocomplete(searchText);
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

export async function geocodeLatLng(lat: string, lng: string) {
  return googleGet('geocode/json', { latlng: `${lat},${lng}` });
}
