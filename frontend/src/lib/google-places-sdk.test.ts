type SdkTestWindow = Window & {
  google?: { maps: { importLibrary: ReturnType<typeof vi.fn> } };
  __planFixGooglePlacesReady?: () => void;
};
const sdkWindow = window as SdkTestWindow;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  delete sdkWindow.google;
  delete sdkWindow.__planFixGooglePlacesReady;
  vi.spyOn(window.customElements, "get").mockReturnValue(class extends HTMLElement {});
});

afterEach(() => {
  document.querySelectorAll('script[src^="https://maps.googleapis.com/maps/api/js"]').forEach((script) => script.remove());
  delete sdkWindow.google;
  delete sdkWindow.__planFixGooglePlacesReady;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("concurrent cards share one SDK request and load only the places library", async () => {
  const { loadGooglePlacesUiKit } = await import("./google-places-sdk");
  const first = loadGooglePlacesUiKit("public-test-key");
  expect(loadGooglePlacesUiKit("public-test-key")).toBe(first);
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src^="https://maps.googleapis.com/maps/api/js"]');
  expect(scripts).toHaveLength(1);
  const url = new URL(scripts[0].src);
  expect(url.searchParams.get("libraries")).toBe("places");
  expect(url.searchParams.get("v")).toBe("weekly");
  const importLibrary = vi.fn().mockResolvedValue({});
  sdkWindow.google = { maps: { importLibrary } };
  sdkWindow.__planFixGooglePlacesReady?.();
  await first;
  expect(importLibrary).toHaveBeenCalledExactlyOnceWith("places");
  expect(loadGooglePlacesUiKit("public-test-key")).toBe(first);
  expect(sdkWindow.__planFixGooglePlacesReady).toBeUndefined();
});

test("reuses an existing Google SDK without inserting a duplicate script", async () => {
  const importLibrary = vi.fn().mockResolvedValue({});
  sdkWindow.google = { maps: { importLibrary } };
  const { loadGooglePlacesUiKit } = await import("./google-places-sdk");
  await loadGooglePlacesUiKit("public-test-key");
  expect(importLibrary).toHaveBeenCalledExactlyOnceWith("places");
  expect(document.querySelector('script[src^="https://maps.googleapis.com/maps/api/js"]')).toBeNull();
});

test("removes a failed script and permits a subsequent page to retry", async () => {
  const { loadGooglePlacesUiKit } = await import("./google-places-sdk");
  const first = loadGooglePlacesUiKit("public-test-key");
  document.querySelector('script[src^="https://maps.googleapis.com/maps/api/js"]')?.dispatchEvent(new Event("error"));
  await expect(first).rejects.toThrow("failed to load");
  expect(document.querySelector('script[src^="https://maps.googleapis.com/maps/api/js"]')).toBeNull();
  const second = loadGooglePlacesUiKit("public-test-key");
  expect(second).not.toBe(first);
  sdkWindow.google = { maps: { importLibrary: vi.fn().mockResolvedValue({}) } };
  sdkWindow.__planFixGooglePlacesReady?.();
  await second;
});

test("bounds a stalled SDK load and clears its callback", async () => {
  const { loadGooglePlacesUiKit } = await import("./google-places-sdk");
  const promise = loadGooglePlacesUiKit("public-test-key");
  vi.advanceTimersByTime(12_000);
  await expect(promise).rejects.toThrow("timed out");
  expect(sdkWindow.__planFixGooglePlacesReady).toBeUndefined();
  expect(document.querySelector('script[src^="https://maps.googleapis.com/maps/api/js"]')).toBeNull();
});

test("rejects a loaded SDK that does not provide the requested widget", async () => {
  vi.mocked(window.customElements.get).mockReturnValue(undefined);
  sdkWindow.google = { maps: { importLibrary: vi.fn().mockResolvedValue({}) } };
  const { loadGooglePlacesUiKit } = await import("./google-places-sdk");
  await expect(loadGooglePlacesUiKit("public-test-key")).rejects.toThrow("UI Kit is unavailable");
});
