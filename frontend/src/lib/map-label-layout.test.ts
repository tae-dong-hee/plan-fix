import {
  layoutMapLabels,
  type MapLabelAnchor,
  type MapLabelRect,
  type MapPoint,
} from "@/lib/map-label-layout";

const viewport = { width: 900, height: 450 };
const anchor = (x: number, y: number, width = 120): MapLabelAnchor => ({
  x, y, width, height: 28,
});

function contains(rect: MapLabelRect, point: MapPoint): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

// 교차 여부는 배치 구현의 사각형 클리핑과 별개로 선분 네 변을 검사한다.
function segmentsIntersect(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint): boolean {
  const turn = (p: MapPoint, q: MapPoint, r: MapPoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const extent = (p: MapPoint, q: MapPoint): MapLabelRect => ({
    x: Math.min(p.x, q.x), y: Math.min(p.y, q.y),
    width: Math.abs(q.x - p.x), height: Math.abs(q.y - p.y),
  });
  const abc = turn(a, b, c);
  const abd = turn(a, b, d);
  const cda = turn(c, d, a);
  const cdb = turn(c, d, b);
  if (abc === 0 && contains(extent(a, b), c)) return true;
  if (abd === 0 && contains(extent(a, b), d)) return true;
  if (cda === 0 && contains(extent(c, d), a)) return true;
  if (cdb === 0 && contains(extent(c, d), b)) return true;
  return abc * abd < 0 && cda * cdb < 0;
}

function intersectsRoute(rect: MapLabelRect, start: MapPoint, end: MapPoint): boolean {
  if (contains(rect, start) || contains(rect, end)) return true;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  return corners.some((corner, i) => segmentsIntersect(start, end, corner, corners[(i + 1) % 4]));
}

function expectSafeLayout(
  anchors: MapLabelAnchor[],
  labels: Array<MapLabelRect | null>,
  size = viewport,
  showRoute = true,
  routePaths: MapPoint[][] = showRoute ? [anchors] : [],
) {
  expect(labels).toHaveLength(anchors.length);
  const visible = labels.filter((label): label is MapLabelRect => label !== null);
  visible.forEach((label, index) => {
    expect(label.x).toBeGreaterThanOrEqual(0);
    expect(label.y).toBeGreaterThanOrEqual(0);
    expect(label.x + label.width).toBeLessThanOrEqual(size.width);
    expect(label.y + label.height).toBeLessThanOrEqual(size.height);

    anchors.forEach((point) => {
      const closestX = Math.max(label.x, Math.min(point.x, label.x + label.width));
      const closestY = Math.max(label.y, Math.min(point.y, label.y + label.height));
      // 확대된 원과 강조 테두리를 포함해 이름표와 여유가 있어야 한다.
      expect(Math.hypot(point.x - closestX, point.y - closestY)).toBeGreaterThanOrEqual(24);
    });

    visible.slice(index + 1).forEach((other) => {
      const horizontalGap = Math.max(label.x, other.x)
        - Math.min(label.x + label.width, other.x + other.width);
      const verticalGap = Math.max(label.y, other.y)
        - Math.min(label.y + label.height, other.y + other.height);
      expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(4);
    });

    routePaths.forEach((path) => {
      const padded = { x: label.x - 4, y: label.y - 4, width: label.width + 8, height: label.height + 8 };
      path.slice(1).forEach((end, i) => {
        expect(intersectsRoute(padded, path[i], end)).toBe(false);
      });
    });
  });
}

describe("layoutMapLabels", () => {
  test("가까운 첫 두 장소와 꺾이는 네 장소 동선의 이름을 모두 읽을 수 있다", () => {
    const anchors = [
      anchor(460, 70, 170),
      anchor(605, 70, 160),
      anchor(484, 245, 92),
      anchor(512, 296, 100),
    ];

    const labels = layoutMapLabels(anchors, viewport, true);

    expect(labels.every(Boolean)).toBe(true);
    expectSafeLayout(anchors, labels);
  });

  test("실제 두 번째 날 지도에서 오른쪽 위의 인접 장소명까지 모두 배치한다", () => {
    const size = { width: 796, height: 542 };
    const anchors: MapLabelAnchor[] = [
      { x: 150, y: 451, width: 100, height: 29, priority: 1 },
      { x: 647, y: 120, width: 130, height: 29 },
      { x: 597, y: 91, width: 80, height: 29 },
      { x: 351, y: 399, width: 68, height: 29 },
    ];

    const labels = layoutMapLabels(anchors, size, true);

    expect(labels.every(Boolean)).toBe(true);
    expectSafeLayout(anchors, labels, size);
  });

  test.each([
    { name: "수평", anchors: [anchor(170, 200), anchor(470, 200)] },
    { name: "수직", anchors: [anchor(220, 100), anchor(220, 340)] },
    { name: "대각선", anchors: [anchor(180, 100), anchor(440, 350)] },
    { name: "방문 순서가 반대인 대각선", anchors: [anchor(440, 350), anchor(180, 100)] },
    { name: "길이가 없는 구간", anchors: [anchor(300, 200), anchor(300, 200)] },
  ])("$name 구간을 이름표가 가리지 않는다", ({ anchors }) => {
    const labels = layoutMapLabels(anchors, viewport, true);

    expect(labels.every(Boolean)).toBe(true);
    expectSafeLayout(anchors, labels);
  });

  test("현재 장소와 인접하지 않은 동선 구간도 피한다", () => {
    const anchors = [
      anchor(270, 220), anchor(500, 90), anchor(650, 220), anchor(90, 220),
    ];

    const labels = layoutMapLabels(anchors, viewport, true);

    expect(labels.every(Boolean)).toBe(true);
    expectSafeLayout(anchors, labels);
    expect(intersectsRoute(labels[0]!, anchors[2], anchors[3])).toBe(false);
  });

  test("지도 네 귀퉁이에서 긴 이름이 지도 밖으로 잘리지 않는다", () => {
    const anchors = [
      anchor(20, 20, 170), anchor(880, 20, 170),
      anchor(880, 430, 170), anchor(20, 430, 170),
    ];

    const labels = layoutMapLabels(anchors, viewport, false);

    expect(labels.every(Boolean)).toBe(true);
    expectSafeLayout(anchors, labels, viewport, false);
  });

  test("가까운 여러 장소의 이름표끼리도 겹치지 않는다", () => {
    const anchors = [anchor(300, 160, 150), anchor(370, 200, 160), anchor(310, 250, 145)];

    const labels = layoutMapLabels(anchors, viewport, true);

    expect(labels.every(Boolean)).toBe(true);
    expectSafeLayout(anchors, labels);
  });

  test("먼저 배치한 이름표의 방향을 바꾸면 모두 들어가는 경우 재배치한다", () => {
    const size = { width: 460, height: 320 };
    const anchors: MapLabelAnchor[] = [
      { x: 310, y: 103, width: 126, height: 29, priority: 2 },
      { x: 236, y: 106, width: 119, height: 29 },
      { x: 69, y: 162, width: 64, height: 29 },
      { x: 70, y: 86, width: 154, height: 29 },
      { x: 409, y: 137, width: 125, height: 29 },
    ];

    const labels = layoutMapLabels(anchors, size, true);

    expect(labels.every(Boolean)).toBe(true);
    expectSafeLayout(anchors, labels, size);
  });

  test.each([true, false])("마커를 분리해도 명시한 실제 동선과 연결선을 피한다 (showRoute=%s)", (showRoute) => {
    const anchors = [anchor(250, 170), anchor(400, 100), anchor(650, 300)];
    const routePaths: MapPoint[][] = [
      [{ x: 150, y: 170 }, { x: 400, y: 170 }, { x: 650, y: 300 }],
      [{ x: 150, y: 170 }, { x: 250, y: 170 }],
      [{ x: 400, y: 170 }, { x: 400, y: 100 }],
    ];

    const labels = layoutMapLabels(anchors, viewport, showRoute, routePaths);

    expect(labels.every(Boolean)).toBe(true);
    expectSafeLayout(anchors, labels, viewport, showRoute, routePaths);
  });

  test("모바일 지도 가장자리의 긴 이름도 분리한 인접 마커를 피해서 모두 배치한다", () => {
    const size = { width: 322, height: 382 };
    const original: MapLabelAnchor[] = [
      { x: 38, y: 280, width: 102, height: 29, priority: 1 },
      { x: 286, y: 115, width: 135, height: 29 },
      { x: 261, y: 100, width: 82, height: 29 },
      { x: 138, y: 254, width: 63, height: 29 },
    ];
    const anchors = original.map((point, index) => ({
      ...point,
      x: point.x + (index === 1 ? 8.187 : index === 2 ? -8.187 : 0),
      y: point.y + (index === 1 ? 4.912 : index === 2 ? -4.912 : 0),
    }));
    const routePaths = [original, ...original.map((point, index) => [point, anchors[index]])];

    const labels = layoutMapLabels(anchors, size, true, routePaths);

    expect(labels.every(Boolean)).toBe(true);
    expectSafeLayout(anchors, labels, size, true, routePaths);
  });

  test("동선을 표시하지 않으면 선이 지나갈 공간도 이름표에 사용할 수 있다", () => {
    const narrow = { width: 420, height: 80 };
    const anchors = [anchor(50, 40, 100), anchor(360, 40, 100)];

    const labelsWithoutRoute = layoutMapLabels(anchors, narrow, false);
    const labelsWithRoute = layoutMapLabels(anchors, narrow, true);

    expect(labelsWithoutRoute.every(Boolean)).toBe(true);
    expect(labelsWithRoute).toEqual([null, null]);
    expectSafeLayout(anchors, labelsWithoutRoute, narrow, false);
  });

  test("배치할 공간이 없으면 마커나 선 위에 글자를 놓지 않는다", () => {
    const small = { width: 100, height: 70 };
    const anchors = [anchor(50, 35, 170)];

    expect(layoutMapLabels(anchors, small, true)).toEqual([null]);
  });

  test("재배치로도 전부 들어가지 않으면 선택한 장소를 포함한 안전한 배치를 유지한다", () => {
    const small = { width: 360, height: 160 };
    const anchors = Array.from({ length: 8 }, (_, index) => ({
      ...anchor(180, 80, 170), priority: index === 7 ? 1 : 0,
    }));

    const labels = layoutMapLabels(anchors, small, false);

    expect(labels[7]).not.toBeNull();
    expect(labels.some((label) => label === null)).toBe(true);
    expectSafeLayout(anchors, labels, small, false);
  });

  test("화면 밖 장소의 이름표를 지도 안에 홀로 표시하지 않는다", () => {
    const anchors = [anchor(-10, 200), anchor(920, 200), anchor(450, -10), anchor(450, 470)];

    expect(layoutMapLabels(anchors, viewport, false)).toEqual([null, null, null, null]);
  });
});
