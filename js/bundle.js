// Сгенерировано tools/build.py из js/*.js – не править вручную, правки вносить в исходники.
(function () {
"use strict";
const __M = {};

// ---- labels.js ----
(function () {
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
function rng(seed) {
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
 * dots: [{id, x, y, hw?}] – все значки на карте (подписанные и нет); hw – половина ширины значка (группа шире);
 * want: [{id, w, prio}] – кого подписать, ширина подписи, приоритет (больше – важнее);
 * fixed: [[x0,y0,x1,y1]] – занятые зоны; topLimit – верх первого ряда.
 * Возвращает {placed: {id: {r, l}}, dropped: [id], ms}.
 */
function layoutLabels({ dots, want, fixed = [], topLimit = 12, seed = 1, budgetMs = 2500, rowStep = ROW_STEP, shift = SHIFT, perRow = PER_ROW }) {
  const t0 = performance.now();
  const rnd = rng(seed);
  const pos = Object.fromEntries(dots.map(d => [d.id, d]));
  const marks = dots.map(d => ({ id: d.id, r: [d.x - (d.hw || MK), d.y - MK, d.x + (d.hw || MK), d.y + MK] }));
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
  const byId = Object.fromEntries(items.map(t => [t.id, t]));
  const dropped = items.filter(t => !t.D.length).map(t => t.id);

  // Строгий приоритет: подпись без места пробует встать на свободное место, а если его нет –
  // вытеснить до четырёх подписей с меньшим опозданием (они потом сами ищут свободное место).
  // Так поезд с большим опозданием не остаётся без подписи из-за поезда с меньшим.
  function finish(sel) {
    const pending = dropped.map(id => byId[id]).filter(t => t.D.length);
    const freeFor = c => Object.values(sel).every(o => pairOk(c, o));
    for (let guard = 0; pending.length && guard < 300 && performance.now() - t0 < budgetMs + 1000; guard++) {
      pending.sort((a, b) => b.prio - a.prio);
      const t = pending.shift();
      let c = t.D.find(freeFor);
      if (!c) for (const cand of t.D.slice(0, 200)) {
        const conf = Object.keys(sel).filter(u => !pairOk(cand, sel[u]));
        if (conf.length <= 4 && conf.every(u => byId[u].prio < t.prio)) {
          conf.forEach(u => { delete sel[u]; pending.push(byId[u]); });
          c = cand; break;
        }
      }
      if (c) sel[t.id] = c;
    }
    const placed = {};
    for (const [id, c] of Object.entries(sel)) placed[id] = { r: c.r, l: c.l };
    const lost = want.map(t => t.id).filter(id => !sel[id]);
    // проверка правила: у снятой подписи нет места, где ей мешали бы только подписи с меньшим опозданием
    const unfair = lost.filter(id => byId[id].D.some(c => Object.keys(sel).every(u => pairOk(c, sel[u]) || byId[u].prio < byId[id].prio)));
    return { placed, dropped: lost, unfair, ms: performance.now() - t0 };
  }
  items = items.filter(t => t.D.length);

  let start = {};   // места с прошлого круга: поиск продолжается с них, а не с нуля
  for (let round = 0; ; round++) {
    const n = items.length;
    if (!n) return finish({});
    const cur = items.map(t => start[t.id] || 0);
    const cnt = items.map(t => new Int16Array(t.D.length));
    const apply = (u, ci, s) => {
      const cu = items[u].D[ci];
      for (let t = 0; t < n; t++) {
        if (t === u) continue;
        const D = items[t].D, row = cnt[t];
        for (let i = 0; i < D.length; i++) if (!pairOk(cu, D[i])) row[i] += s;
      }
    };
    for (let u = 0; u < n; u++) apply(u, cur[u], 1);
    let best = null, firstAt = null;
    const roundBudget = round ? 250 : budgetMs / 2;
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
      const sel = {};
      items.forEach((t, i) => { sel[t.id] = t.D[best.cur[i]]; });
      return finish(sel);
    }
    // не разложилось: снять подписи младших из конфликтных – треть за круг; когда время вышло,
    // снимаются все конфликтные, и оставшиеся подписи уже стоят без конфликтов
    const conflicted = items.filter((t, i) => cnt[i][cur[i]] > 0).sort((a, b) => a.prio - b.prio);
    const over = performance.now() - t0 > budgetMs;
    const victims = new Set(conflicted.slice(0, over ? conflicted.length : Math.ceil(conflicted.length / 3)).map(t => t.id));
    items.forEach((t, i) => { start[t.id] = cur[i]; });
    dropped.push(...victims);
    items = items.filter(t => !victims.has(t.id));
  }
}

const LABEL = { LH, MK, W_MAP, H_MAP };

Object.assign(__M, { rng, layoutLabels, LABEL });
})();

// ---- geo.js ----
(function () {
// Любая станция на карту: широта/долгота -> пиксели карты Z4 (коническая проекция Ламберта, та же рамка,
// что у подложки) и полигон по контурам пяти полигонов (data/geo.json, собран geo/stations.py).
let G = null, ctx = null, paths = null;

async function loadGeo(url = "data/geo.json") {
  // data/data.js (сборка) кладёт данные в window.TKP_DATA – так страница работает и с file:///
  G = window.TKP_DATA?.geo || await (await fetch(url)).json();
  ctx = document.createElement("canvas").getContext("2d");
  paths = Object.entries(G.polys).map(([p, d]) => [p, new Path2D(d)]);
}

const rad = Math.PI / 180;
function project(lat, lon) {
  const { lon0, lat0, p1, p2 } = G.proj, { x0, y1, k, ox, oy } = G.frame;
  const n = Math.log(Math.cos(p1 * rad) / Math.cos(p2 * rad)) /
            Math.log(Math.tan(Math.PI / 4 + p2 * rad / 2) / Math.tan(Math.PI / 4 + p1 * rad / 2));
  const F = Math.cos(p1 * rad) * Math.tan(Math.PI / 4 + p1 * rad / 2) ** n / n;
  const rho0 = F / Math.tan(Math.PI / 4 + lat0 * rad / 2) ** n;
  if (lon < 0) lon += 360;
  const rho = F / Math.tan(Math.PI / 4 + lat * rad / 2) ** n, t = n * (lon - lon0) * rad;
  const x = rho * Math.sin(t), y = rho0 - rho * Math.cos(t);
  return { x: ox + (x - x0) * k, y: oy + (y1 - y) * k };
}

const inPoly = (x, y) => (paths.find(([, p]) => ctx.isPointInPath(p, x, y, "evenodd")) || [null])[0];
// точка у берега или границы может выпасть из упрощённого контура – тогда берётся ближайший полигон
function polyAt(x, y) {
  let p = inPoly(x, y);
  for (let r = 6; !p && r < 120; r += 6)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]])
      if ((p = inPoly(x + r * dx, y + r * dy))) break;
  return p;
}

function placeStation(s) {
  const { x, y } = project(s.lat, s.lon);
  return { ...s, x: Math.round(x), y: Math.round(y), poly: s.poly || polyAt(x, y) };
}

Object.assign(__M, { loadGeo, project, polyAt, placeStation });
})();

