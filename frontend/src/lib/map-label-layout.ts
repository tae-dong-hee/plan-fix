export type MapPoint = { x: number; y: number };
export type MapLabelRect = MapPoint & { width: number; height: number };
export type MapLabelAnchor = MapPoint & {
  width: number;
  height: number;
  /** 선택한 장소의 이름을 먼저 배치한다. */
  priority?: number;
};

// 강조된 번호 원의 확대와 테두리까지 포함한 여유 공간.
const MARKER_CLEARANCE = 25;
const LABEL_GAP = 6;
const ROUTE_CLEARANCE = 6;
const VIEWPORT_PADDING = 8;

function expand(rect: MapLabelRect, padding: number): MapLabelRect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function overlaps(a: MapLabelRect, b: MapLabelRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** 선분을 사각형으로 잘라 대각선·수평·수직 동선을 같은 기준으로 판정한다. */
function crossesRect(start: MapPoint, end: MapPoint, rect: MapLabelRect): boolean {
  let min = 0;
  let max = 1;
  for (const axis of ["x", "y"] as const) {
    const delta = end[axis] - start[axis];
    const low = rect[axis];
    const high = low + (axis === "x" ? rect.width : rect.height);
    if (delta === 0) {
      if (start[axis] < low || start[axis] > high) return false;
    } else {
      const first = (low - start[axis]) / delta;
      const last = (high - start[axis]) / delta;
      min = Math.max(min, Math.min(first, last));
      max = Math.min(max, Math.max(first, last));
      if (min > max) return false;
    }
  }
  return true;
}

function candidates({ x, y, width, height }: MapLabelAnchor): MapLabelRect[] {
  // 번호와의 관계를 알아볼 수 있는 가까운 거리에서 여덟 방향을 시도한다.
  return [0, 16, 32].flatMap((offset) => {
    const gap = MARKER_CLEARANCE + LABEL_GAP + offset;
    return [
      { x: x + gap, y: y - height / 2, width, height },
      { x: x - gap - width, y: y - height / 2, width, height },
      { x: x - width / 2, y: y - gap - height, width, height },
      { x: x - width / 2, y: y + gap, width, height },
      // 가장자리나 촘촘한 장소에서는 위/아래 이름표의 정렬도 바꿔 공간을 확보한다.
      { x, y: y - gap - height, width, height },
      { x: x - width, y: y - gap - height, width, height },
      { x, y: y + gap, width, height },
      { x: x - width, y: y + gap, width, height },
      { x: x + gap, y: y - gap - height, width, height },
      { x: x - gap - width, y: y - gap - height, width, height },
      { x: x + gap, y: y + gap, width, height },
      { x: x - gap - width, y: y + gap, width, height },
    ];
  });
}

/**
 * 화면 좌표에서 이름표를 배치한다. 좌표와 방문 동선 자체는 이동하지 않는다.
 * 공간이 없는 이름표는 null로 반환해 마커와 선을 가리는 대신 숨긴다.
 * routePaths를 명시하면 표시 마커의 좌표와 별개인 실제 동선과 연결선을 피한다.
 */
export function layoutMapLabels(
  anchors: MapLabelAnchor[],
  viewport: { width: number; height: number },
  showRoute: boolean,
  routePaths: MapPoint[][] = showRoute ? [anchors] : [],
): Array<MapLabelRect | null> {
  const result: Array<MapLabelRect | null> = anchors.map(() => null);
  const markerRects = anchors.map(({ x, y }) => ({
    x: x - MARKER_CLEARANCE,
    y: y - MARKER_CLEARANCE,
    width: MARKER_CLEARANCE * 2,
    height: MARKER_CLEARANCE * 2,
  }));
  const available = anchors.map((anchor, index) => ({
    index,
    priority: anchor.priority ?? 0,
    candidates: anchor.x < 0 || anchor.x > viewport.width || anchor.y < 0 || anchor.y > viewport.height
      ? []
      : candidates(anchor).filter((rect) => {
        if (rect.x < VIEWPORT_PADDING || rect.y < VIEWPORT_PADDING
          || rect.x + rect.width > viewport.width - VIEWPORT_PADDING
          || rect.y + rect.height > viewport.height - VIEWPORT_PADDING) return false;
        if (markerRects.some((marker) => overlaps(rect, marker))) return false;
        const routeRect = expand(rect, ROUTE_CLEARANCE);
        return !routePaths.some((path) => path.some((point, i) =>
          i > 0 && crossesRect(path[i - 1], point, routeRect)));
      }),
  }));
  // 같은 우선순위에서는 배치 가능한 방향이 적은 장소부터 공간을 확보한다.
  available.sort((a, b) => b.priority - a.priority || a.candidates.length - b.candidates.length || a.index - b.index);
  const placed: MapLabelRect[] = [];
  available.forEach(({ index, candidates: options }) => {
    const rect = options.find((option) => !placed.some((other) => overlaps(option, expand(other, LABEL_GAP))));
    if (!rect) return;
    result[index] = rect;
    placed.push(rect);
  });
  if (result.every(Boolean) || available.some((entry) => entry.candidates.length === 0)) return result;

  // 먼저 놓은 이름표의 다른 방향도 살펴본다. 탐색량을 제한해 지도 이동을 지연시키지 않는다.
  const retry: Array<MapLabelRect | null> = anchors.map(() => null);
  const retryPlaced: MapLabelRect[] = [];
  let attempts = 0;
  const search = (depth: number): boolean => {
    if (depth === available.length) return true;
    const { index, candidates: options } = available[depth];
    for (const rect of options) {
      if (attempts >= 1500) return false;
      attempts += 1;
      if (retryPlaced.some((other) => overlaps(rect, expand(other, LABEL_GAP)))) continue;
      retry[index] = rect;
      retryPlaced.push(rect);
      if (search(depth + 1)) return true;
      retryPlaced.pop();
      retry[index] = null;
    }
    return false;
  };
  if (search(0)) return retry;
  return result;
}
