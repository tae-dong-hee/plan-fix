import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MainSpotCard from "./main-spot-card";
import { useGoogleSpotCover } from "@/hooks/use-google-spot-cover";
import { getSimilarSpotImage } from "@/lib/similar-spot-images";
import type { PopularSpot } from "@/services/spots";

vi.mock("@/hooks/use-google-spot-cover");

const spot: PopularSpot = {
  spotId: 728, title: "파인시티호텔", category: "숙박", region: "51", sigungu: "150", thumbnail: null,
  latitude: 37.7608316, longitude: 128.8991773,
};
const photo = {
  url: "https://example.com/google-first.jpg",
  google: {
    authors: [{ displayName: "호텔 촬영자", uri: "https://maps.google.com/contrib/author" }],
    mapsUrl: "https://maps.google.com/place/hotel",
  },
};

test.each(["popular", "guide"] as const)("%s card uses the first Google photo with independent attribution links and clears them after image failure", (variant) => {
  const viewportRef = vi.fn();
  const onSourceChange = vi.fn();
  vi.mocked(useGoogleSpotCover).mockReturnValue({ viewportRef, photo, attribution: photo.google, onSourceChange });
  const view = () => (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <MainSpotCard spot={spot} variant={variant} isLiked={false} isLoading={false} onToggleLike={vi.fn()} />
    </MemoryRouter>
  );
  const { rerender } = render(view());

  const image = screen.getByRole("img", { name: spot.title });
  expect(image).toHaveAttribute("src", photo.url);
  expect(viewportRef).toHaveBeenCalledWith(image.closest("article"));
  expect(onSourceChange).toHaveBeenLastCalledWith(photo.url);
  const maps = screen.getByRole("link", { name: "Google Maps" });
  const author = screen.getByRole("link", { name: "호텔 촬영자" });
  expect(maps).toHaveAttribute("href", photo.google.mapsUrl);
  expect(author).toHaveAttribute("href", photo.google.authors[0].uri);
  expect(author.parentElement?.closest("a, button")).toBeNull();
  expect(maps.parentElement?.closest("a, button")).toBeNull();
  expect(image.closest("a")).toHaveAttribute("href", "/spots/728");

  fireEvent.error(image);
  expect(image).toHaveAttribute("src", getSimilarSpotImage(spot).url);
  expect(onSourceChange).toHaveBeenLastCalledWith(getSimilarSpotImage(spot).url);
  vi.mocked(useGoogleSpotCover).mockReturnValue({ viewportRef, photo, attribution: undefined, onSourceChange });
  rerender(view());
  expect(screen.getByRole("img")).toHaveAttribute("src", getSimilarSpotImage(spot).url);
  expect(screen.queryByRole("link", { name: "Google Maps" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "호텔 촬영자" })).not.toBeInTheDocument();
  expect(screen.getByText("유사 이미지")).toBeInTheDocument();
});
