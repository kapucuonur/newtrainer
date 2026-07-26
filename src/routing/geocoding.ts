export type GeocodedPlace = {
  displayName: string;
  lat: number;
  lng: number;
};

/**
 * Free OpenStreetMap Nominatim geocoding search for location names and addresses.
 */
export async function searchLocation(query: string): Promise<GeocodedPlace[]> {
  if (!query || query.trim().length < 2) return [];

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query.trim(),
    )}&limit=5`;

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) return [];

    const data = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;

    return data.map((item) => ({
      displayName: item.display_name,
      lat: Number.parseFloat(item.lat),
      lng: Number.parseFloat(item.lon),
    }));
  } catch {
    return [];
  }
}
