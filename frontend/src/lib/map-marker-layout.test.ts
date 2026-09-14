import { describe, expect, it } from "vitest";

import { separateMapMarkers } from "./map-marker-layout";
import type { MapPoint } from "./map-label-layout";

const viewport = { width: 324, height: 382 };
const distance = (first: MapPoint, second: MapPoint) => Math.hypot(
  first.x - second.x, first.y - second.y,
);

describe("가까운 지도 번호 원 분리", () => {
  it("모바일에서 가까운 두 장소만 짧게 이동해 번호 원을 분리한다", () => {
    const points = [
      { x: 39, y: 280 }, { x: 286, y: 116 },
      { x: 262, y: 101 }, { x: 139, y: 254 },
    ];
    const result = separateMapMarkers(points, viewport);
    expect(distance(result[1], result[2])).toBeGreaterThanOrEqual(48);
    expect(distance(result[1], points[1])).toBeLessThan(11);
    expect(distance(result[2], points[2])).toBeLessThan(11);
    expect(result[0]).toEqual(points[0]);
    expect(result[3]).toEqual(points[3]);
    expect(points[1]).toEqual({ x: 286, y: 116 });
  });

  it("겹치지 않는 장소는 가장자리에서도 이동하지 않는다", () => {
    const points = [{ x: 2, y: 5 }, { x: 160, y: 190 }, { x: 323, y: 380 }];
    expect(separateMapMarkers(points, viewport)).toEqual(points);
    expect(separateMapMarkers([], viewport)).toEqual([]);
  });

  it("가장자리에서 겹친 원은 화면 안쪽의 25px 여백을 유지하며 분리한다", () => {
    const result = separateMapMarkers([{ x: 4, y: 5 }, { x: 6, y: 8 }], viewport);
    expect(distance(result[0], result[1])).toBeGreaterThanOrEqual(48);
    for (const point of result) {
      expect(point.x).toBeGreaterThanOrEqual(25);
      expect(point.x).toBeLessThanOrEqual(viewport.width - 25);
      expect(point.y).toBeGreaterThanOrEqual(25);
      expect(point.y).toBeLessThanOrEqual(viewport.height - 25);
    }
  });

  it("위치가 같은 여러 장소도 실행마다 동일하게 분리한다", () => {
    const points = Array.from({ length: 4 }, () => ({ x: 160, y: 190 }));
    const result = separateMapMarkers(points, viewport);
    expect(separateMapMarkers(points, viewport)).toEqual(result);
    for (let i = 0; i < result.length; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) {
        expect(distance(result[i], result[j])).toBeGreaterThanOrEqual(48);
      }
    }
    expect(points).toEqual(Array.from({ length: 4 }, () => ({ x: 160, y: 190 })));
  });

  it("화면 밖의 장소는 이동하거나 화면 안의 번호 원을 밀지 않는다", () => {
    const points = [{ x: -1, y: 100 }, { x: 10, y: 100 }, { x: 325, y: 100 }];
    expect(separateMapMarkers(points, viewport)).toEqual(points);
  });
});
