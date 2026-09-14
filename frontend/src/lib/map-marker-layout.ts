import type { MapPoint } from "./map-label-layout";

const MIN_MARKER_DISTANCE = 48;
const VIEWPORT_PADDING = 25;
const RELAXATION_STEPS = 32;

/** 가까운 번호 원만 화면 안에서 조금씩 벌린다. 원래 지리 좌표는 수정하지 않는다. */
export function separateMapMarkers(
  points: MapPoint[],
  viewport: { width: number; height: number },
): MapPoint[] {
  const result = points.map((point) => ({ ...point }));
  const visible = points.map(({ x, y }) => (
    x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height
  ));
  const paddingX = Math.min(VIEWPORT_PADDING, viewport.width / 2);
  const paddingY = Math.min(VIEWPORT_PADDING, viewport.height / 2);
  const clamp = (point: MapPoint): void => {
    point.x = Math.max(paddingX, Math.min(viewport.width - paddingX, point.x));
    point.y = Math.max(paddingY, Math.min(viewport.height - paddingY, point.y));
  };

  for (let step = 0; step < RELAXATION_STEPS; step += 1) {
    let moved = false;
    for (let i = 0; i < result.length; i += 1) {
      if (!visible[i]) continue;
      for (let j = i + 1; j < result.length; j += 1) {
        if (!visible[j]) continue;
        const first = result[i];
        const second = result[j];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= MIN_MARKER_DISTANCE) continue;

        // 같은 위치도 입력 순서에 따라 일정한 방향으로 분리한다.
        const angle = ((i + j) % 8) * Math.PI / 4;
        const unitX = distance > 0 ? dx / distance : Math.cos(angle);
        const unitY = distance > 0 ? dy / distance : Math.sin(angle);
        // 가장자리에서 한쪽이 막히는 경우도 유한한 반복 안에 간격을 확보한다.
        const shift = (MIN_MARKER_DISTANCE - distance + 0.25) / 2;
        first.x -= unitX * shift;
        first.y -= unitY * shift;
        second.x += unitX * shift;
        second.y += unitY * shift;
        clamp(first);
        clamp(second);
        moved = true;
      }
    }
    if (!moved) break;
  }

  return result;
}
