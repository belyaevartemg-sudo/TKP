// Раскладка подписей поездов на карте Z4 (перенос geo/labels.py).
// Правило: подпись в два этажа стоит в общей сетке рядов карты (шаг 46 px) над или под своим поездом;
// выноска – отрезок от верха или низа значка к краю подписи. Подписи не перекрывают друг друга и значки,
// выноски не пересекаются и не идут через чужие значки, подписи и занятые зоны (ореол НС).
// Поиск с минимумом конфликтов; если за отведённое время раскладки нет, подпись самого младшего
// поезда снимается (значок остаётся) и поиск продолжается.

// ряды подписей – сетка с шагом 46 px (четверть высоты подписи с зазором): подписи выровнены по общим линиям,
// но могут встать ближе к своему поезду, чем при шаге в целую подпись
const W_MAP = 2360, H_MAP = 1410, LH = 180, GAP = 4, MARGIN = 8, MK = 37, SHIFT = 1000, STEP = 24, PER_ROW = 30, ROW_STEP = 46;

function hit(a, b, m) {
  return a[0] < b[2] + m && b[0] < a[2] + m && a[1] < b[3] + m && b[1] < a[3] + m;
}
// отрезок (без концов) проходит через прямоугольник r, расширенный на 6 по x
function leadHits(l, r) {
  const x1 = l[0], y1 = l[1], dx = l[2] - x1, dy = l[3] - y1;
  let t0 = 0.02, t1 = 0.98;
  const pq = [[-dx, x1 - (r[0] - 6)], [dx, r[2] + 6 - x1], [-dy, y1 - r[1]], [dy, r[3] - y1]];
  for (const [p, q] of pq) {
    if (p === 0) { if (q <= 0) return false; }
    else {
      const v = q / p;
      if (p < 0) { if (v > t0) t0 = v; } else if (v < t1) t1 = v;
      if (t0 >= t1) return false;
    }
  }
  return true;
}
function cross(a, b) {
  const o = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = o(b[0], b[1], b[2], b[3], a[0], a[1]), d2 = o(b[0], b[1], b[2], b[3], a[2], a[3]);
  const d3 = o(a[0], a[1], a[2], a[3], b[0], b[1]), d4 = o(a[0], a[1], a[2], a[3], b[2], b[3]);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}
// совместимы ли два места разных поездов
function pairOk(c1, c2) {
  return !(hit(c1.r, c2.r, MARGIN) || leadHits(c1.l, c2.r) || leadHits(c2.l, c1.r) || cross(c1.l, c2.l));
}

// мулберри: воспроизводимый случайный поток
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * dots: [{id, x, y}] – все значки на карте (подписанные и нет);
 * want: [{id, w, prio}] – кого подписать, ширина подписи, приоритет (больше – важнее);
 * fixed: [[x0,y0,x1,y1]] – занятые зоны; topLimit – верх первого ряда.
 * Возвращает {placed: {id: {r, l}}, dropped: [id], ms}.
 */
