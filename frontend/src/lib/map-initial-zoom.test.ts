import { describe, expect, it } from "vitest";

import { chooseInitialMapZoom } from "./map-initial-zoom";
import { layoutMapLabels, type MapLabelAnchor } from "./map-label-layout";

const viewport = { width: 800, height: 600 };
const anchor = (x: number, y: number, width = 160): MapLabelAnchor => ({
  x, y, width, height: 32,
});

describe("지도 최초 확대 수준", () => {
  it("가까운 장소는 모든 이름표를 표시할 수 있는 가장 가까운 수준까지 확대한다", () => {
    const anchors = [anchor(390, 300), anchor(400, 300), anchor(410, 300)];
    expect(chooseInitialMapZoom(anchors, viewport, 6, true)).toBe(1);
    expect(anchors.map(({ x }) => x)).toEqual([390, 400, 410]);
  });

  it("멀리 떨어진 장소가 화면 밖으로 잘리면 확대하지 않는다", () => {
    expect(chooseInitialMapZoom([
      anchor(70, 100), anchor(730, 500),
    ], viewport, 6, true)).toBe(6);
  });

  it("선택한 확대 수준에서 모든 마커에 여백을 두고 동선을 피해 이름표를 배치한다", () => {
    const anchors = [anchor(380, 285), anchor(400, 300), anchor(420, 315)];
    const currentLevel = 6;
    const level = chooseInitialMapZoom(anchors, viewport, currentLevel, true);
    expect(level).toBeLessThan(currentLevel);
    const scale = 2 ** (currentLevel - level);
    const scaled = anchors.map((point) => ({
      ...point,
      x: viewport.width / 2 + (point.x - viewport.width / 2) * scale,
      y: viewport.height / 2 + (point.y - viewport.height / 2) * scale,
    }));
    for (const point of scaled) {
      expect(point.x).toBeGreaterThanOrEqual(30);
      expect(point.x).toBeLessThanOrEqual(viewport.width - 30);
      expect(point.y).toBeGreaterThanOrEqual(30);
      expect(point.y).toBeLessThanOrEqual(viewport.height - 30);
    }
    expect(layoutMapLabels(scaled, viewport, true).every(Boolean)).toBe(true);
  });

  it("이름표가 들어갈 공간이 없는 경우 원래 수준을 유지한다", () => {
    expect(chooseInitialMapZoom([
      anchor(350, 300, 1000), anchor(450, 300, 1000),
    ], viewport, 6, true)).toBe(6);
  });

  it("장소가 없거나 하나뿐이면 원래 수준을 유지한다", () => {
    expect(chooseInitialMapZoom([], viewport, 6, true)).toBe(6);
    expect(chooseInitialMapZoom([anchor(400, 300)], viewport, 6, false)).toBe(6);
  });

  it("최대 확대 상태에서 더 확대하지 않는다", () => {
    expect(chooseInitialMapZoom([
      anchor(380, 300), anchor(420, 300),
    ], viewport, 1, false)).toBe(1);
  });
});
