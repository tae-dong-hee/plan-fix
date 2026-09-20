import { fireEvent, render, screen } from "@testing-library/react";
import SpotImage, { FALLBACK_SPOT_IMAGE } from "@/components/ui/spot-image";
import { getSimilarSpotImage } from "@/lib/similar-spot-images";

test.each([null, undefined, "", "  "])("shows the default image for a missing source (%s)", (src) => {
  render(<SpotImage src={src} alt="장소 사진" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", FALLBACK_SPOT_IMAGE);
});

test("replaces broken photos without a retry loop and loads a new source on navigation", () => {
  const { rerender } = render(<SpotImage src="https://example.com/broken.jpg" alt="장소 사진" />);
  const img = screen.getByRole("img");
  fireEvent.error(img);
  expect(img).toHaveAttribute("src", FALLBACK_SPOT_IMAGE);
  fireEvent.error(img);
  expect(img).toHaveAttribute("src", FALLBACK_SPOT_IMAGE);

  rerender(<SpotImage src=" https://example.com/new.jpg " alt="새 장소 사진" />);
  expect(screen.getByRole("img", { name: "새 장소 사진" })).toHaveAttribute("src", "https://example.com/new.jpg");
});

test("credits the displayed verified photo, preserves a supplied title, and clears credit after failure", () => {
  const source = "https://planfix.cloud/images/verified-spots/526.jpg";
  const { rerender } = render(<SpotImage src={` ${source} `} alt="임당동 성당" className="h-full object-cover group-hover:scale-105" />);
  const img = screen.getByRole("img");
  expect(img.getAttribute("title")).toContain("Trainholic · CC BY-SA 4.0");
  expect(img.getAttribute("title")).toContain("https://commons.wikimedia.org/wiki/File:Imdang-dong_Catholic_Church,_Gangneung.jpg");
  expect(img).toHaveClass("h-full", "object-contain", "group-hover:scale-100");
  expect(img).not.toHaveClass("object-cover", "group-hover:scale-105");

  rerender(<SpotImage src={source} alt="임당동 성당" title="기존 안내" />);
  expect(img).toHaveAttribute("title", "기존 안내");

  rerender(<SpotImage src={source} alt="임당동 성당" />);
  fireEvent.error(img);
  expect(img).toHaveAttribute("src", FALLBACK_SPOT_IMAGE);
  expect(img).not.toHaveAttribute("title");

  rerender(<SpotImage src="https://unrelated.example/images/verified-spots/526.jpg" alt="다른 사진" />);
  expect(img).not.toHaveAttribute("title");
});

test("keeps the original photo, then recovers with a labelled similar photo and finally the placeholder", () => {
  const similarImage = getSimilarSpotImage({ spotId: 1, title: "바다횟집", category: "음식점" });
  const onSourceChange = vi.fn();
  render(<SpotImage src="https://example.com/restaurant.jpg" alt="바다횟집" similarImage={similarImage} onSourceChange={onSourceChange} />);
  const img = screen.getByRole("img", { name: "바다횟집" });
  expect(img).toHaveAttribute("src", "https://example.com/restaurant.jpg");
  expect(onSourceChange).toHaveBeenLastCalledWith("https://example.com/restaurant.jpg");
  expect(screen.queryByText("유사 이미지")).not.toBeInTheDocument();

  fireEvent.error(img);
  expect(img).toHaveAttribute("src", similarImage.url);
  expect(onSourceChange).toHaveBeenLastCalledWith(similarImage.url);
  expect(img).toHaveAccessibleName(expect.stringContaining("바다횟집 유사 이미지"));
  expect(img).toHaveAttribute("title", expect.stringContaining(similarImage.author));
  expect(screen.getByText("유사 이미지")).toBeInTheDocument();

  fireEvent.error(img);
  expect(img).toHaveAttribute("src", FALLBACK_SPOT_IMAGE);
  expect(onSourceChange).toHaveBeenLastCalledWith(FALLBACK_SPOT_IMAGE);
  expect(screen.queryByText("유사 이미지")).not.toBeInTheDocument();
  fireEvent.error(img);
  expect(img).toHaveAttribute("src", FALLBACK_SPOT_IMAGE);
  expect(onSourceChange).toHaveBeenCalledTimes(3);
});

test("empty thumbnails use the matched photo and navigation can retry the original source", () => {
  const similarImage = getSimilarSpotImage({ spotId: 1, title: "사진 없는 카페", category: "카페/음료" });
  const { rerender } = render(<SpotImage src="  " alt="카페" similarImage={similarImage} />);
  expect(screen.getByRole("img")).toHaveAttribute("src", similarImage.url);
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("img")).toHaveAttribute("src", FALLBACK_SPOT_IMAGE);

  rerender(<SpotImage src="https://example.com/new.jpg" alt="새 카페" similarImage={similarImage} />);
  expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.com/new.jpg");
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("img")).toHaveAttribute("src", similarImage.url);
});

test("compact thumbnails keep the full accessible description with a short visible label", () => {
  const similarImage = getSimilarSpotImage({ spotId: 1, title: "작은 카페", category: "카페/음료" });
  render(<SpotImage alt="작은 카페" similarImage={similarImage} compactSimilarLabel />);
  expect(screen.getByRole("img")).toHaveAccessibleName(expect.stringContaining("작은 카페 유사 이미지"));
  expect(screen.getByText("유사")).toBeInTheDocument();
  expect(screen.getByRole("img")).not.toHaveAttribute("compactSimilarLabel");
});
