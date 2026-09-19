import { fireEvent, render, screen } from "@testing-library/react";
import SpotImage, { FALLBACK_SPOT_IMAGE } from "@/components/ui/spot-image";

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
