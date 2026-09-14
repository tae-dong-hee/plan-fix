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
