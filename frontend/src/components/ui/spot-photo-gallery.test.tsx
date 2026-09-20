import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import SpotPhotoGallery, { type SpotGalleryPhoto } from "./spot-photo-gallery";
import { FALLBACK_SPOT_IMAGE } from "./spot-image";
import { getSimilarSpotImage } from "@/lib/similar-spot-images";

const title = "파인시티호텔";
const similarImage = getSimilarSpotImage({ spotId: 10, title, category: "숙박" });
const googlePhotos: SpotGalleryPhoto[] = [
  {
    url: "https://example.com/google-first-full.jpg",
    thumbnailUrl: "https://example.com/google-first-small.jpg",
    google: {
      authors: [{ displayName: "첫 번째 촬영자", uri: "https://maps.google.com/contrib/first" }],
      mapsUrl: "https://maps.google.com/place/hotel",
      flagUrl: "https://maps.google.com/report/first",
    },
  },
  {
    url: "https://example.com/google-second-full.jpg",
    thumbnailUrl: "https://example.com/google-second-small.jpg",
    google: {
      authors: [{ displayName: "두 번째 촬영자", uri: "https://maps.google.com/contrib/second" }],
      mapsUrl: "https://maps.google.com/place/hotel",
    },
  },
];

function gallery(photos: SpotGalleryPhoto[]) {
  return (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SpotPhotoGallery title={title} photos={photos} similarImage={similarImage} />
    </MemoryRouter>
  );
}

test("uses the first Google photo as the wide representative image and changes author credit with selection", () => {
  render(gallery(googlePhotos));

  const hero = screen.getByRole("img", { name: title });
  expect(hero).toHaveAttribute("src", googlePhotos[0].url);
  expect(hero.parentElement).toHaveClass("aspect-[4/3]", "sm:aspect-[16/10]");
  expect(screen.getByRole("status", { name: "현재 사진" })).toHaveTextContent("1 / 2");
  const heroCredit = within(screen.getByRole("group", { name: "대표 사진 출처" }));
  expect(heroCredit.getByRole("link", { name: "Google Maps" })).toHaveAttribute("href", googlePhotos[0].google?.mapsUrl);
  expect(heroCredit.getByRole("link", { name: "첫 번째 촬영자" })).toHaveAttribute("href", googlePhotos[0].google?.authors[0].uri);
  expect(heroCredit.getByRole("link", { name: "사진 신고" })).toHaveAttribute("href", googlePhotos[0].google?.flagUrl);
  expect(heroCredit.queryByRole("link", { name: "두 번째 촬영자" })).not.toBeInTheDocument();

  const thumbnail = screen.getByRole("img", { name: `${title} 사진 2` });
  expect(thumbnail).toHaveAttribute("src", googlePhotos[1].thumbnailUrl);
  expect(thumbnail).toHaveAttribute("loading", "lazy");
  expect(screen.getAllByRole("img").some((image) => image.getAttribute("src") === googlePhotos[1].url)).toBe(false);
  const thumbnailButton = screen.getByRole("button", { name: `${title} 사진 2 보기` });
  const thumbnailCredit = within(thumbnailButton.parentElement!).getByRole("link", { name: "두 번째 촬영자" });
  expect(thumbnailButton).not.toContainElement(thumbnailCredit);
  expect(thumbnailCredit).toHaveAttribute("href", googlePhotos[1].google?.authors[0].uri);

  fireEvent.click(screen.getByRole("button", { name: `${title} 사진 2 보기` }));
  expect(screen.getByRole("img", { name: title })).toHaveAttribute("src", googlePhotos[1].url);
  expect(screen.getByRole("status", { name: "현재 사진" })).toHaveTextContent("2 / 2");
  expect(heroCredit.getByRole("link", { name: "두 번째 촬영자" })).toHaveAttribute("href", googlePhotos[1].google?.authors[0].uri);
  expect(heroCredit.queryByRole("link", { name: "첫 번째 촬영자" })).not.toBeInTheDocument();
  expect(heroCredit.queryByRole("link", { name: "사진 신고" })).not.toBeInTheDocument();
});

test("removes a failed Google photo and its credit while preserving the next available photo", () => {
  render(gallery(googlePhotos));
  const hero = screen.getByRole("img", { name: title });
  fireEvent.error(hero);
  const heroCredit = within(screen.getByRole("group", { name: "대표 사진 출처" }));
  expect(heroCredit.getByRole("link", { name: "Google Maps" })).toBeInTheDocument();
  expect(heroCredit.getByRole("link", { name: "두 번째 촬영자" })).toBeInTheDocument();
  expect(heroCredit.queryByRole("link", { name: "사진 신고" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "첫 번째 촬영자" })).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: title })).toHaveAttribute("src", googlePhotos[1].url);
  expect(screen.queryByRole("button", { name: /사진 \d 보기/ })).not.toBeInTheDocument();

  fireEvent.error(screen.getByRole("img", { name: title }));
  expect(screen.queryByRole("link", { name: "Google Maps" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /촬영자/ })).not.toBeInTheDocument();
});

test("replaces Google attribution with similar-photo credit on failure and removes it for the final SVG", () => {
  render(gallery([googlePhotos[0]]));
  const hero = screen.getByRole("img", { name: title });

  fireEvent.error(hero);
  const fallback = screen.getByRole("img", { name: `${title} 유사 이미지: ${similarImage.title}` });
  expect(fallback).toHaveAttribute("src", similarImage.url);
  expect(screen.queryByText("Google Maps")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "첫 번째 촬영자" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "출처 및 이용 안내" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "유사 이미지 출처" })).toHaveAttribute("href", "/image-credits#similar-images");

  fireEvent.error(fallback);
  expect(fallback).toHaveAttribute("src", FALLBACK_SPOT_IMAGE);
  expect(screen.queryByRole("link", { name: "유사 이미지 출처" })).not.toBeInTheDocument();
  expect(screen.queryByRole("status", { name: "현재 사진" })).not.toBeInTheDocument();
});

test("preserves selection for unchanged photos and resets to the first photo when the list changes", () => {
  const { rerender } = render(gallery(googlePhotos));
  fireEvent.click(screen.getByRole("button", { name: "다음 사진" }));
  rerender(gallery(googlePhotos.map((photo) => ({ ...photo }))));
  expect(screen.getByRole("img", { name: title })).toHaveAttribute("src", googlePhotos[1].url);
  expect(screen.getByRole("status", { name: "현재 사진" })).toHaveTextContent("2 / 2");

  rerender(gallery([{ url: "https://example.com/new-first.jpg" }, { url: "https://example.com/new-second.jpg" }]));
  expect(screen.getByRole("img", { name: title })).toHaveAttribute("src", "https://example.com/new-first.jpg");
  expect(screen.getByRole("status", { name: "현재 사진" })).toHaveTextContent("1 / 2");
  expect(screen.getByRole("button", { name: `${title} 사진 1 보기` })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByText("Google Maps")).not.toBeInTheDocument();
});
