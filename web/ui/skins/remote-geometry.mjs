const center = 180;
export function polar(radius, angle) {
  const r = (angle * Math.PI) / 180;
  return { x: center + radius * Math.sin(r), y: center - radius * Math.cos(r) };
}
const f = (n) => Number(n.toFixed(3));
export function arcButton(start, end, inner = 143, outer = 171) {
  const angles = [start, end];
  for (let a = Math.ceil(start / 90) * 90; a < end; a += 90) angles.push(a);
  const points = angles.flatMap((a) => [polar(inner, a), polar(outer, a)]);
  const left = Math.floor(Math.min(...points.map((p) => p.x))) - 2,
    top = Math.floor(Math.min(...points.map((p) => p.y))) - 2;
  const width = Math.ceil(Math.max(...points.map((p) => p.x))) - left + 2,
    height = Math.ceil(Math.max(...points.map((p) => p.y))) - top + 2;
  const coord = (p) => `${f(p.x - left)} ${f(p.y - top)}`;
  const a = polar(outer, start),
    b = polar(outer, end),
    c = polar(inner, end),
    d = polar(inner, start);
  const path = `M${coord(a)} A${outer} ${outer} 0 0 1 ${coord(b)} L${coord(c)} A${inner} ${inner} 0 0 0 ${coord(d)} Z`;
  const radius = (inner + outer) / 2,
    mid = (start + end) / 2,
    reversed = mid > 90 && mid < 270;
  const label = `M${coord(polar(radius, reversed ? end : start))} A${radius} ${radius} 0 0 ${reversed ? 0 : 1} ${coord(polar(radius, reversed ? start : end))}`;
  const point = polar(radius, mid);
  return {
    left,
    top,
    width,
    height,
    path,
    label,
    x: f(point.x - left),
    y: f(point.y - top),
    outer,
  };
}
