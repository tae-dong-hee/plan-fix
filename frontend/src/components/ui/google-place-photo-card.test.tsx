import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import GooglePlacePhotoCard from "./google-place-photo-card";
import { loadGooglePlacesUiKit } from "@/lib/google-places-sdk";
import type { GooglePlaceSpot } from "@/lib/verified-google-places";

vi.mock("@/lib/google-places-sdk", () => ({ loadGooglePlacesUiKit: vi.fn() }));
vi.mock("@/constants/verified-google-places.json", () => ({ default: {
  version: 1, places: [{
    spotId: 942, title: "임계식당", address: "강원특별자치도 강릉시 중앙시장길22-2(성남동)",
    latitude: 37.7535599, longitude: 128.8988371, placeId: "ChIJ_verified-place",
  }],
} }));

const spot: GooglePlaceSpot = {
  spotId: 942, title: "임계식당", address: "강원특별자치도 강릉시 중앙시장길22-2(성남동)",
  latitude: 37.7535599, longitude: 128.8988371, thumbnail: null, images: [],
};
const loadSdk = vi.mocked(loadGooglePlacesUiKit);
let intersect: IntersectionObserverCallback;
const disconnect = vi.fn();

beforeEach(() => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "public-test-key");
  loadSdk.mockReset().mockResolvedValue();
  disconnect.mockReset();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {}
    disconnect = disconnect;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderCard(value: GooglePlaceSpot = spot) {
  return render(<MemoryRouter><StrictMode><GooglePlacePhotoCard spot={value}><div>기존 사진 안내</div></GooglePlacePhotoCard></StrictMode></MemoryRouter>);
}

async function showCard() {
  act(() => intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  await waitFor(() => expect(document.querySelector("gmp-place-details-compact")).not.toBeNull());
  return document.querySelector("gmp-place-details-compact") as HTMLElement & { place?: { id: string } };
}

test("loads once on intersection and preserves the basic SDK media, attribution, and links", async () => {
  const view = renderCard();
  expect(loadSdk).not.toHaveBeenCalled();
  expect(screen.getByText("기존 사진 안내")).toBeVisible();
  const card = await showCard();
  expect(loadSdk).toHaveBeenCalledTimes(1);
  expect(card).toHaveAttribute("orientation", "vertical");
  expect(card.querySelector("gmp-place-details-place-request")).toHaveAttribute("place", "ChIJ_verified-place");
  expect(card.querySelector("gmp-place-media")).toHaveAttribute("lightbox-preferred");
  expect(card.querySelector("gmp-place-attribution")).not.toBeNull();
  expect(card.querySelector("gmp-place-address")).not.toBeNull();
  expect(card.closest("a, button")).toBeNull();
  expect(document.querySelector("gmp-map, gmp-advanced-place-details-compact")).toBeNull();
  card.place = { id: "ChIJ_verified-place" };
  fireEvent(card, new Event("gmp-load"));
  expect(screen.queryByText("기존 사진 안내")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Google Maps 장소 사진")).not.toHaveAttribute("aria-hidden", "true");
  expect(screen.getByRole("link", { name: "출처 및 이용 안내" })).toHaveAttribute("href", "/image-credits#google-maps");
  view.rerender(<MemoryRouter><StrictMode><GooglePlacePhotoCard spot={{ ...spot }}><div>기존 사진 안내</div></GooglePlacePhotoCard></StrictMode></MemoryRouter>);
  expect(document.querySelector("gmp-place-details-compact")).toBe(card);
  expect(loadSdk).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(card.isConnected).toBe(false);
});

test.each(["", "  "])("keeps the existing fallback without an API key (%j)", (key) => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", key);
  renderCard();
  expect(screen.getByText("기존 사진 안내")).toBeVisible();
  expect(loadSdk).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Google Maps 장소 사진")).not.toBeInTheDocument();
});

test.each([
  { title: "다른 장소" }, { address: "다른 주소" }, { latitude: 37.7 },
  { thumbnail: "https://example.com/photo.jpg" }, { images: ["https://example.com/gallery.jpg"] },
])("never loads Google for unapproved identity or existing photos %j", (change) => {
  renderCard({ ...spot, ...change });
  expect(loadSdk).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Google Maps 장소 사진")).not.toBeInTheDocument();
});

test("preserves fallback when the SDK rejects and does not request again", async () => {
  loadSdk.mockRejectedValue(new Error("blocked"));
  renderCard();
  await act(async () => intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  expect(screen.getByText("기존 사진 안내")).toBeVisible();
  expect(document.querySelector("gmp-place-details-compact")).toBeNull();
  expect(loadSdk).toHaveBeenCalledTimes(1);
});

test.each(["gmp-error", "wrong-place"])("removes a failed or mismatched Google result: %s", async (event) => {
  renderCard();
  const card = await showCard();
  card.place = { id: "ChIJ_wrong-place" };
  fireEvent(card, new Event(event === "wrong-place" ? "gmp-load" : event));
  expect(screen.getByText("기존 사진 안내")).toBeVisible();
  expect(card.isConnected).toBe(false);
  card.place = { id: "ChIJ_verified-place" };
  fireEvent(card, new Event("gmp-load"));
  expect(screen.getByText("기존 사진 안내")).toBeVisible();
});

test("falls back after a silent widget timeout", async () => {
  vi.useFakeTimers();
  renderCard();
  await act(async () => intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  expect(document.querySelector("gmp-place-details-compact")).not.toBeNull();
  act(() => vi.advanceTimersByTime(12_000));
  expect(document.querySelector("gmp-place-details-compact")).toBeNull();
  expect(screen.getByText("기존 사진 안내")).toBeVisible();
});

test("does not create a widget after unmounting during SDK load", async () => {
  let ready!: () => void;
  loadSdk.mockReturnValue(new Promise<void>((resolve) => { ready = resolve; }));
  const view = renderCard();
  act(() => intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  view.unmount();
  await act(async () => ready());
  expect(document.querySelector("gmp-place-details-compact")).toBeNull();
});