export function layoutLabels({ dots, want, fixed = [], topLimit = 12, seed = 1, budgetMs = 2500, rowStep = ROW_STEP, shift = SHIFT, perRow = PER_ROW }) {
  const t0 = performance.now();
  const rnd = rng(seed);
  const pos = Object.fromEntries(dots.map(d => [d.id, d]));
  const marks = dots.map(d => ({ id: d.id, r: [d.x - MK, d.y - MK, d.x + MK, d.y + MK] }));
  const grid = [];
  for (let y = topLimit; y <= H_MAP - MARGIN - LH; y += rowStep) grid.push(y);

  function okStatic(id, r, l) {
    for (const m of marks) {
      if (hit(r, m.r, 6)) return false;
      if (m.id !== id && leadHits(l, [m.r[0] + 6, m.r[1], m.r[2] - 6, m.r[3]])) return false;
    }
    for (const f of fixed) if (hit(r, f, MARGIN) || leadHits(l, f)) return false;
    return true;
  }
  function domain(t) {
    const { x, y } = pos[t.id], w = t.w, all = [];
    for (const ry of grid) {
      let sy, ay, dist;
      if (ry + LH <= y - MK - MARGIN) { sy = y - MK; ay = ry + LH; dist = sy - ay; }
      else if (ry >= y + MK + MARGIN) { sy = y + MK; ay = ry; dist = ry - sy; }
      else continue;
      const row = [];
      for (let L = x - w - shift; L < x + shift; L += STEP) {
        if (L < MARGIN || L + w > W_MAP - MARGIN) continue;
        const ax = Math.min(Math.max(x, L + 24), L + w - 24);
        const c = { cost: dist * 6 + Math.abs(ax - x) * 3 + Math.abs(L + 24 - x) * 0.2,
                    r: [L, ry, L + w, ry + LH], l: [x, sy, ax, ay] };
        if (okStatic(t.id, c.r, c.l)) row.push(c);
      }
      row.sort((a, b) => a.cost - b.cost);
      all.push(...row.slice(0, perRow));
    }
    return all.sort((a, b) => a.cost - b.cost);
  }

  let items = want.map(t => ({ ...t, D: domain(t) }));
  const dropped = items.filter(t => !t.D.length).map(t => t.id);
  items = items.filter(t => t.D.length);

  while (true) {
    const n = items.length;
    if (!n) return { placed: {}, dropped, ms: performance.now() - t0 };
    const cur = new Array(n).fill(0);
    const cnt = items.map(t => new Int16Array(t.D.length));
    const apply = (u, ci, s) => {
      const cu = items[u].D[ci];
      for (let t = 0; t < n; t++) {
        if (t === u) continue;
        const D = items[t].D, row = cnt[t];
        for (let i = 0; i < D.length; i++) if (!pairOk(cu, D[i])) row[i] += s;
      }
    };
    for (let u = 0; u < n; u++) apply(u, 0, 1);
    let best = null, firstAt = null;
    const roundBudget = performance.now() - t0 > budgetMs ? 400 : budgetMs / 2;
    const roundStart = performance.now();
    for (let step = 0; ; step++) {
      const now = performance.now();
      if (now - roundStart > roundBudget || (firstAt && now - firstAt > 300)) break;
      const bad = [];
      for (let t = 0; t < n; t++) if (cnt[t][cur[t]] > 0) bad.push(t);
      if (!bad.length) {
        let total = 0;
        for (let t = 0; t < n; t++) total += items[t].D[cur[t]].cost;
        if (!best || total < best.total) best = { total, cur: cur.slice() };
        if (!firstAt) firstAt = now;
        for (let t = 0; t < n; t++) bad.push(t);   // всё сошлось – пробуем удешевить
      }
      const t = bad[Math.floor(rnd() * bad.length)];
      const row = cnt[t];
      let ni;
      if (rnd() < 0.05) ni = Math.floor(rnd() * row.length);
      else {
        let m = Infinity;
        for (let i = 0; i < row.length; i++) if (row[i] < m) m = row[i];
        const opts = [];
        for (let i = 0; i < row.length; i++) if (row[i] === m) opts.push(i);
        ni = rnd() < 0.7 ? opts[0] : opts[Math.floor(rnd() * opts.length)];   // D отсортирован по цене
      }
      if (best && cnt[t][ni] > 0) continue;   // после первой раскладки конфликтов не добавляем
      if (ni !== cur[t]) { apply(t, cur[t], -1); cur[t] = ni; apply(t, ni, 1); }
    }
    if (best) {
      const placed = {};
      items.forEach((t, i) => { placed[t.id] = { r: t.D[best.cur[i]].r, l: t.D[best.cur[i]].l }; });
      return { placed, dropped, ms: performance.now() - t0 };
    }
    // не разложилось: снять подпись самого младшего из конфликтных
    const conflicted = items.filter((t, i) => cnt[i][cur[i]] > 0);
    conflicted.sort((a, b) => a.prio - b.prio);
    const victim = conflicted[0].id;
    dropped.push(victim);
    items = items.filter(t => t.id !== victim);
  }
}

export const LABEL = { LH, MK, W_MAP, H_MAP };
