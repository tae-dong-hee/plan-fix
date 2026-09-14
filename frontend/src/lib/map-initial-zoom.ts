import { layoutMapLabels, type MapLabelAnchor } from "./map-label-layout";

// 번호 원과 선택 상태의 테두리가 지도 가장자리에서 잘리지 않도록 확보한다.
const MARKER_EDGE_CLEARANCE = 30;

/** 모든 장소와 이름표가 보이는 범위에서 가장 가까운 최초 확대 수준을 고른다. */
export function chooseInitialMapZoom(
  anchors: MapLabelAnchor[],
  viewport: { width: number; height: number },
  currentLevel: number,
  showRoute: boolean,
): number {
  if (anchors.length < 2 || currentLevel <= 1) return currentLevel;

  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  let chosenLevel = currentLevel;

  for (let level = currentLevel; level >= 1; level -= 1) {
    // 카카오 지도는 한 단계 확대할 때 현재 중심에서의 화면 거리가 두 배가 된다.
    const scale = 2 ** (currentLevel - level);
    const scaledAnchors = anchors.map((anchor) => ({
      ...anchor,
      x: centerX + (anchor.x - centerX) * scale,
      y: centerY + (anchor.y - centerY) * scale,
    }));
    if (scaledAnchors.some(({ x, y }) => (
      x < MARKER_EDGE_CLEARANCE || x > viewport.width - MARKER_EDGE_CLEARANCE
      || y < MARKER_EDGE_CLEARANCE || y > viewport.height - MARKER_EDGE_CLEARANCE
    ))) break;

    if (layoutMapLabels(scaledAnchors, viewport, showRoute).every((label) => label !== null)) {
      chosenLevel = level;
    }
  }

  return chosenLevel;
}
