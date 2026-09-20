import { fetchGooglePlacePhotos } from "@/lib/google-place-photos";
import { loadGooglePlacesUiKit } from "@/lib/google-places-sdk";

vi.mock("@/lib/google-places-sdk", () => ({ loadGooglePlacesUiKit: vi.fn() }));

const PLACE_ID = "ChIJ_verified-place-123";
const API_KEY = "public-test-key";
const loadSdk = vi.mocked(loadGooglePlacesUiKit);
const fetchFields = vi.fn();
const createPlace = vi.fn();
const importLibrary = vi.fn();
const sdkWindow = window as Window & { google?: { maps: { importLibrary: typeof importLibrary } } };

function photo(name: string, overrides: Record<string, unknown> = {}) {
  return {
    getURI: vi.fn(({ maxWidth }: { maxWidth: number }) => `https://photos.example/${name}?width=${maxWidth}`),
    authorAttributions: [{ displayName: `작가 ${name}`, uri: `https://maps.google.com/contrib/${name}` }],
    googleMapsURI: `https://maps.google.com/photo/${name}`,
    flagContentURI: `https://maps.google.com/report/${name}`,
    ...overrides,
  };
}

function result(photos: unknown[] | undefined = [], id = PLACE_ID) {
  return { place: { id, photos } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  loadSdk.mockResolvedValue(undefined);
  fetchFields.mockReset().mockResolvedValue(result());
  importLibrary.mockReset().mockResolvedValue({
    Place: class {
      fetchFields = fetchFields;
      constructor(options: { id: string }) { createPlace(options); }
    },
  });
  sdkWindow.google = { maps: { importLibrary } };
});

afterEach(() => {
  delete sdkWindow.google;
  vi.useRealTimers();
});

