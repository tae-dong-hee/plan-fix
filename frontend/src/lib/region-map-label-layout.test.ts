import { layoutRegionMapLabels, type RegionMapLabelPoint } from "@/lib/region-map-label-layout";

// Actual centers from the Gangwon region map's 800 × 699 viewBox.
const regionCenters = [
  [120, 174], [208, 210], [315, 195], [446, 94], [218, 330], [352, 390],
  [405, 240], [486, 197], [525, 275], [295, 585], [337, 502], [482, 470],
  [600, 390], [480, 635], [565, 535], [686, 489], [669, 652], [725, 580],
];

function project(width: number, height: number): RegionMapLabelPoint[] {
  const scale = Math.min(width / 800, height / 699);
  return regionCenters.map(([x, y]) => ({
    x: x * scale + (width - 800 * scale) / 2,
    y: y * scale + (height - 699 * scale) / 2,
  }));
}

function expectReadable(
  centers: RegionMapLabelPoint[],
  viewport: { width: number; height: number },
  labelSize = { width: 32, height: 24 },
) {
  centers.forEach((center, index) => {
    expect(center.x - labelSize.width / 2).toBeGreaterThanOrEqual(0);
    expect(center.y - labelSize.height / 2).toBeGreaterThanOrEqual(0);
    expect(center.x + labelSize.width / 2).toBeLessThanOrEqual(viewport.width);
    expect(center.y + labelSize.height / 2).toBeLessThanOrEqual(viewport.height);
    centers.slice(index + 1).forEach((other) => {
      const horizontalGap = Math.max(center.x, other.x) - Math.min(center.x, other.x) - labelSize.width;
      const verticalGap = Math.max(center.y, other.y) - Math.min(center.y, other.y) - labelSize.height;
      expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(2 - 1e-8);
    });
  });
}

describe("layoutRegionMapLabels", () => {
  test.each([
    [268, 154], [308, 234], [341, 256], [305, 233], [480, 288], [620, 550],
  ])("%d × %d 지도에서도 18개 이름이 겹치거나 잘리지 않는다", (width, height) => {
    const viewport = { width, height };
    const anchors = project(width, height);
    const labels = layoutRegionMapLabels(anchors, viewport);

    expect(labels).toHaveLength(18);
    expectReadable(labels, viewport);
    labels.forEach((label, index) => {
      expect(Math.hypot(label.x - anchors[index].x, label.y - anchors[index].y)).toBeLessThanOrEqual(32);
    });
  });

  test("넓은 지도에서는 원래 위치와 더 큰 글자 크기를 유지한다", () => {
    const viewport = { width: 620, height: 550 };
    const anchors = project(viewport.width, viewport.height);
    const size = { width: 40, height: 28 };
    const labels = layoutRegionMapLabels(anchors, viewport, size);

    expect(labels).toEqual(anchors);
    expectReadable(labels, viewport, size);
  });

  test("작은 창에서 더 멀리 옮겨야 해도 모든 지역 이름을 표시한다", () => {
    const viewport = { width: 280, height: 140 };
    const labels = layoutRegionMapLabels(project(viewport.width, viewport.height), viewport);

    expect(labels).toHaveLength(18);
    expectReadable(labels, viewport);
  });

  test("가장자리에서 잘리는 이름도 안으로 옮기며 입력 좌표는 변경하지 않는다", () => {
    const viewport = { width: 200, height: 100 };
    const anchors = Object.freeze([
      Object.freeze({ x: 0, y: 0 }), Object.freeze({ x: 200, y: 0 }),
      Object.freeze({ x: 0, y: 100 }), Object.freeze({ x: 200, y: 100 }),
    ]);
    const labels = layoutRegionMapLabels(anchors, viewport);

    expectReadable(labels, viewport);
    expect(layoutRegionMapLabels(anchors, viewport)).toEqual(labels);
  });
});
