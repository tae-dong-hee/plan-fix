import type { SpotGalleryPhoto } from "@/components/ui/spot-photo-gallery";
import { loadGooglePlacesUiKit } from "@/lib/google-places-sdk";

type GooglePlace = {
  id?: string;
  photos?: unknown[];
  fetchFields: (options: { fields: string[] }) => Promise<{ place: GooglePlace }>;
};

type PlacesLibrary = {
  Place: new (options: { id: string }) => GooglePlace;
};

type GooglePhoto = {
  getURI: (options: { maxWidth: number }) => unknown;
  authorAttributions?: unknown;
  googleMapsURI?: unknown;
  flagContentURI?: unknown;
};

type GooglePhotoWindow = Window & {
  google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } };
};

function safeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function galleryPhoto(value: unknown): SpotGalleryPhoto | null {
  if (!value || typeof value !== "object" || !("getURI" in value) || typeof value.getURI !== "function") return null;
  const photo = value as GooglePhoto;
  let url: string | undefined;
  try {
    url = safeHttpsUrl(photo.getURI({ maxWidth: 1200 }));
  } catch {
    return null;
  }
  if (!url) return null;
  const authors = Array.isArray(photo.authorAttributions)
    ? photo.authorAttributions.flatMap((author: unknown) => {
      if (!author || typeof author !== "object" || !("displayName" in author)
        || typeof author.displayName !== "string" || !author.displayName.trim()) return [];
      const uri = safeHttpsUrl("uri" in author ? author.uri : undefined);
      return [{ displayName: author.displayName.trim(), ...(uri ? { uri } : {}) }];
    })
    : [];
  const mapsUrl = safeHttpsUrl(photo.googleMapsURI);
  const flagUrl = safeHttpsUrl(photo.flagContentURI);
  return {
    url,
    google: { authors, ...(mapsUrl ? { mapsUrl } : {}), ...(flagUrl ? { flagUrl } : {}) },
  };
}

/** 승인된 장소의 사진만 조회하며 URL과 출처는 호출한 화면의 메모리에만 반환한다. */
export async function fetchGooglePlacePhotos(placeId: string, apiKey: string): Promise<SpotGalleryPhoto[]> {
  if (!/^[A-Za-z0-9_-]+$/.test(placeId) || !apiKey.trim()) throw new Error("Google Places photo request is invalid");

  let active = true;
  let timeout: number | undefined;
  const timeoutError = () => new Error("Google Places photo request timed out");
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = window.setTimeout(() => {
      active = false;
      reject(timeoutError());
    }, 12_000);
  });

  const request = async (): Promise<SpotGalleryPhoto[]> => {
    await loadGooglePlacesUiKit(apiKey);
    if (!active) throw timeoutError();
    const maps = (window as GooglePhotoWindow).google?.maps;
    if (!maps?.importLibrary) throw new Error("Google Places SDK is unavailable");
    const library = await maps.importLibrary("places") as Partial<PlacesLibrary> | null;
    if (!active) throw timeoutError();
    if (typeof library?.Place !== "function") throw new Error("Google Places photos are unavailable");
    const requestedPlace = new library.Place({ id: placeId });
    const result = await requestedPlace.fetchFields({ fields: ["id", "photos"] });
    if (!active) throw timeoutError();
    if (result?.place?.id !== placeId) throw new Error("Google Places response does not match the requested place");
    if (!Array.isArray(result.place.photos)) return [];

    const photos: SpotGalleryPhoto[] = [];
    for (const photo of result.place.photos) {
      const item = galleryPhoto(photo);
      if (item) photos.push(item);
      if (photos.length === 10) break;
    }
    return photos;
  };

  try {
    return await Promise.race([request(), timeoutPromise]);
  } finally {
    active = false;
    window.clearTimeout(timeout);
  }
}