test("fetches only the approved place id and photos, preserving SDK photo and attribution order", async () => {
  const first = photo("first");
  const second = photo("second");
  fetchFields.mockResolvedValue(result([first, second]));

  const photos = await fetchGooglePlacePhotos(PLACE_ID, API_KEY);

  expect(loadSdk).toHaveBeenCalledExactlyOnceWith(API_KEY);
  expect(importLibrary).toHaveBeenCalledExactlyOnceWith("places");
  expect(createPlace).toHaveBeenCalledExactlyOnceWith({ id: PLACE_ID });
  expect(fetchFields).toHaveBeenCalledExactlyOnceWith({ fields: ["id", "photos"] });
  expect(photos).toEqual(["first", "second"].map((name) => ({
    url: `https://photos.example/${name}?width=1200`,
    google: {
      authors: [{ displayName: `작가 ${name}`, uri: `https://maps.google.com/contrib/${name}` }],
      mapsUrl: `https://maps.google.com/photo/${name}`,
      flagUrl: `https://maps.google.com/report/${name}`,
    },
  })));
  expect(first.getURI).toHaveBeenCalledExactlyOnceWith({ maxWidth: 1200 });
  expect(second.getURI).toHaveBeenCalledExactlyOnceWith({ maxWidth: 1200 });
  expect(document.querySelector("gmp-place-details-compact")).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

test.each([[], undefined])("returns an empty gallery when Google returns no photos (%s)", async (photos) => {
  fetchFields.mockResolvedValue(result(photos));
  await expect(fetchGooglePlacePhotos(PLACE_ID, API_KEY)).resolves.toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

test("filters invalid photos without reordering valid photos and returns at most ten", async () => {
  const valid = Array.from({ length: 12 }, (_, index) => photo(`item-${index}`));
  const invalid = photo("invalid", { getURI: vi.fn(() => { throw new Error("expired"); }) });
  fetchFields.mockResolvedValue(result([null, {}, invalid, valid[0], { getURI: () => "javascript:alert(1)" }, ...valid.slice(1)]));

  const photos = await fetchGooglePlacePhotos(PLACE_ID, API_KEY);

  expect(photos.map((item) => item.url)).toEqual(valid.slice(0, 10).map((_, index) => `https://photos.example/item-${index}?width=1200`));
  expect(valid[10].getURI).not.toHaveBeenCalled();
});

test("preserves author names while removing unsafe or malformed attribution links", async () => {
  fetchFields.mockResolvedValue(result([photo("safe", {
    authorAttributions: [
      { displayName: " First ", uri: " https://maps.google.com/contrib/first " },
      { displayName: "Second", uri: "javascript:alert(1)" },
      { displayName: "Third", uri: "https://username:password@example.com/" },
      { displayName: "Fourth", uri: "http://maps.google.com/contrib/fourth" },
      { displayName: "Fifth", uri: "/relative-profile" },
      { displayName: "", uri: "https://example.com/" },
      null,
    ],
    googleMapsURI: "data:text/html,<script>alert(1)</script>",
    flagContentURI: "//maps.google.com/report",
  })]));

  const [image] = await fetchGooglePlacePhotos(PLACE_ID, API_KEY);
  expect(image.google).toEqual({ authors: [
    { displayName: "First", uri: "https://maps.google.com/contrib/first" },
    { displayName: "Second" },
    { displayName: "Third" },
    { displayName: "Fourth" },
    { displayName: "Fifth" },
  ] });
});

test("uses one photo URL for all gallery sizes and permits photos without author metadata", async () => {
  const getURI = vi.fn(() => "https://photos.example/large");
  fetchFields.mockResolvedValue(result([photo("large", { getURI, authorAttributions: undefined })]));
  const [image] = await fetchGooglePlacePhotos(PLACE_ID, API_KEY);
  expect(image.url).toBe("https://photos.example/large");
  expect(image.thumbnailUrl).toBeUndefined();
  expect(getURI).toHaveBeenCalledExactlyOnceWith({ maxWidth: 1200 });
  expect(image.google?.authors).toEqual([]);
});

test.each(["", "different-place-id"]) ("rejects a response for an unexpected place (%s) before producing photo URLs", async (id) => {
  const first = photo("wrong-place");
  fetchFields.mockResolvedValue(result([first], id));
  await expect(fetchGooglePlacePhotos(PLACE_ID, API_KEY)).rejects.toThrow("does not match");
  expect(first.getURI).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test("propagates SDK failure and clears the request timeout", async () => {
  loadSdk.mockRejectedValue(new Error("SDK blocked"));
  await expect(fetchGooglePlacePhotos(PLACE_ID, API_KEY)).rejects.toThrow("SDK blocked");
  expect(importLibrary).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test("propagates Place request failure and clears the request timeout", async () => {
  fetchFields.mockRejectedValue(new Error("REQUEST_DENIED"));
  await expect(fetchGooglePlacePhotos(PLACE_ID, API_KEY)).rejects.toThrow("REQUEST_DENIED");
  expect(vi.getTimerCount()).toBe(0);
});

test("rejects an unavailable Place API without rendering a widget", async () => {
  importLibrary.mockResolvedValue({});
  await expect(fetchGooglePlacePhotos(PLACE_ID, API_KEY)).rejects.toThrow("unavailable");
  expect(createPlace).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test("times out stalled SDK loading after twelve seconds without starting a later Place request", async () => {
  const sdk = deferred<void>();
  loadSdk.mockReturnValue(sdk.promise);
  const request = expect(fetchGooglePlacePhotos(PLACE_ID, API_KEY)).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(12_000);
  await request;
  sdk.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(importLibrary).not.toHaveBeenCalled();
  expect(fetchFields).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test("times out stalled Place requests and ignores photos returned after the deadline", async () => {
  const response = deferred<ReturnType<typeof result>>();
  fetchFields.mockReturnValue(response.promise);
  const request = expect(fetchGooglePlacePhotos(PLACE_ID, API_KEY)).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(12_000);
  await request;
  const late = photo("late");
  response.resolve(result([late]));
  await vi.advanceTimersByTimeAsync(0);
  expect(late.getURI).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test("each call fetches its own fresh photo data without persistent caching", async () => {
  fetchFields.mockResolvedValueOnce(result([photo("first-visit")])).mockResolvedValueOnce(result([photo("second-visit")]));
  const first = await fetchGooglePlacePhotos(PLACE_ID, API_KEY);
  const second = await fetchGooglePlacePhotos(PLACE_ID, API_KEY);
  expect(first[0].url).toContain("first-visit");
  expect(second[0].url).toContain("second-visit");
  expect(createPlace).toHaveBeenCalledTimes(2);
  expect(fetchFields).toHaveBeenCalledTimes(2);
});

test.each([["", API_KEY], [" place-id ", API_KEY], [PLACE_ID, " "]])("rejects invalid inputs before loading the SDK", async (placeId, key) => {
  await expect(fetchGooglePlacePhotos(placeId, key)).rejects.toThrow("invalid");
  expect(loadSdk).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
