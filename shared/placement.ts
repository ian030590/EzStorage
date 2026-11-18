import type { Item } from "./model.ts";

export function nextItemPosition(items: Pick<Item, "unit" | "layer" | "x" | "y">[], unit: string, layer: number) {
  var occupied = items.filter(function (item) { return item.unit === unit && item.layer === layer; });
  function clearance(point: { x: number; y: number }) {
    return occupied.reduce(function (nearest, item, index) {
      var x = item.x === undefined ? .18 + (index % 3) * .32 : item.x;
      var y = item.y === undefined ? .25 + (Math.floor(index / 3) % 2) * .45 : item.y;
      return Math.min(nearest, Math.hypot(point.x - x, point.y - y));
    }, Infinity);
  }
  var preferred = [.25, .7].flatMap(function (y) {
    return [.18, .5, .82].map(function (x) { return { x: x, y: y }; });
  });
  var free = preferred.find(function (point) { return clearance(point) >= .2; });
  if (free) { return free; }
  var divisions = Math.max(4, Math.ceil(Math.sqrt(occupied.length + 1)));
  var best = preferred[0], distance = -1;
  for (var row = 0; row < divisions; row++) {
    for (var column = 0; column < divisions; column++) {
      var candidate = { x: .1 + .8 * column / (divisions - 1), y: .15 + .65 * row / (divisions - 1) };
      var gap = clearance(candidate);
      if (gap > distance) { best = candidate; distance = gap; }
    }
  }
  return best;
}
