export type RegionMapLabelPoint = { x: number; y: number };
type Size = { width: number; height: number };

const nearbyOffsets: RegionMapLabelPoint[] = [];
for (let x = -32; x <= 32; x += 1) {
  for (let y = -32; y <= 32; y += 1) {
    if (x * x + y * y <= 32 * 32) nearbyOffsets.push({ x, y });
  }
}
nearbyOffsets.sort((a, b) => a.x * a.x + a.y * a.y - b.x * b.x - b.y * b.y
  || Math.abs(a.y) - Math.abs(b.y) || a.y - b.y || a.x - b.x);

/** Keep every region name at a readable screen size, moving only its label. */
export function layoutRegionMapLabels(
  anchors: readonly RegionMapLabelPoint[],
  viewport: Size,
  labelSize: Size = { width: 32, height: 24 },
  gap = 2,
): RegionMapLabelPoint[] {
  const halfWidth = labelSize.width / 2;
  const halfHeight = labelSize.height / 2;
  const clamp = ({ x, y }: RegionMapLabelPoint): RegionMapLabelPoint => ({
    x: Math.max(halfWidth, Math.min(viewport.width - halfWidth, x)),
    y: Math.max(halfHeight, Math.min(viewport.height - halfHeight, y)),
  });
  const inside = ({ x, y }: RegionMapLabelPoint) => x >= halfWidth && y >= halfHeight
    && x <= viewport.width - halfWidth && y <= viewport.height - halfHeight;
  const distance = (a: RegionMapLabelPoint, b: RegionMapLabelPoint) =>
    (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const overlaps = (a: RegionMapLabelPoint, b: RegionMapLabelPoint) =>
    Math.abs(a.x - b.x) < labelSize.width + gap
      && Math.abs(a.y - b.y) < labelSize.height + gap;
  const options = anchors.map((anchor) => nearbyOffsets
    .map((offset) => ({ x: anchor.x + offset.x, y: anchor.y + offset.y }))
    .filter(inside));
  const indices = anchors.map((_, index) => index);
  // A crowded coast can block later names in one direction but fit in the other.
  const orders = [indices, ...["x", "y"].flatMap((axis) => [1, -1].map((direction) =>
    [...indices].sort((a, b) => direction
      * (anchors[a][axis as "x" | "y"] - anchors[b][axis as "x" | "y"]) || a - b)))];
  let best: RegionMapLabelPoint[] | undefined;
  let bestDistance = Infinity;
  for (const order of orders) {
    const result: RegionMapLabelPoint[] = [];
    const placed: RegionMapLabelPoint[] = [];
    for (const index of order) {
      const candidate = options[index].find((point) => !placed.some((other) => overlaps(point, other)));
      if (!candidate) break;
      result[index] = candidate;
      placed.push(candidate);
    }
    if (placed.length !== anchors.length) continue;
    const movement = result.reduce((total, point, index) => total + distance(point, anchors[index]), 0);
    if (movement < bestDistance) { best = result; bestDistance = movement; }
    if (movement === 0) break;
  }
  if (best) return best;

  // Unusually short viewports may need more than 32px of movement. Reserve a
  // distinct visible slot for every name instead of shrinking or hiding text.
  const slots: RegionMapLabelPoint[] = [];
  for (let y = halfHeight; y <= viewport.height - halfHeight; y += labelSize.height + gap) {
    for (let x = halfWidth; x <= viewport.width - halfWidth; x += labelSize.width + gap) {
      slots.push({ x, y });
    }
  }
  return anchors.map((anchor) => {
    slots.sort((a, b) => distance(a, anchor) - distance(b, anchor));
    return slots.shift() ?? clamp(anchor);
  });
}
