import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import catalog from "@/constants/verified-google-places.json";
import { fetchGooglePlacePhotos } from "@/lib/google-place-photos";
import type { GoogleCoverSpot } from "@/lib/verified-google-places";
import type { SpotGalleryPhoto } from "@/components/ui/spot-photo-gallery";
import { useGoogleSpotCover } from "./use-google-spot-cover";

vi.mock("@/lib/google-place-photos", () => ({ fetchGooglePlacePhotos: vi.fn() }));
const fetchPhotos = vi.mocked(fetchGooglePlacePhotos);
const firstEntry = catalog.places[0];
const secondEntry = catalog.places[1];
const firstSpot: GoogleCoverSpot = {
  spotId: firstEntry.spotId, title: firstEntry.title, latitude: firstEntry.latitude, longitude: firstEntry.longitude, thumbnail: null,
};
const secondSpot: GoogleCoverSpot = {
  spotId: secondEntry.spotId, title: secondEntry.title, latitude: secondEntry.latitude, longitude: secondEntry.longitude, thumbnail: null,
};
const firstPhoto: SpotGalleryPhoto = { url: "https://photos.example/first", google: { authors: [{ displayName: "사진 작가" }] } };
const secondPhoto: SpotGalleryPhoto = { url: "https://photos.example/second", google: { authors: [{ displayName: "두 번째 작가" }] } };

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  static immediatelyVisible = false;
  target: Element | null = null;
  disconnect = vi.fn();
  constructor(private callback: IntersectionObserverCallback) { MockIntersectionObserver.instances.push(this); }
  observe(target: Element) {
    this.target = target;
    if (MockIntersectionObserver.immediatelyVisible) this.emit(true);
  }
  emit(isIntersecting: boolean) {
    this.callback([{ target: this.target, isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

let latestCover: ReturnType<typeof useGoogleSpotCover>;

function Consumer({ spot = firstSpot }: { spot?: GoogleCoverSpot }) {
  latestCover = useGoogleSpotCover(spot);
  return <div ref={latestCover.viewportRef} data-testid="cover" data-photo={latestCover.photo?.url ?? ""} data-attribution={latestCover.attribution ? "yes" : "no"} />;
}

function latestObserver() { return MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1]; }

async function showCover() {
  await act(async () => latestObserver().emit(true));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchPhotos.mockReset().mockResolvedValue([firstPhoto, secondPhoto]);
  vi.stubEnv("VITE_GOOGLE_PLACE_PHOTOS_ENABLED", "true");
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "public-test-key");
  MockIntersectionObserver.instances = [];
  MockIntersectionObserver.immediatelyVisible = false;
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

test("requests only after the approved card enters the viewport and uses the first SDK photo", async () => {
  render(<Consumer />);
  expect(fetchPhotos).not.toHaveBeenCalled();
  act(() => latestObserver().emit(false));
  expect(fetchPhotos).not.toHaveBeenCalled();

  await showCover();

  expect(fetchPhotos).toHaveBeenCalledExactlyOnceWith(firstEntry.placeId, "public-test-key");
  expect(latestCover.photo).toBe(firstPhoto);
  expect(latestObserver().disconnect).toHaveBeenCalled();
  expect(screen.getByTestId("cover")).toHaveAttribute("data-photo", firstPhoto.url);
});

test.each([undefined, "false", "TRUE", "1"])("does not request Google photos unless the feature flag is exactly true (%s)", (flag) => {
  vi.stubEnv("VITE_GOOGLE_PLACE_PHOTOS_ENABLED", flag);
  render(<Consumer />);
  expect(fetchPhotos).not.toHaveBeenCalled();
  expect(MockIntersectionObserver.instances).toHaveLength(0);
  expect(latestCover.photo).toBeNull();
});

test.each([
  { ...firstSpot, thumbnail: "https://photos.example/original" },
  { ...firstSpot, images: ["https://photos.example/gallery"] },
  { ...firstSpot, title: "승인되지 않은 장소" },
  { ...firstSpot, latitude: undefined },
])("does not request photos for an ineligible cover %j", (spot) => {
  render(<Consumer spot={spot} />);
  expect(fetchPhotos).not.toHaveBeenCalled();
  expect(MockIntersectionObserver.instances).toHaveLength(0);
});

test("requires the public key and avoids loading without viewport observation", () => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", " ");
  const view = render(<Consumer />);
  expect(MockIntersectionObserver.instances).toHaveLength(0);
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "public-test-key");
  vi.stubGlobal("IntersectionObserver", undefined);
  view.rerender(<Consumer />);
  expect(fetchPhotos).not.toHaveBeenCalled();
});

test("shows attribution only while SpotImage displays that Google photo", async () => {
  render(<Consumer />);
  await showCover();
  expect(latestCover.attribution).toBeUndefined();
  act(() => latestCover.onSourceChange(firstPhoto.url));
  expect(latestCover.attribution).toBe(firstPhoto.google);
  act(() => latestCover.onSourceChange("/images/spot-fallbacks/noodles.webp"));
  expect(latestCover.attribution).toBeUndefined();
  expect(latestCover.photo).toBe(firstPhoto);
});

test("StrictMode reuses a request inside the same mount", async () => {
  MockIntersectionObserver.immediatelyVisible = true;
  render(<StrictMode><Consumer /></StrictMode>);
  await waitFor(() => expect(latestCover.photo).toBe(firstPhoto));
  expect(fetchPhotos).toHaveBeenCalledTimes(1);
});

test("does not cache photos across unmounts", async () => {
  const first = render(<Consumer />);
  await showCover();
  first.unmount();
  render(<Consumer />);
  await showCover();
  expect(fetchPhotos).toHaveBeenCalledTimes(2);
});

test("clears the old photo immediately on place changes and ignores late responses and notifications", async () => {
  const pendingFirst = deferred<SpotGalleryPhoto[]>();
  const pendingSecond = deferred<SpotGalleryPhoto[]>();
  fetchPhotos.mockReturnValueOnce(pendingFirst.promise).mockReturnValueOnce(pendingSecond.promise);
  const view = render(<Consumer />);
  await showCover();
  const oldSourceChange = latestCover.onSourceChange;
  const oldObserver = latestObserver();

  view.rerender(<Consumer spot={secondSpot} />);
  expect(latestCover.photo).toBeNull();
  await showCover();
  await act(async () => pendingSecond.resolve([secondPhoto]));
  act(() => latestCover.onSourceChange(secondPhoto.url));
  expect(latestCover.photo).toBe(secondPhoto);
  expect(latestCover.attribution).toBe(secondPhoto.google);

  await act(async () => pendingFirst.resolve([firstPhoto]));
  act(() => { oldObserver.emit(true); oldSourceChange(firstPhoto.url); });
  expect(latestCover.photo).toBe(secondPhoto);
  expect(latestCover.attribution).toBe(secondPhoto.google);
  expect(fetchPhotos).toHaveBeenCalledTimes(2);
});

test("returning to the same place starts with no stale image and waits for visibility again", async () => {
  const view = render(<Consumer />);
  await showCover();
  expect(latestCover.photo).toBe(firstPhoto);
  view.rerender(<Consumer spot={secondSpot} />);
  view.rerender(<Consumer />);
  expect(latestCover.photo).toBeNull();
  expect(latestCover.attribution).toBeUndefined();
  expect(fetchPhotos).toHaveBeenCalledTimes(1);
  await showCover();
  expect(fetchPhotos).toHaveBeenCalledTimes(2);
});

test("changing to an original photo suppresses late Google results", async () => {
  const pending = deferred<SpotGalleryPhoto[]>();
  fetchPhotos.mockReturnValue(pending.promise);
  const view = render(<Consumer />);
  await showCover();
  view.rerender(<Consumer spot={{ ...firstSpot, thumbnail: "https://photos.example/original" }} />);
  await act(async () => pending.resolve([firstPhoto]));
  expect(latestCover.photo).toBeNull();
  expect(latestCover.attribution).toBeUndefined();
});

test.each(["empty", "failure"])("keeps the caller's fallback when Google returns %s", async (outcome) => {
  if (outcome === "empty") fetchPhotos.mockResolvedValue([]);
  else fetchPhotos.mockRejectedValue(new Error("REQUEST_DENIED"));
  render(<Consumer />);
  await showCover();
  expect(latestCover.photo).toBeNull();
  expect(latestCover.attribution).toBeUndefined();
});