// ---- data.js ----
(function () {
// Данные смены: пример из макета Figma (варианты В и Г) и генератор случайной смены.
// Из одного объекта смены табло считает всё само: счётчики Z3, колонки Z6, значки и подписи Z4.
const { rng } = __M;
const POLYS = ["Окт", "Моск", "Ю-З", "С-З", "Вост"];
const POLY_FULL = { "Окт": "Октябрьский", "Моск": "Московский", "Ю-З": "Юго-Западный",
  "С-З": "Северо-Западный", "Вост": "Восточный" };

// Смена из макета (Figma «Новые экраны», страница «01 ТКП», варианты В 34:2 и Г 34:383)
const SAMPLE = {
  time: "19:34", date: "28.02.2023, вторник", shift: "смена 19:00–07:00", updated: "19:34",
  stale: { train: "Т-106", time: "19:20" },
  transit: { "Окт": 58, "Моск": 71, "Ю-З": 131, "С-З": 145, "Вост": 90 },
  trains: [
    { id: "Т-722", speed: true, delay: 18, station: "Чудово" },
    { id: "Т-752", speed: true, delay: 12, station: "Тверь" },
    { id: "Т-106", delay: 280, station: "Ростов-Главный" },
    { id: "Т-128", delay: 92, station: "Волгоград" },
    { id: "Т-119", delay: 31, station: "Ртищево-1" },
    { id: "Т-117", delay: 8, station: "Сызрань-1" },
    { id: "Т-102", delay: 45, station: "Барабинск" },
    { id: "Т-112", delay: 45, station: "Златоуст" },
    { id: "Т-110", delay: 6, station: "Омск-Пассажирский" },
    { id: "Т-132", delay: 48, station: "Чита-2" },
    { id: "Т-145", delay: 37, station: "Канск-Енисейский" },
    { id: "Т-126", delay: 29, station: "Зима" },
    { id: "Т-108", delay: 22, station: "Улан-Удэ" },
    { id: "Т-142", delay: 19, station: "Ангарск" },
    { id: "Т-138", delay: 16, station: "Нижнеудинск" },
    { id: "Т-114", delay: 15, station: "Ачинск-1" },
    { id: "Т-104", delay: 12, station: "Белый Сад" },
    { id: "Т-122", delay: 9, station: "Белогорск" },
  ],
  summary: { sent: 100, plan: 200, delayedDep: 3, control: [10, 5], kids: [187, 6000, 200],
    transitDelta: "+5 %", intl: 15, foreign: 11 },
  side: {
    "Окт": { events: [{ head: ["Окно (путь)", "20:00–23:00"], where: "Тверь – Бологое" }], weather: [] },
    "Моск": { events: [{ type: "fail", head: ["Отказ СЦБ", "с 19:12"], where: "Луховицы – Рыбное" }], weather: [] },
    "Ю-З": { events: [{ head: ["Предупреждение", "60 км/ч"], where: "Ростов – Батайск" }],
             weather: [{ city: "Ростов-на-Дону", t: -5, sky: "ясно", local: "19:34" }] },
    "С-З": { events: [], weather: [{ city: "Новосибирск", t: -19, sky: "снег", local: "23:34" }] },
    "Вост": { events: [{ head: ["Окно (КС)", "22:30–02:30"], where: "Тайшет – Нижнеудинск" },
                       { head: ["Предупреждение", "40 км/ч"], where: "Ачинск – Боготол" }],
              weather: [{ city: "Красноярск", t: -24, sky: "снег", local: "23:34" },
                        { city: "Иркутск", t: -26, sky: "снег", local: "00:34" }] },
  },
  ns: { train: "Т-102", kind: "Биоугроза · вагон 5", since: "18:49", mins: 45,
    facts: [["Стоит на 2-м пути"], ["Задержка ", "45 мин", "amber"], ["Новое время – уточняется"],
            ["904 пассажира, в вагоне 5 – ", "84", "bold"]],
    log: [["18:52", "ведёт руководитель смены"], ["19:34", "уведомлены службы"],
          ["19:45", "решение по вагону 5", "next"]] },
};

// ---------- генератор ----------
const WD = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const pad = n => String(n).padStart(2, "0");
const hm = m => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

const SIDE_EVENTS = {
  "Окт": [["Окно (путь)", "Тверь – Бологое"], ["Окно (КС)", "Чудово – Волховстрой"], ["Предупреждение", "Кемь – Беломорск"]],
  "Моск": [["Окно (путь)", "Вязьма – Смоленск"], ["Предупреждение", "Тула – Орёл"], ["Окно (СЦБ)", "Рязань – Рыбное"]],
  "Ю-З": [["Предупреждение", "Ростов – Батайск"], ["Окно (путь)", "Лиски – Россошь"], ["Окно (КС)", "Туапсе – Сочи"]],
  "С-З": [["Окно (путь)", "Тюмень – Ишим"], ["Предупреждение", "Пермь – Кунгур"], ["Окно (КС)", "Омск – Татарская"]],
  "Вост": [["Окно (КС)", "Тайшет – Нижнеудинск"], ["Предупреждение", "Ачинск – Боготол"], ["Окно (путь)", "Слюдянка – Байкальск"]],
};
const CITIES = {
  "Окт": [["Санкт-Петербург", 0, -6, 3]], "Моск": [["Москва", 0, -9, 2]],
  "Ю-З": [["Ростов-на-Дону", 0, -7, 6], ["Самара", 1, -14, -2]],
  "С-З": [["Новосибирск", 4, -28, -8], ["Екатеринбург", 2, -22, -4]],
  "Вост": [["Красноярск", 4, -32, -10], ["Иркутск", 5, -34, -12], ["Хабаровск", 7, -30, -12]],
};
const SKIES = ["ясно", "снег", "облачно", "метель", "туман"];
const NS_KINDS = [["Биоугроза", true], ["Задымление", true], ["Пострадавший пассажир", true],
                  ["Отказ локомотива", false], ["Сход колёсной пары", true]];
// отказы инфраструктуры: вид и где (перегон) – по полигонам
const FAIL_KINDS = ["Отказ СЦБ", "Отказ КС", "Отказ пути"];
const FAIL_WHERE = {
  "Окт": ["Малая Вишера – Чудово", "Бологое – Угловка"], "Моск": ["Луховицы – Рыбное", "Серпухов – Тарусская"],
  "Ю-З": ["Лиски – Россошь", "Батайск – Каневская"], "С-З": ["Ишим – Называевская", "Курган – Петухово"],
  "Вост": ["Зима – Куйтун", "Слюдянка – Култук"],
};
const TRANSIT = { "Окт": [40, 80], "Моск": [50, 95], "Ю-З": [90, 150], "С-З": [110, 170], "Вост": [70, 115] };

function generate(seed, stations, { heavy = false } = {}) {
  const r = rng(seed);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = a => a[Math.floor(r() * a.length)];
  // время смены 19:00–07:00, дата – произвольная в 2023–2026
  const now = 19 * 60 + int(10, 11 * 60 + 40);
  const d = new Date(Date.UTC(int(2023, 2026), int(0, 11), int(1, 28)));
  const date = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}, ${WD[d.getUTCDay()]}`;
  const transit = Object.fromEntries(POLYS.map(p => [p, int(...TRANSIT[p])]));

  // опоздания: сколько, где, сколько минут. Станции могут стоять рядом и повторяться (в загруженной смене):
  // близкие поезда табло объединяет в группу с числом на значке
  const total = heavy ? int(32, 44) : r() < 0.08 ? int(0, 3) : int(5, 22);
  const gapPx = heavy ? 0 : 40;
  const used = new Set(), chosen = [];
  const free = () => stations.filter(s => !chosen.some(c => Math.hypot(c.x - s.x, c.y - s.y) < gapPx));
  const trains = [];
  for (let i = 0; i < total; i++) {
    const cand = free();
    if (!cand.length) break;
    const st = pick(cand); chosen.push(st);
    const speed = r() < 0.15;
    let id;
    do id = `Т-${speed ? int(700, 799) : int(100, 699)}`; while (used.has(id));
    used.add(id);
    const q = r();
    const delay = speed ? int(6, 55) : q < 0.80 ? int(6, 59) : q < 0.94 ? int(60, 239) : int(241, 420);
    trains.push({ id, speed, delay, station: st.name });
  }
  const stale = trains.length && r() < 0.5 ? { train: pick(trains).id, time: hm(now - int(6, 25)) } : null;

  const side = {};
  for (const p of POLYS) {
    const ev = [...SIDE_EVENTS[p]].sort(() => r() - 0.5).slice(0, int(0, p === "Вост" ? 2 : 1));
    const events = ev.map(([kind, where]) => {
      if (kind === "Предупреждение") return { head: [kind, `${pick([25, 40, 60, 80])} км/ч`], where };
      const a = int(19, 30) * 60 + pick([0, 30]);
      return { head: [kind, `${hm(a)}–${hm(a + int(2, 5) * 60)}`], where };
    });
    const cities = [...CITIES[p]].sort(() => r() - 0.5).slice(0, int(0, Math.min(2, CITIES[p].length)));
    const weather = cities.map(([city, dz, lo, hi]) => ({ city, t: int(lo, hi), sky: pick(SKIES), local: hm(now + dz * 60) }));
    side[p] = { events, weather };
  }
  // иногда – отказ инфраструктуры (без НС: жёлтый квадрат в карточке полигона)
  if (r() < 0.45) {
    const p = pick(POLYS);
    side[p].events.unshift({ type: "fail", head: [pick(FAIL_KINDS), `с ${hm(now - int(5, 70))}`], where: pick(FAIL_WHERE[p]) });
  }
  const plan = int(150, 240);
  const summary = { sent: int(Math.round(plan * 0.3), plan), plan, delayedDep: int(0, 6), control: [int(5, 14), int(0, 8)],
    kids: [int(90, 220), int(30, 70) * 100, int(80, 240)], transitDelta: `${pick(["+", "−"])}${int(1, 9)} %`,
    intl: int(5, 25), foreign: int(3, 15) };

  // НС: до 4 обычных опаздывающих поездов; первая в списке – главная (идёт дольше всех).
  // Режим «НС» показывает только главную, режим «несколько НС» – все.
  // НС выбираются не ближе 300 px друг к другу, чтобы ореолы на карте не сливались
  const xy = Object.fromEntries(stations.map(s => [s.name, s]));
  const regular = trains.filter(t => !t.speed && t.delay < 120).sort(() => r() - 0.5);
  const nsTrains = [];
  for (const t of regular) {
    if (nsTrains.length >= (heavy ? 4 : 3)) break;
    const p = xy[t.station];
    if (nsTrains.every(u => Math.hypot(xy[u.station].x - p.x, xy[u.station].y - p.y) >= 300)) nsTrains.push(t);
  }
  const ns = nsTrains.map(base => {
    // НС из-за отказа: поезд с людьми стоит на перегоне (правило «отказ → НС»); отказ попадает в карточку полигона
    if (r() < 0.35) {
      const fk = pick(FAIL_KINDS), st = xy[base.station], pax = int(300, 980), mins = base.delay, start = now - mins;
      const p = st.poly;
      if (side[p]) side[p].events.unshift({ type: "fail", head: [fk, `с ${hm(start)}`], where: `у ст. ${st.short}`, train: base.id });
      const crew = { "Отказ СЦБ": "бригада СЦБ", "Отказ КС": "бригада контактной сети", "Отказ пути": "бригада пути" }[fk];
      return { train: base.id, kind: `${fk} · стоит на перегоне`, since: hm(start), mins,
        facts: [["Стоит на перегоне"], ["Задержка ", `${mins} мин`, "amber"], ["Новое время – уточняется"],
                [`${pax} ${plural(pax, "пассажир", "пассажира", "пассажиров")} в поезде`]],
        log: [[hm(start + 2), "ведёт руководитель смены"], [hm(start + Math.max(4, Math.min(mins - 2, 8))), `выехала ${crew}`],
              [hm(now + int(5, 20)), "решение о пропуске", "next"]] };
    }
    const [kind, car] = pick(NS_KINDS);
    const carN = int(2, 14), pax = int(300, 980), inCar = int(30, 90), tr = int(1, 6);
    const mins = base.delay, start = now - mins;
    return { train: base.id, kind: car ? `${kind} · вагон ${carN}` : kind, since: hm(start), mins,
      facts: [[`Стоит на ${tr}-м пути`], ["Задержка ", `${mins} мин`, "amber"], ["Новое время – уточняется"],
              car ? [`${pax} ${plural(pax, "пассажир", "пассажира", "пассажиров")}, в вагоне ${carN} – `, String(inCar), "bold"]
                  : [`${pax} ${plural(pax, "пассажир", "пассажира", "пассажиров")} в поезде`]],
      log: [[hm(start + 3), "ведёт руководитель смены"], [hm(start + Math.max(4, mins - 11)), "уведомлены службы"],
            [hm(now + int(5, 20)), car ? `решение по вагону ${carN}` : "замена локомотива", "next"]] };
  }).sort((a, b) => b.mins - a.mins);
  return { time: hm(now), date, shift: "смена 19:00–07:00", updated: hm(now), stale, transit, trains, summary, side, ns };
}

Object.assign(__M, { POLYS, POLY_FULL, SAMPLE, plural, generate });
})();

// ---- board.js ----
(function () {
// Отрисовка табло 5400×2500 из объекта смены. Геометрия зон и шрифты – из макета Figma (вариант В / Г).
const { POLYS, POLY_FULL, plural } = __M;
const { layoutLabels, LABEL } = __M;
const { placeStation } = __M;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtDelay = m => `+${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const nm = t => t.id + (t.speed ? "(ск)" : "");
const RED_MIN = 240;
// nsl – список показываемых НС (пустой в штатном режиме)
const isNs = (t, nsl) => nsl.some(n => n.train === t.id);
const isRed = (t, nsl) => t.delay > RED_MIN || isNs(t, nsl);

const mk = {
  a: (s, cls = "", st = "") => `<svg class="mk${cls}" width="${s}" height="${s}" viewBox="0 0 60 60" aria-hidden="true"${st}><path class="b-a" d="M30 8L55.98 53H4.02Z"/><rect class="g-a" x="27" y="23" width="6" height="15" rx="3"/><circle class="g-a" cx="30" cy="45" r="3"/></svg>`,
  g: s => `<svg class="mk" width="${s}" height="${s}" viewBox="0 0 60 60" aria-hidden="true"><rect class="b-g" width="60" height="60" rx="30"/><path class="g-g" d="M16.2 31.2L26.4 40.8L44.4 20.4" fill="none" stroke-width="6.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  o: s => `<svg class="mk" width="${s}" height="${s}" viewBox="0 0 60 60" aria-hidden="true"><path class="b-o" d="M30 0L60 30L30 60L0 30Z"/></svg>`,
  r: s => `<span class="mk mk-r" style="width:${s}px;height:${s}px;border-radius:${s * 0.14}px;font-size:${s * 0.78}px">!</span>`,
  // отказ инфраструктуры: жёлтый квадрат «!» (треугольник – окна и предупреждения)
  q: s => `<span class="mk mk-r mk-q" style="width:${s}px;height:${s}px;border-radius:${s * 0.14}px;font-size:${s * 0.78}px">!</span>`,
};

function z1(d) {
  return `<section class="z z1" aria-label="Время и свежесть данных">
    <div class="z1-in">
      <p class="z1-time">${esc(d.time)}</p>
      <div class="z1-date"><p>${esc(d.date)}</p><p>${esc(d.shift)}</p></div>
      <div class="z1-fresh">
        <p class="row">${mk.g(60)}<span>Обновлено ${esc(d.updated)}</span></p>
        ${d.stale ? `<p class="row stale">${mk.o(60)}<span>${esc(d.stale.train)}: данные ${esc(d.stale.time)}</span></p>` : ""}
      </div>
    </div></section>`;
}

function z2(d, nsl, stOf) {
  if (!nsl.length) return `<section class="z z2" aria-label="Статус"><p class="row z2-ok">${mk.g(64)}<span>Нештатных ситуаций нет</span></p></section>`;
  if (nsl.length === 1) {
    const ns = nsl[0];
    return `<section class="z z2 z2-ns" aria-label="Нештатная ситуация">
    ${mk.r(160)}
    <p class="ns-title">НС · ${esc(ns.train)} · ${esc(stOf(ns.train).short)}</p>
    <p class="ns-sub">${esc(ns.kind)} · с ${esc(ns.since)}</p>
    <p class="ns-min">${ns.mins} мин</p><p class="ns-min-sub">с начала</p>
  </section>`;
  }
  // несколько НС: строка на каждую (до трёх), дольше всех – первой
  const rows = nsl.length > 3 ? nsl.slice(0, 2) : nsl;
  const more = nsl.length - rows.length;
  return `<section class="z z2 z2-ns z2-multi" aria-label="Нештатные ситуации: ${nsl.length}">
    ${rows.map(n => `<div class="ns-row">${mk.r(72)}<p class="ns-txt"><b>НС · ${esc(n.train)} · ${esc(stOf(n.train).short)}</b> · ${esc(n.kind)}</p><p class="ns-t">${n.mins} мин</p></div>`).join("")}
    ${more ? `<div class="ns-row">${mk.r(72)}<p class="ns-txt"><b>ещё ${more} НС:</b> ${nsl.slice(2).map(n => esc(n.train)).join(", ")}</p></div>` : ""}
  </section>`;
}

function z3(trains) {
  const reg = trains.filter(t => !t.speed), sp = trains.filter(t => t.speed);
  const c = [reg.filter(t => t.delay < 60).length, reg.filter(t => t.delay >= 60 && t.delay <= RED_MIN).length,
             reg.filter(t => t.delay > RED_MIN).length];
  const s = [sp.filter(t => t.delay <= 30).length, sp.filter(t => t.delay > 30).length];
  const num = (n, cls) => `<b class="${n ? cls : "mut"}">${n}</b>`;
  const row = (m, label, a, b) => `<div class="z3-row"><p class="row">${m}<span>${label}</span></p><p class="z3-num">${a}<span class="sep"> / </span>${b}</p></div>`;
  return `<section class="z z3" aria-label="Опоздания">
    <div class="z3-row z3-head"><p>Опоздания</p><p>обычн. / скоростн.</p></div>
    ${row(mk.a(60), "до 1 ч / до 30 мин", num(c[0], "amb"), num(s[0], "amb"))}
    ${row(mk.a(60), "1–4 ч / более 30 мин", num(c[1], "amb"), num(s[1], "amb"))}
    ${row(mk.r(60), "более 4 ч", num(c[2], "red"), `<b class="mut">–</b>`)}
  </section>`;
}

function z5(d, nsl, stOf) {
  if (nsl.length) {
    const ns = nsl[0];
    const fact = f => f.length === 1 ? `<p>${esc(f[0])}</p>` :
      `<p>${esc(f[0])}<span class="${f[2] === "amber" ? "amb sb" : "sb"}">${esc(f[1])}</span></p>`;
    const head = nsl.length > 1 ? `<div class="ns-head"><p>${esc(ns.train)} · ${esc(stOf(ns.train).short)}</p><p class="sec">1 из ${nsl.length}</p></div>` : "";
    return `<section class="z z5 z5-ns${nsl.length > 1 ? " z5-multi" : ""}" aria-label="Карточка НС">
      ${head}${ns.facts.map(fact).join("")}
      <hr>
      ${ns.log.map(l => `<p class="log${l[2] ? " next" : ""}"><span class="t">${esc(l[0])}</span><span>${esc(l[1])}</span></p>`).join("")}
    </section>`;
  }
  const s = d.summary, tr = POLYS.reduce((a, p) => a + d.transit[p], 0);
  const pct = s.plan ? Math.round(s.sent / s.plan * 100) : 0;
  return `<section class="z z5" aria-label="Сводка смены">
    <div class="kv"><p>Отправлено</p><p><b>${s.sent}</b> из ${s.plan} · ${pct} %</p></div><hr>
    <div class="kv"><p class="row">${s.delayedDep ? mk.a(64) : ""}<span>Задержано отправление</span></p><p><b class="${s.delayedDep ? "amb" : ""}">${s.delayedDep}</b></p></div><hr>
    <div class="kv"><p>На контроле</p><p><b>${s.control[0] + s.control[1]}</b></p></div>
    <p class="sub">постоянный ${s.control[0]} · оперативный ${s.control[1]}</p><hr>
    <div class="kv"><p>Поездов с детьми</p><p><b>${s.kids[0]}</b></p></div>
    <p class="sub">детей ${s.kids[1].toLocaleString("ru-RU")} · групп ${s.kids[2]}</p><hr>
    <div class="kv"><p>В пути · ${esc(s.transitDelta)} к вчера</p><p><b>${tr}</b></p></div>
    <p class="sub">межгос. сообщения ${s.intl}</p><p class="sub">зарубежного формирования ${s.foreign}</p>
  </section>`;
}

const ROWS_MAX = 9;
function z6(d, nsl, byPoly, stOf) {
  return POLYS.map((p, i) => {
    const list = byPoly[p].sort((a, b) => isNs(b, nsl) - isNs(a, nsl) || b.delay - a.delay);
    const red = list.some(t => isRed(t, nsl));
    const n = list.length;
    const status = !n ? `<p class="row st">${mk.g(56)}<span>по графику</span></p>`
      : `<p class="row st ${red ? "red" : "amb"}">${red ? mk.r(56) : mk.a(56)}<span>${plural(n, "опаздывает", "опаздывают", "опаздывают")} ${n}</span></p>`;
    const shown = n > ROWS_MAX ? list.slice(0, ROWS_MAX - 1) : list;
    const rows = !n ? `<p class="t-row mut">отклонений нет</p>` : shown.map(t => {
      const ns = isNs(t, nsl);
      return `<p class="t-row"><b>${esc(nm(t))}</b><b class="${ns || t.delay > RED_MIN ? "red" : "amb"}">${ns ? "НС" : fmtDelay(t.delay)}</b><span class="${ns ? "" : "sec"}">${esc(stOf(t).short)}</span></p>`;
    }).join("") + (n > ROWS_MAX ? `<p class="t-row sec">+${n - shown.length} ${plural(n - shown.length, "поезд", "поезда", "поездов")}</p>` : "");
    const tr = d.transit[p];
    return `<section class="z z6" style="left:${856 + i * 742}px" aria-label="Полигон ${POLY_FULL[p]}">
      <p class="z6-name">${p}</p>${status}
      <p class="z6-tr">${tr} ${plural(tr, "поезд", "поезда", "поездов")} в пути</p>
      <hr>${rows}</section>`;
  }).join("");
}

function side(d, nsl, polys, cls) {
  return `<section class="z ${cls}" aria-label="Полигоны">${polys.map(p => {
    const s = d.side[p] || { events: [], weather: [] };
    // отказ – жёлтый квадрат; отказ, остановивший поезд из показанных НС, – красный «НС · отказ …» (правило «отказ → НС»)
    const evs = [...s.events].sort((a, b) => (b.type === "fail") - (a.type === "fail"));
    const ev = evs.map(e => {
      if (e.type !== "fail") return `<div class="ev">${mk.a(60)}<p>${esc(e.head[0])}<br>${esc(e.head[1])}</p></div><p>${esc(e.where)}</p>`;
      const ns = e.train && nsl.some(n => n.train === e.train);
      return `<div class="ev${ns ? " red" : ""}">${ns ? mk.r(60) : mk.q(60)}<p>${ns ? "НС · " + esc(e.head[0].replace(/^Отказ/, "отказ")) : esc(e.head[0])}<br>${esc(e.head[1])}</p></div><p>${esc(e.where)}</p>`;
    }).join("");
    const empty = !s.events.length && !s.weather.length ? `<p class="sec">без окон и предупреждений</p>` : "";
    const w = s.weather.map(x => `<div class="wx"><p>${esc(x.city)} ${x.t < 0 ? "−" : x.t > 0 ? "+" : ""}${Math.abs(x.t)} °C</p><p class="sec">${esc(x.sky)} · ${esc(x.local)} местн.</p></div>`).join("");
    return `<div class="card"><p class="name">${POLY_FULL[p]}</p>${ev}${empty}${w}</div>`;
  }).join("")}</section>`;
}

// --- карта ---
function mapLayers(d, nsl, stOf, opts) {
  const fixed = [];
  let nsSvg = "", nsHtml = "";
  // ореолы: у главной НС полный (165/115), у остальных меньше; сначала все ореолы, потом подписи НС
  const halos = nsl.map((n, i) => { const { x, y } = stOf(n.train); return { n, x, y, R: i ? 125 : 165, r: i ? 85 : 115, s: i ? 0.8 : 1 }; });
  for (const h of halos) fixed.push([h.x - h.R, h.y - h.R, h.x + h.R, h.y + h.R]);
  const inMap = b => b[0] >= 8 && b[1] >= (nsl.length ? 175 : 12) && b[2] <= LABEL.W_MAP - 8 && b[3] <= LABEL.H_MAP - 8;
  halos.forEach((h, i) => {
    const t = d.trains.find(x => x.id === h.n.train);
    const W = 390, H = 100, g = 30;
    // подпись НС: под ореолом, над ним, справа или слева, вплотную или чуть дальше;
    // берётся место, где подпись меньше всего заходит на чужие ореолы и подписи НС и не выходит за карту
    const opts4 = [];
    for (const gg of [g, g + 110]) opts4.push(
      [h.x - W / 2, h.y + h.R + gg, h.x, h.y + h.R, h.x, h.y + h.R + gg],
      [h.x - W / 2, h.y - h.R - gg - H, h.x, h.y - h.R, h.x, h.y - h.R - gg],
      [h.x + h.R + gg, h.y - H / 2, h.x + h.R, h.y, h.x + h.R + gg, h.y],
      [h.x - h.R - gg - W, h.y - H / 2, h.x - h.R, h.y, h.x - h.R - gg, h.y]);
    const area = (b, f) => Math.max(0, Math.min(b[2], f[2] + 8) - Math.max(b[0], f[0] - 8)) * Math.max(0, Math.min(b[3], f[3] + 8) - Math.max(b[1], f[1] - 8));
    const score = o => { const b = [o[0], o[1], o[0] + W, o[1] + H];
      return (inMap(b) ? 0 : 1e9) + fixed.reduce((a, f, k) => a + (k === i ? 0 : area(b, f)), 0) + (o[1] > h.y + h.R + g ? 50 : 0); };
    const pick = opts4.reduce((a, o) => score(o) < score(a) ? o : a);
    const ly = pick[1], lx = Math.min(Math.max(pick[0], 8), LABEL.W_MAP - W - 8);
    fixed.push([lx, ly, lx + W, ly + H]);
    nsSvg += `<circle cx="${h.x}" cy="${h.y}" r="${h.R}" fill="none" style="stroke:var(--red-mk)" stroke-opacity=".45" stroke-width="6"/>
      <circle cx="${h.x}" cy="${h.y}" r="${h.r}" style="fill:var(--red-mk);stroke:var(--red-mk)" fill-opacity=".22" stroke-opacity=".85" stroke-width="${i ? 8 : 10}"/>
      <line x1="${pick[2]}" y1="${pick[3]}" x2="${pick[4]}" y2="${pick[5]}" style="stroke:var(--red-mk)" stroke-width="6"/>`;
    const m = 102 * h.s;
    nsHtml += `<div class="lbl lbl-ns" style="left:${lx}px;top:${ly}px"><span>${esc(nm(t))}</span><span class="red">НС</span></div>
      <span class="mk mk-r map-mk" style="left:${h.x - m / 2}px;top:${h.y - m / 2}px;width:${m}px;height:${m}px;border-radius:${m * 0.14}px;font-size:${m * 0.69}px">!</span>`;
  });
  // Группы: поезда ближе 70 px (значки 73 px налезали бы друг на друга) к самому важному поезду группы сливаются в один значок.
  // Значок группы – плашка с числом: красные + жёлтые («1+2»), или одно число одного цвета.
  // Подпись группы – по самому долгому опозданию: «Т-128 и ещё 2» над «+1:32».
  const pr = t => (t.delay > RED_MIN ? 1e6 : 0) + t.delay;
  const groups = [];
  for (const t of d.trains.filter(t => !isNs(t, nsl)).sort((a, b) => pr(b) - pr(a))) {
    const p = stOf(t), g = groups.find(g => Math.hypot(g.x - p.x, g.y - p.y) < 70);
    if (g) g.list.push(t); else groups.push({ id: t.id, x: p.x, y: p.y, list: [t] });
  }
  for (const g of groups) {
    g.lead = g.list[0]; g.red = g.list.filter(t => t.delay > RED_MIN).length; g.amb = g.list.length - g.red;
    g.text = g.list.length > 1 ? `${nm(g.lead)} и ещё ${g.list.length - 1}` : nm(g.lead);
    const digits = g.list.length === 1 ? 0 : g.red && g.amb ? `${g.red}+${g.amb}`.length : String(g.list.length).length;
    g.w = digits ? 40 + digits * 32 : 72.8;
  }
  const dots = groups.map(g => ({ id: g.id, x: g.x, y: g.y, hw: g.w / 2 }));
  // в режиме НС подписаны только красные (жёлтые – только значки), иначе все
  const toLabel = groups.filter(g => !nsl.length || g.red);
  const want = toLabel.map(g => ({ id: g.id, w: opts.labelWidth({ id: g.text, speed: false, delay: g.lead.delay }), prio: pr(g.lead) }));
  const res = layoutLabels({ dots, want, fixed, topLimit: nsl.length ? 175 : 12, seed: opts.seed || 1, budgetMs: opts.budgetMs || (want.length > 24 ? 2500 : 1500) });
  let lines = "", labels = "", marks = "";
  for (const g of groups) {
    const { x, y } = g, red = g.red > 0, t = g.lead;
    if (g.list.length > 1) {
      const num = g.red && g.amb ? `<b class="red">${g.red}</b><i>+</i><b class="amb">${g.amb}</b>` : `<b class="${red ? "red" : "amb"}">${g.list.length}</b>`;
      marks += `<span data-g="${esc(g.id)}" class="map-mk grp${red ? " grp-r" : ""}" style="left:${x - g.w / 2}px;top:${y - 36.4}px;width:${g.w}px">${num}</span>`;
    } else marks += red ? `<span data-g="${esc(g.id)}" class="mk mk-r map-mk" style="left:${x - 36.4}px;top:${y - 36.4}px;width:72.8px;height:72.8px;border-radius:10.2px;font-size:49.4px">!</span>`
                 : mk.a(72.8, " map-mk", ` data-g="${esc(g.id)}" style="left:${x - 36.4}px;top:${y - 36.6}px"`);
    const p = res.placed[g.id];
    if (!p) continue;
    const c = red ? "var(--red-mk)" : "var(--amb-mk)";
    lines += `<line x1="${p.l[0]}" y1="${p.l[1]}" x2="${p.l[2]}" y2="${p.l[3]}" style="stroke:${c}" stroke-width="${red ? 6 : 4}"/>`;
    labels += `<div class="lbl" style="left:${p.r[0]}px;top:${p.r[1]}px;width:${p.r[2] - p.r[0]}px"><span>${esc(g.text)}</span><span class="${t.delay > RED_MIN ? "red" : "amb"}">${fmtDelay(t.delay)}</span></div>`;
  }
  return { html: `<img class="map-base" src="assets/${document.documentElement.dataset.theme === "light" ? "base_map_light" : "base_map"}.svg" width="2360" height="1410" alt="Карта сети: регионы закрашены по полигонам, линии – железные дороги">
    <svg class="map-svg" viewBox="0 0 2360 1410" aria-hidden="true">${nsSvg}${lines}</svg>${marks}${nsHtml}${labels}`,
    stats: { groupOf: Object.fromEntries(groups.flatMap(g => g.list.map(t => [t.id, g.id]))), groupSize: Object.fromEntries(groups.map(g => [g.id, g.list.length])),
      placedIds: Object.keys(res.placed), labeled: Object.keys(res.placed).length, marks: groups.length, grouped: groups.filter(g => g.list.length > 1).length, dropped: res.dropped, unfair: res.unfair || [], ms: Math.round(res.ms), total: d.trains.length } };
}

// Подгонка под размер зон при любых данных: длинный день недели сокращается,
// в боковых колонках лишняя погода снимается с конца (окна и предупреждения остаются).
const WD_SHORT = { "понедельник": "пн", "вторник": "вт", "среда": "ср", "четверг": "чт", "пятница": "пт", "суббота": "сб", "воскресенье": "вс" };
function fitZones(el) {
  const z1 = el.querySelector(".z1-in");
  if (z1 && z1.scrollWidth > 2160 - 60 - 24) {
    const p = el.querySelector(".z1-date p");
    p.textContent = p.textContent.replace(/[а-я]+$/, w => WD_SHORT[w] || w);
  }
  for (const col of el.querySelectorAll(".z7,.z8")) {
    let guard = 20;
    while (col.scrollHeight > col.clientHeight + 1 && guard--) {
      const w = [...col.querySelectorAll(".wx")].pop();
      if (!w) break;
      w.remove();
    }
    col.querySelectorAll(".card").forEach(c => { if (c.children.length === 1) c.insertAdjacentHTML("beforeend", '<p class="sec">без окон и предупреждений</p>'); });
  }
}

// mode: "norm" – штатный, "ns" – одна (главная) НС, "multi" – все НС из данных
function nsList(d, mode) {
  const all = (Array.isArray(d.ns) ? d.ns : d.ns ? [d.ns] : []).filter(n => d.trains.some(t => t.id === n.train));
  return mode === "multi" ? all : mode === "ns" ? all.slice(0, 1) : [];
}

function renderBoard(el, d, { mode, stations, labelWidth, seed }) {
  const byName = Object.fromEntries(stations.map(s => [s.name, s]));
  // станция – из каталога по имени или по координатам самого поезда (lat, lon) – так подходит любая база
  const own = new Map();
  const stOf0 = t => {
    if (t.lat != null && t.lon != null) {
      const k = t.id + "|" + t.lat + "|" + t.lon;
      if (!own.has(k)) {
        const st = placeStation({ name: t.station || t.id, short: String(t.station || "").slice(0, 11), lat: +t.lat, lon: +t.lon, poly: t.poly });
        // точка вне пяти полигонов (например, Якутия) – полигон ближайшей станции каталога
        if (!POLYS.includes(st.poly)) st.poly = stations.reduce((a, b) => Math.hypot(b.x - st.x, b.y - st.y) < Math.hypot(a.x - st.x, a.y - st.y) ? b : a).poly;
        own.set(k, st);
      }
      return own.get(k);
    }
    return byName[t.station] || { x: -100, y: -100, short: t.station, poly: "Окт" };
  };
  const stOf = t => stOf0(typeof t === "string" ? d.trains.find(x => x.id === t) || { station: "" } : t);
  const nsl = nsList(d, mode);
  const byPoly = Object.fromEntries(POLYS.map(p => [p, []]));
  for (const t of d.trains) byPoly[stOf(t).poly].push(t);
  const map = mapLayers(d, nsl, stOf, { labelWidth, seed });
  el.innerHTML = `${z1(d)}${z2(d, nsl, stOf)}${z3(d.trains)}
    <section class="z z4" aria-label="Карта опозданий">${map.html}</section>
    ${z5(d, nsl, stOf)}${z6(d, nsl, byPoly, stOf)}
    ${side(d, nsl, ["Окт", "Моск", "Ю-З"], "z7")}${side(d, nsl, ["С-З", "Вост"], "z8")}`;
  el.classList.toggle("is-ns", nsl.length > 0);
  fitZones(el);
  return { ...map.stats, ns: nsl.length };
}

Object.assign(__M, { mapLayers, nsList, renderBoard });
})();

// ---- shift.js ----
(function () {
// Общая смена для окон ТКП и РМ: одна запись в localStorage и событие «storage» в остальных окнах.
// Окно, которое изменило смену, пишет её сюда; другие окна получают событие и перерисовываются, сами не записывая.
const KEY = "tkp-shift", me = Math.random().toString(36).slice(2);

function publishShift(s) {
  try { localStorage.setItem(KEY, JSON.stringify({ rev: Date.now(), from: me, source: s.source, seed: s.seed, heavy: s.heavy, mode: s.mode, data: s.data, added: s.added || [] })); } catch {}
}
function readShift() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return v && v.data && Array.isArray(v.data.trains) ? v : null; } catch { return null; }
}
function onShift(cb) {
  addEventListener("storage", e => {
    if (e.key !== KEY || !e.newValue) return;
    try { const v = JSON.parse(e.newValue); if (v.from !== me && v.data) cb(v); } catch {}
  });
}
// тема тоже общая: переключили в одном окне – меняется во всех
function onTheme(cb) { addEventListener("storage", e => { if (e.key === "tkp-theme" && e.newValue) cb(e.newValue); }); }

Object.assign(__M, { publishShift, readShift, onShift, onTheme });
})();

// ---- app.js ----
(function () {
// Демо ТКП: смена из макета или случайная, режим «штатный / НС», добавление своих поездов, свои данные в JSON.
const { SAMPLE, generate, plural, POLY_FULL } = __M;
const { renderBoard } = __M;
const { loadGeo, placeStation } = __M;
const { publishShift, readShift, onShift, onTheme } = __M;
const $ = s => document.querySelector(s);
const wrap = $("#wrap"), board = $("#board"), stat = $("#stat"), ta = $("#json"), err = $("#err");
const params = new URLSearchParams(location.search);
const MODES = ["norm", "ns", "multi"], MODE_TXT = { norm: "НС: нет", ns: "НС: одна", multi: "НС: несколько" };
let state = { source: params.get("seed") ? "seed" : "sample", seed: +params.get("seed") || 0, heavy: params.get("load") === "heavy",
  mode: MODES.includes(params.get("mode")) ? params.get("mode") : "norm", data: null, added: [] };
let stations = [];

// тема: тёмная (как ТКП в зале) или светлая; из адреса, иначе – последняя выбранная
const THEMES = { dark: "Тема: тёмная", light: "Тема: светлая" };
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
let theme = params.get("theme") === "light" || (!params.get("theme") && lsGet("tkp-theme") === "light") ? "light" : "dark";
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  $("#theme-txt").textContent = THEMES[theme];
  $("#theme").setAttribute("aria-pressed", theme === "light");
  board.querySelectorAll(".map-base").forEach(i => { i.src = `assets/${theme === "light" ? "base_map_light" : "base_map"}.svg`; });
}
applyTheme();

// ширина подписи: по тексту (Inter 600 75px) + поля 16+16, не уже 252 как в макете
const ctx = document.createElement("canvas").getContext("2d");
function labelWidth(t) {
  ctx.font = "600 75px Inter";
  const a = ctx.measureText(t.id + (t.speed ? "(ск)" : "")).width;
  const b = ctx.measureText(`+${Math.floor(t.delay / 60)}:${String(t.delay % 60).padStart(2, "0")}`).width;
  return Math.max(252, Math.ceil(Math.max(a, b)) + 32);
}

function fit() { board.style.transform = `scale(${wrap.clientWidth / 5400})`; }
new ResizeObserver(fit).observe(wrap);

// quiet – смену прислало другое окно (РМ): перерисовать, но обратно не записывать
function draw(quiet = false) {
  const st = renderBoard(board, state.data, { mode: state.mode, stations, labelWidth, seed: state.seed || 1 });
  const src = (state.source === "sample" ? "смена из макета" : state.source === "seed" ? `${state.heavy ? "загруженная" : "случайная"} смена №${state.seed}` : "свои данные") +
    (state.added.length ? ` + ${state.added.length} ${plural(state.added.length, "поезд добавлен", "поезда добавлено", "поездов добавлено")}` : "");
  const nsNote = state.mode !== "norm" ? (st.ns ? ` · НС: ${st.ns}` : " · в этой смене нет поезда для НС") : "";
  stat.innerHTML = `${src} · опаздывают <b>${st.total}</b> · значков на карте <b>${st.marks}</b>${st.grouped ? ` (групп ${st.grouped})` : ""} · подписано <b>${st.labeled}</b>` +
    (st.dropped.length ? ` · без подписи (не уместились): <b>${st.dropped.join(", ")}</b>` : "") +
    ` · раскладка <b>${st.ms} мс</b>${nsNote}`;
  $("#ns").setAttribute("aria-pressed", state.mode !== "norm");
  $("#ns-txt").textContent = MODE_TXT[state.mode];
  $("#heavy").setAttribute("aria-pressed", state.source === "seed" && state.heavy);
  const q = new URLSearchParams();
  if (state.source === "seed") q.set("seed", state.seed);
  if (state.source === "seed" && state.heavy) q.set("load", "heavy");
  if (state.mode !== "norm") q.set("mode", state.mode);
  if (theme === "light") q.set("theme", "light");
  history.replaceState(null, "", q.toString() ? "?" + q : location.pathname);
  ta.value = JSON.stringify(state.data, null, 1);
  window.__last = st; window.__data = state.data;
  renderChips();
  if (!quiet) publishShift(state);
  return st;
}

function load(source, seed) {
  state.source = source; state.added = []; msg("");
  if (source === "sample") state.data = structuredClone(SAMPLE);
  if (source === "seed") { state.seed = seed; state.data = generate(seed, stations, { heavy: state.heavy }); }
  draw();
}

const newSeed = () => 1 + Math.floor(Math.random() * 99999);
$("#rand").onclick = () => { state.heavy = false; load("seed", newSeed()); };
$("#heavy").onclick = () => { state.heavy = true; load("seed", newSeed()); };
$("#sample").onclick = () => load("sample");
$("#ns").onclick = () => { state.mode = MODES[(MODES.indexOf(state.mode) + 1) % 3]; draw(); };
$("#full").onclick = () => togglePresent();
$("#apply").onclick = () => {
  try {
    const d = JSON.parse(ta.value);
    const known = new Set(stations.map(s => s.name));
    if (!Array.isArray(d.trains)) throw new Error("нет списка trains");
    const bad = d.trains.filter(t => !known.has(t.station) && !(isFinite(t.lat) && isFinite(t.lon))).map(t => `${t.id}: «${t.station}»`);
    if (bad.length) throw new Error("станции нет в каталоге и у поезда нет координат lat/lon: " + bad.join(", "));
    const noDelay = d.trains.filter(t => !Number.isFinite(t.delay)).map(t => t.id);
    if (noDelay.length) throw new Error("нет опоздания в минутах (delay): " + noDelay.join(", "));
    for (const k of ["transit", "summary", "side"]) if (!d[k]) d[k] = structuredClone(SAMPLE[k]);
    for (const k of ["time", "date", "shift", "updated"]) if (!d[k]) d[k] = SAMPLE[k];
    err.hidden = true; state.source = "own"; state.data = d; state.added = []; draw();
    wrap.scrollIntoView({ behavior: "smooth" });
  } catch (e) { err.hidden = false; err.textContent = "Не получилось: " + e.message; }
};
// ---------- добавить свой поезд ----------
const fId = $("#a-id"), fSt = $("#a-st"), fDl = $("#a-dl"), fSp = $("#a-sp"), aMsg = $("#a-msg");
function msg(html, bad = false) { aMsg.innerHTML = html; aMsg.classList.toggle("bad", bad); }
const norm = s => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
function findStation(q) {
  const n = norm(q);
  if (!n) return null;
  const exact = stations.find(s => norm(s.name) === n || norm(s.short) === n);
  if (exact) return exact;
  const pre = stations.filter(s => norm(s.name).startsWith(n));
  return pre.length === 1 ? pre[0] : null;
}
// «45», «45 мин», «1:30», «1.30», «1ч30», «1 ч 30 м», «2ч», «+0:45» -> минуты
function parseDelay(q) {
  const v = q.toLowerCase().replace(/\s+/g, "").replace(/^\+/, "");
  let m;
  if ((m = v.match(/^(\d{1,2})[:.ч](\d{1,2})(м|мин)?$/))) return +m[1] * 60 + +m[2];
  if ((m = v.match(/^(\d{1,2})ч$/))) return +m[1] * 60;
  if ((m = v.match(/^(\d{1,4})(м|мин)?$/))) return +m[1];
  return NaN;
}
function normId(q) {
  const v = q.trim().toUpperCase().replace(/^T/, "Т").replace(/\s/g, "");
  if (!v) return "";
  const m = v.match(/^Т?-?(\d{1,4})$/);
  return m ? `Т-${m[1]}` : null;
}
function freeId(speed) {
  const used = new Set(state.data.trains.map(t => t.id));
  for (let i = 0; i < 1000; i++) {
    const id = `Т-${speed ? 700 + Math.floor(Math.random() * 100) : 100 + Math.floor(Math.random() * 600)}`;
    if (!used.has(id)) return id;
  }
  return `Т-${Date.now() % 10000}`;
}
const fmt = m => `+${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
function addTrain(t) {
  state.data.trains.push(t);
  state.added.push(t.id);
  const st = draw();
  // что стало с поездом: колонка, группа, подпись
  const s = findStation(t.station), g = st.groupOf[t.id];
  let where = g && st.groupSize[g] > 1 ? `на карте в группе из ${st.groupSize[g]}` : "на карте отдельный значок";
  where += st.placedIds.includes(g) ? (g === t.id ? ", подпись есть" : ", группа подписана по самому долгому") :
    ", без подписи: место у более долгих опозданий";
  msg(`Добавлен <b>${t.id}${t.speed ? "(ск)" : ""}</b>: ${s.name}, ${fmt(t.delay)} · колонка «${POLY_FULL[s.poly]}» · ${where}`);
  const el = board.querySelector(`[data-g="${CSS.escape(g || t.id)}"]`);
  if (el) { el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 2600); }
}
$("#add").addEventListener("submit", e => {
  e.preventDefault();
  [fId, fSt, fDl].forEach(f => f.removeAttribute("aria-invalid"));
  const s = findStation(fSt.value), delay = parseDelay(fDl.value), id0 = normId(fId.value);
  const fail = (f, text) => { f.setAttribute("aria-invalid", "true"); f.focus(); msg(text, true); };
  if (!s) return fail(fSt, fSt.value.trim() ? `Станции «${fSt.value.trim()}» нет в каталоге. Выберите из подсказок.` : "Укажите станцию.");
  if (!(delay > 0 && delay <= 1440)) return fail(fDl, "Опоздание: число минут (45) или часы:минуты (1:30), не больше суток.");
  if (id0 === null) return fail(fId, "Номер: цифры, например 128 или Т-128. Можно оставить пустым.");
  const id = id0 || freeId(fSp.checked);
  if (state.data.trains.some(t => t.id === id)) return fail(fId, `${id} уже есть на табло.`);
  addTrain({ id, speed: fSp.checked, delay, station: s.name });
  fId.value = ""; fSt.value = ""; fDl.value = ""; fSp.checked = false; fSt.focus();
});
$("#a-rand").onclick = () => {
  const s = stations[Math.floor(Math.random() * stations.length)], speed = Math.random() < 0.15, q = Math.random();
  const delay = speed ? 6 + Math.floor(Math.random() * 50) : q < 0.75 ? 6 + Math.floor(Math.random() * 54) : q < 0.92 ? 60 + Math.floor(Math.random() * 180) : 241 + Math.floor(Math.random() * 180);
  addTrain({ id: freeId(speed), speed, delay, station: s.name });
};
function renderChips() {
  $("#a-list").innerHTML = state.added.map(id => {
    const t = state.data.trains.find(x => x.id === id);
    return t ? `<span class="chip">${t.id}${t.speed ? "(ск)" : ""} · ${findStation(t.station)?.short || t.station} · ${fmt(t.delay)}<button type="button" data-del="${t.id}" aria-label="Убрать ${t.id}">×</button></span>` : "";
  }).join("");
}
$("#a-list").addEventListener("click", e => {
  const id = e.target.closest("[data-del]")?.dataset.del;
  if (!id) return;
  state.data.trains = state.data.trains.filter(t => t.id !== id);
  state.added = state.added.filter(x => x !== id);
  draw(); msg(`Убран ${id}.`);
});

$("#theme").onclick = () => {
  theme = theme === "light" ? "dark" : "light"; lsSet("tkp-theme", theme); applyTheme();
  const q = new URLSearchParams(location.search);
  if (theme === "light") q.set("theme", "light"); else q.delete("theme");
  history.replaceState(null, "", q.toString() ? "?" + q : location.pathname);
};

function togglePresent() {
  document.body.classList.toggle("present");
  if (document.body.classList.contains("present")) document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen();
  fit();
}
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) document.body.classList.remove("present"); fit(); });
document.addEventListener("keydown", e => {
  if (e.target.closest?.("textarea,input") || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "r" || k === "к") $("#rand").click();
  else if (k === "h" || k === "р") $("#heavy").click();
  else if (k === "n" || k === "т") $("#ns").click();
  else if (k === "m" || k === "ь") $("#sample").click();
  else if (k === "f" || k === "а") togglePresent();
  else if (k === "t" || k === "е") $("#a-rand").click();
  else if (k === "l" || k === "д") $("#theme").click();
});

// для проверок: window.__show(seed, mode, heavy)
window.__show = (seed, mode = "norm", heavy = false) => { state.mode = mode; state.heavy = heavy; load(seed ? "seed" : "sample", seed); return window.__last; };

(async () => {
  await loadGeo();
  stations = (window.TKP_DATA?.stations || await (await fetch("data/stations.json")).json()).map(placeStation);
  $("#stations").textContent = stations.map(s => s.name).join(", ");
  $("#st-list").innerHTML = stations.map(s => `<option value="${s.name}"></option>`).join("");
  await document.fonts.load("600 75px Inter"); await document.fonts.ready;
  fit();
  // смена из другого окна (РМ или прошлое ТКП), если в адресе не задана своя
  const stored = !params.get("seed") && !params.has("sample") ? readShift() : null;
  if (stored) adopt(stored, true); else load(state.source, state.seed);
  onShift(v => adopt(v, true));
  onTheme(t => { theme = t === "light" ? "light" : "dark"; applyTheme(); });
})();
function adopt(v, quiet) {
  state.source = v.source; state.seed = v.seed || 0; state.heavy = !!v.heavy; state.mode = MODES.includes(v.mode) ? v.mode : "norm";
  state.data = v.data; state.added = v.added || [];
  draw(quiet);
}

Object.assign(__M, {  });
})();
})();
