/** Pure helpers shared by the dashboard's SVG charts (client components import them; nothing here touches the DOM). */

export function niceStep(range: number, count: number): number {
  const raw = range / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

export function niceTicks(min: number, max: number, count: number, clock: boolean): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  let step = niceStep(max - min, count);
  if (clock) step = Math.max(30, Math.ceil(step / 30) * 30); // half-hour grid for clock times
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

export function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(d)}.${Number(m)}`;
}

export function longDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("he-IL", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "numeric",
  });
}

/** Bar with a rounded data end and a square foot on the baseline. */
export function barPath(x: number, y: number, w: number, base: number): string {
  const h = base - y;
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

/** Line path that breaks at missing values instead of bridging gaps. */
export function linePath(points: Array<[number, number] | null>): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** Filled area under a line, one closed shape per unbroken run (gaps stay empty). */
export function areaPath(points: Array<[number, number] | null>, baseY: number): string {
  let d = "";
  let run: Array<[number, number]> = [];
  const flush = () => {
    if (run.length > 1) {
      const first = run[0] as [number, number];
      const last = run[run.length - 1] as [number, number];
      d += `M${first[0].toFixed(1)},${baseY.toFixed(1)}${run.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("")}L${last[0].toFixed(1)},${baseY.toFixed(1)}Z`;
    }
    run = [];
  };
  for (const p of points) {
    if (p) run.push(p);
    else flush();
  }
  flush();
  return d;
}
