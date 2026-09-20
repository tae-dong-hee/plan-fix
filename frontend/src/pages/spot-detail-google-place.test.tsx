import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import SpotDetailPage from "./spot-detail-page";
import { fetchSpotDetail, type SpotDetail } from "@/services/spots";
import { loadGooglePlacesUiKit } from "@/lib/google-places-sdk";
import { getSimilarSpotImage } from "@/lib/similar-spot-images";

vi.mock("@/services/spots");
vi.mock("@/lib/google-places-sdk", () => ({ loadGooglePlacesUiKit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/constants/verified-google-places.json", () => ({ default: {
  version: 1, places: [{
    spotId: 942, title: "임계식당", address: "강원특별자치도 강릉시 중앙시장길22-2(성남동)",
    latitude: 37.7535599, longitude: 128.8988371, placeId: "ChIJ_verified-place",
  }],
} }));

afterEach(() => vi.unstubAllEnvs());

test("shows an approved Google card inside the missing-photo section without enclosing interactive elements", async () => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "public-test-key");
  vi.mocked(fetchSpotDetail).mockResolvedValue({
    spotId: 942, title: "임계식당", address: "강원특별자치도 강릉시 중앙시장길22-2(성남동)",
    latitude: 37.7535599, longitude: 128.8988371, category: "음식점", region: "51", sigungu: "150",
    thumbnail: null, images: [], description: null, viewCount: 0, likeCount: 0, commentCount: 0,
    isLiked: false, info: null,
  } satisfies SpotDetail);
  render(<MemoryRouter initialEntries={["/spots/942"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path="/spots/:spotId" element={<SpotDetailPage />} /></Routes>
  </MemoryRouter>);

  await screen.findByRole("heading", { name: "임계식당" });
  await waitFor(() => expect(document.querySelector("gmp-place-details-compact")).not.toBeNull());
  const card = document.querySelector("gmp-place-details-compact") as HTMLElement & { place?: { id: string } };
  expect(card.closest("section")).toHaveAttribute("aria-label", "장소 사진");
  expect(card.closest("a, button")).toBeNull();
  expect(screen.getByRole("img", { name: /임계식당 유사 이미지:/ })).toHaveAttribute("src", getSimilarSpotImage({
    spotId: 942, title: "임계식당", category: "음식점", sigungu: "150",
  }).url);
  act(() => {
    card.place = { id: "ChIJ_verified-place" };
    card.dispatchEvent(new Event("gmp-load"));
  });
  expect(screen.getByLabelText("Google Maps 장소 사진")).toBeVisible();
  expect(screen.queryByRole("img", { name: /임계식당/ })).not.toBeInTheDocument();
  expect(screen.queryByText("유사 이미지")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "유사 이미지 출처" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "사진 출처" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "출처 및 이용 안내" })).toHaveAttribute("href", "/image-credits#google-maps");
  expect(vi.mocked(loadGooglePlacesUiKit)).toHaveBeenCalledTimes(1);
});

test("keeps the similar image when the approved Google photo request fails", async () => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "public-test-key");
  vi.mocked(fetchSpotDetail).mockResolvedValue({
    spotId: 942, title: "임계식당", address: "강원특별자치도 강릉시 중앙시장길22-2(성남동)",
    latitude: 37.7535599, longitude: 128.8988371, category: "음식점", region: "51", sigungu: "150",
    thumbnail: null, images: [], description: null, viewCount: 0, likeCount: 0, commentCount: 0,
    isLiked: false, info: null,
  } satisfies SpotDetail);
  render(<MemoryRouter initialEntries={["/spots/942"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path="/spots/:spotId" element={<SpotDetailPage />} /></Routes>
  </MemoryRouter>);

  await screen.findByRole("heading", { name: "임계식당" });
  await waitFor(() => expect(document.querySelector("gmp-place-details-compact")).not.toBeNull());
  act(() => document.querySelector("gmp-place-details-compact")?.dispatchEvent(new Event("gmp-error")));
  expect(document.querySelector("gmp-place-details-compact")).toBeNull();
  expect(screen.getByRole("img", { name: /임계식당 유사 이미지:/ })).toHaveAttribute("src", getSimilarSpotImage({
    spotId: 942, title: "임계식당", category: "음식점", sigungu: "150",
  }).url);
  expect(screen.getByText("유사 이미지")).toBeVisible();
});
