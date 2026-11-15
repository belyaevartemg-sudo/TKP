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

// ---- rmdata.js ----
(function () {
// Данные рабочего места «Мониторинг поездов» из той же смены, что и ТКП.
// Смена хранит только опаздывающие поезда; РМ показывает все поезда полигона в пути, поэтому поезда по графику
// и подробности каждого поезда (категория, маршрут, дорога, паспорт, состав, техоперации) достраиваются здесь.
// Всё детерминировано: один и тот же поезд в одной смене всегда выглядит одинаково.
const { rng } = __M;
const { POLYS, plural } = __M;
const { placeStation } = __M;
const pad = n => String(n).padStart(2, "0");
const hm = m => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;
const toMin = s => { const [h, m] = String(s).split(":").map(Number); return h * 60 + m; };
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const R = key => { const r = rng(hash(key) || 1); return { r, int: (a, b) => a + Math.floor(r() * (b - a + 1)), pick: a => a[Math.floor(r() * a.length)] }; };
// опоздание: «+4:40», «0:00», «−0:01» (минус – раньше графика)
const fmtDelay = m => (m < 0 ? "−" : m > 0 ? "+" : "") + `${Math.floor(Math.abs(m) / 60)}:${pad(Math.abs(m) % 60)}`;
const nf = n => n.toLocaleString("ru-RU").replace(/ /g, " ");
const v1 = v => v.toFixed(1).replace(".", ",");
// правило РМ: до +0:05 включительно – по графику; больше 4 ч – критично
const ON_TIME = 5;
const RED_MIN = 240;
const lvl = (x, ns) => ns || x.delay > RED_MIN ? "red" : x.delay > ON_TIME ? "amb" : "ok";

// станции из макета, которых нет в каталоге: координаты нужны, чтобы поезд встал на карту ТКП (НС с РМ)
const EXTRA_ST = { "Пенза-1": [53.2, 45.0], "Грязи-Воронежские": [52.5, 39.95], "Крымская": [44.93, 38.0], "Тамбов-1": [52.73, 41.43],
  "Краснодар-1": [45.04, 38.98], "Таганрог-Пасс.": [47.22, 38.9], "Пачелма": [53.31, 43.39], "Воронеж-1": [51.67, 39.18] };

// станция поезда: из каталога по имени или по своим координатам (как на ТКП)
function makeStOf(stations) {
  const byName = Object.fromEntries(stations.map(s => [s.name, s])), own = new Map();
  return t => {
    if (byName[t.station] && t.lat == null) return byName[t.station];
    const ll = t.lat != null ? [+t.lat, +t.lon] : EXTRA_ST[t.station];
    if (!ll) return { name: t.station, short: t.station, poly: t.poly || "Моск", lat: 55.75, lon: 37.6 };
    const k = t.station + ll;
    if (!own.has(k)) {
      const st = placeStation({ name: t.station, short: String(t.station).slice(0, 11), lat: ll[0], lon: ll[1], poly: t.poly });
      if (!POLYS.includes(st.poly)) st.poly = stations.reduce((a, b) => Math.hypot(b.x - st.x, b.y - st.y) < Math.hypot(a.x - st.x, a.y - st.y) ? b : a).poly;
      own.set(k, st);
    }
    return own.get(k);
  };
}

// дороги по полигонам: центр дороги (широта, долгота); станция относится к ближайшей дороге своего полигона (условно)
const ROADS = {
  "Окт": [["Октябрьская", 59.5, 32], ["Калининградская", 54.7, 20.5]],
  "Моск": [["Московская", 55.5, 37.6]],
  "Ю-З": [["Северо-Кавказская", 45.5, 40.5], ["Юго-Восточная", 51.5, 39.5], ["Приволжская", 49.5, 45.5], ["Куйбышевская", 53.5, 49], ["Южно-Уральская", 51.8, 55.1]],
  "С-З": [["Горьковская", 56.5, 47], ["Северная", 61, 42], ["Свердловская", 57.5, 62], ["Южно-Уральская", 54.5, 61], ["Западно-Сибирская", 55, 80]],
  "Вост": [["Красноярская", 56, 93], ["Восточно-Сибирская", 53, 104], ["Забайкальская", 51.5, 114], ["Дальневосточная", 48.5, 133]],
};
function roadOf(st) {
  const list = ROADS[st.poly] || ROADS["Моск"], k = Math.cos(st.lat * Math.PI / 180);
  const dist = r => Math.hypot(r[1] - st.lat, (r[2] - st.lon) * k);
  return list.reduce((a, b) => dist(b) < dist(a) ? b : a)[0];
}
const ROUTES = {
  "Окт": ["Москва – Санкт-Петербург", "Санкт-Петербург – Мурманск", "Москва – Псков", "Санкт-Петербург – Калининград", "Москва – Петрозаводск", "Санкт-Петербург – Великие Луки", "Москва – Мурманск"],
  "Моск": ["Москва – Брянск", "Москва – Смоленск", "Москва – Курск", "Москва – Рязань", "Москва – Калуга", "Москва – Тула", "Белгород – Москва"],
  "Ю-З": ["Москва – Адлер", "Астрахань – Москва", "Москва – Саратов", "Самара – Санкт-Петербург", "Москва – Новороссийск", "Воронеж – Москва", "Москва – Кисловодск", "Москва – Анапа", "Самара – Москва", "Пенза – Москва", "Саратов – Адлер", "Москва – Нальчик", "Белгород – Сочи", "Москва – Астрахань"],
  "С-З": ["Москва – Екатеринбург", "Москва – Новосибирск", "Москва – Нижний Новгород", "Екатеринбург – Санкт-Петербург", "Москва – Челябинск", "Новосибирск – Адлер", "Москва – Омск", "Москва – Пермь", "Москва – Тюмень"],
  "Вост": ["Москва – Владивосток", "Новосибирск – Владивосток", "Красноярск – Иркутск", "Москва – Чита", "Иркутск – Хабаровск", "Москва – Красноярск", "Новосибирск – Улан-Удэ"],
};
const CATS = ["Пассажирский", "Пассажирский", "Скорый", "Скорый", "Фирменный"];
const SEATS = { "С": 96, "С2": 68, "П": 54, "К": 36, "ВР": 0 };
const CAR_FULL = { "С": "Сидячий", "С2": "Сидячий", "П": "Плацкартный", "К": "Купейный", "ВР": "Вагон-ресторан" };
const CAR_SHORT = { "С": "С", "С2": "С", "П": "П", "К": "К", "ВР": "ВР" };

// состав: штабной вагон (купейный) в середине, за ним ресторан; как в макете Т-106
const staffIdx = n => Math.floor(n / 2) - 2;
function carTypes(cat, n) {
  if (cat === "Скоростной") return Array.from({ length: n }, () => "С2");
  const s = staffIdx(n), kk = Math.round(n * (cat === "Фирменный" ? 0.45 : cat === "Скорый" ? 0.2 : 0.1));
  return Array.from({ length: n }, (_, i) => {
    if (i === s) return "К";
    if (i === s + 1 && n >= 12) return "ВР";
    if (i < kk) return "К";
    if (cat === "Скорый") return i < s + 4 ? "П" : "С";
    if (cat === "Пассажирский") return i >= n - 3 ? "С" : "П";
    return "П";
  });
}

// подробности поезда; o – поля из макета («Как в макете»), иначе всё по хешу номера
function detail(t, st, key, o = {}) {
  const p = R(key + t.id);
  const cat = o.cat || (t.speed ? "Скоростной" : p.pick(CATS));
  const route = o.route || p.pick(ROUTES[st.poly] || ROUTES["Моск"]);
  const cars = o.cars || (t.speed ? 10 : p.int(12, 20));
  const types = carTypes(cat, cars), seats = types.reduce((a, ty) => a + SEATS[ty], 0);
  const pax = o.pax || Math.round(seats * p.int(70, 96) / 100);
  const v = o.v ?? (t.speed ? p.int(1050, 1600) / 10 : p.int(450, 860) / 10);
  return { ...t, station: o.station || t.station, cat, route, road: o.road || roadOf(st), poly: st.poly, lat: st.lat, lon: st.lon, cars, types, seats, pax, v,
    kids: o.kids ?? p.r() < 0.22, ctl: o.ctl ?? (p.r() < 0.05 ? "постоянный" : ""), stop: o.stop || "" };
}

// «Как в макете»: таблица Ю-З из Figma (187:4071); первые четыре – опаздывающие поезда смены (без своего опоздания)
const FIG = `Т-106|Скорый|Москва – Адлер|Северо-Кавказская|64,0|19:20|20|1180|
Т-128|Пассажирский|Астрахань – Москва|Приволжская|58,3|19:34|15|744|постоянный|Волгоград-1
Т-119|Скорый|Москва – Саратов|Приволжская|71,6|19:34|15|702|
Т-117|Пассажирский|Самара – Санкт-Петербург|Куйбышевская|59,8|19:34|14|610|
Т-147|Скорый|Москва – Новороссийск|Северо-Кавказская|70,3|19:34|16|812||Тихорецкая|4
Т-149|Пассажирский|Воронеж – Москва|Юго-Восточная|68,7|19:33|13|590||Мичуринск|3
Т-203|Скорый|Москва – Кисловодск|Северо-Кавказская|66,2|19:34|17|902|дети|Минеральные Воды|2
Т-205|Пассажирский|Саратов – Москва|Приволжская|61,4|19:34|14|655||Аткарск|2
Т-151|Скорый|Москва – Уфа|Куйбышевская|74,9|19:34|16|798|дети|Пенза-1|0
Т-163|Скорый|Москва – Воронеж|Юго-Восточная|79,4|19:34|14|640||Грязи-Воронежские|0
Т-167|Фирменный|Москва – Самара|Куйбышевская|83,7|19:34|16|760||Рузаевка|0
Т-201|Фирменный|Москва – Анапа|Северо-Кавказская|72,0|19:34|18|1040|дети|Крымская|0
Т-207|Скорый|Самара – Москва|Куйбышевская|76,3|19:34|15|690||Инза|0
Т-209|Пассажирский|Уфа – Москва|Куйбышевская|0,0|19:34|15|720|стоянка|Самара|0
Т-211|Скорый|Орск – Москва|Южно-Уральская|69,8|19:32|14|610||Оренбург|0
Т-213|Пассажирский|Москва – Астрахань|Приволжская|57,2|19:34|16|780||Верхний Баскунчак|0
Т-215|Скорый|Москва – Нальчик|Северо-Кавказская|70,1|19:34|15|700||Прохладная|0
Т-217|Пассажирский|Воронеж – Адлер|Северо-Кавказская|48,6|19:34|14|690|дети|Туапсе|0
Т-219|Фирменный|Москва – Липецк|Юго-Восточная|0,0|19:31|12|540|прибыл|Липецк|0
Т-223|Скорый|Москва – Тамбов|Юго-Восточная|82,0|19:34|13|610||Тамбов-1|0
Т-227|Скорый|Москва – Уфа|Куйбышевская|75,5|19:34|16|800||Абдулино|0
Т-161|Скорый|Москва – Анапа|Северо-Кавказская|0,0|19:34|16|790|стоянка|Краснодар-1|0
Т-153|Фирменный|Москва – Кисловодск|Юго-Восточная|81,6|19:34|17|860||Лиски|-1
Т-225|Пассажирский|Саратов – Адлер|Приволжская|62,7|19:34|16|760|оперативный|Камышин|-1
Т-221|Пассажирский|Белгород – Сочи|Северо-Кавказская|64,4|19:34|15|720||Таганрог-Пасс.|-2
Т-229|Пассажирский|Пенза – Москва|Куйбышевская|66,0|19:34|13|580||Пачелма|-3`
  .split("\n").map(l => { const [id, cat, route, road, v, upd, cars, pax, mark, station, delay] = l.split("|");
    return { id, cat, route, road, v: +v.replace(",", "."), upd, cars: +cars, pax: +pax, kids: mark === "дети",
      ctl: mark === "постоянный" || mark === "оперативный" ? mark : "", stop: mark === "стоянка" || mark === "прибыл" ? mark : "",
      station: station || "", delay: delay == null ? null : +delay }; });
const FIG_BY = Object.fromEntries(FIG.map(f => [f.id, f]));

// Все поезда в пути по полигонам: опаздывающие из смены + поезда по графику до числа «в пути» (d.transit[p]).
// Поезда по графику не зависят от списка опаздывающих: если один из них попадёт в смену (НС с РМ), остальные не меняются.
function allTrains(d, stOf, stations, sample) {
  const key = `${d.date}|${d.time}|`, now = toMin(d.time);
  const shiftIds = new Set(d.trains.map(t => t.id)), ctl = new Set(d.ctl || []), unctl = new Set(d.unctl || []);
  const out = Object.fromEntries(POLYS.map(p => [p, []]));
  // НС в вагоне N («Биоугроза · вагон 5»): в составе поезда должно быть не меньше N вагонов
  const nsCar = Object.fromEntries((Array.isArray(d.ns) ? d.ns : d.ns ? [d.ns] : []).map(n => [n.train, carOfNs(n)]).filter(e => e[1]));
  for (const t of d.trains) {
    const st = stOf(t), o = sample ? FIG_BY[t.id] : null;
    let x = detail(t, st, key, o || {});
    if (nsCar[t.id] > x.cars) x = detail(t, st, key, { ...(o || {}), cars: nsCar[t.id] });
    // числа из карточки НС на ТКП («904 пассажира, в вагоне 5 – 84») – главные: РМ их не пересчитывает
    const nsr = nsRec(d, t.id), np = nsPax(nsr);
    // людей больше, чем мест: состав длиннее (до 24 вагонов), чем выпал по номеру
    for (let n = x.cars + 1; np.total > x.seats && n <= 24; n++) x = detail(t, st, key, { ...(o || {}), cars: n });
    if (np.total) x.pax = Math.min(np.total, x.seats);
    if (np.inCar) x.nsInCar = np.inCar;
    x.stale = !!(d.stale && d.stale.train === t.id);
    x.upd = x.stale ? d.stale.time : o?.upd || hm(now - R(key + "upd" + t.id).int(0, 1));
    x.shiftStation = t.station; x.rank = o ? FIG.indexOf(o) : 999;
    out[st.poly].push(x);
  }
  const used = new Set();
  for (const p of POLYS) {
    const need = Math.max(0, (d.transit[p] || 0) - out[p].length);
    const cand = [];
    if (sample && p === "Ю-З") for (const f of FIG) if (f.delay != null) cand.push({ id: f.id, speed: false, delay: f.delay, station: f.station, poly: p, o: f });
    const polySt = stations.filter(s => s.poly === p), f = R(key + "fill" + p);
    for (let i = 0; cand.length < (d.transit[p] || 0) + 12 && polySt.length && i < 3000; i++) {
      const id = `Т-${f.int(100, 699)}`, st = f.pick(polySt), speed = f.r() < 0.06;
      // «Как в макете»: остальные поезда ниже 26 строк из Figma (там последняя – −0:03)
      const delay = sample && p === "Ю-З" ? (f.r(), -f.int(3, 4)) : f.r() < 0.3 ? -f.int(1, 3) : f.int(0, ON_TIME);
      if (used.has(id) || FIG_BY[id]) continue;
      used.add(id);
      cand.push({ id, speed, delay, station: st.name });
    }
    let n = 0;
    for (const c of cand) {
      if (n >= need) break;
      if (shiftIds.has(c.id)) continue;
      const { o, ...t } = c;
      const x = detail(t, o ? { ...stOf(t), poly: p } : stOf(t), key, o || {});
      x.poly = p; x.onTime = true; x.stale = false; x.rank = o ? FIG.indexOf(o) : 999;
      x.upd = o?.upd || hm(now - R(key + "upd" + t.id).int(0, 2));
      if (!o && !t.speed && R(key + "stop" + t.id).r() < 0.05) { x.stop = "стоянка"; x.v = 0; }
      out[p].push(x); n++;
    }
  }
  // отметки «на контроле» и «дети» – ровно по сводке смены (те же числа, что на ТКП): доля полигона – quota(),
  // поезда – по хешу номера. «Как в макете»: в Ю-З на контроле трое (постоянный 2 · оперативный 1), с детьми 52;
  // строки из Figma сохраняют свои отметки, недостающее добирается с поездов ниже 26 строк.
  // ctlBase – сводка до правок с РМ («Поставить на контроль» меняет сводку, но не расстановку)
  const base = d.ctlBase || d.summary.control, hashOrd = k => (a, b) => R(key + k + a.id).r() - R(key + k + b.id).r();
  for (const p of POLYS) {
    const list = out[p], fig = sample && p === "Ю-З", kept = fig ? list.filter(x => FIG_BY[x.id]) : [];
    const free = fig ? list.filter(x => !FIG_BY[x.id]) : [...list].sort(hashOrd("ctl"));
    free.forEach(x => { x.ctl = ""; x.kids = false; });
    let nP = quota(base[0], d, p, sample, 2) - kept.filter(x => x.ctl === "постоянный").length;
    let nO = quota(base[1], d, p, sample, 1) - kept.filter(x => x.ctl === "оперативный").length;
    for (const x of free) { if (nP > 0) { x.ctl = "постоянный"; nP--; } else if (nO > 0) { x.ctl = "оперативный"; nO--; } else break; }
    let nK = quota(d.summary.kids[0], d, p, sample, 52) - kept.filter(x => x.kids).length;
    for (const x of fig ? free : [...list].sort(hashOrd("kids"))) { if (nK-- <= 0) break; x.kids = true; }
  }
  for (const p of POLYS) for (const x of out[p]) {
    if (ctl.has(x.id) && !x.ctl) x.ctl = "оперативный";
    if (unctl.has(x.id)) x.ctl = "";
  }
  return out;
}

const nsRec = (d, id) => (Array.isArray(d.ns) ? d.ns : d.ns ? [d.ns] : []).find(n => n.train === id);
// пассажиры из фактов НС: всего в поезде и в вагоне НС
function nsPax(n) {
  const txt = (n?.facts || []).map(f => f.join("")).join(" | ");
  return { total: +(txt.match(/(\d[\d\s]*) пассажир/)?.[1].replace(/\s/g, "") || 0), inCar: +(txt.match(/в вагоне \d+ – (\d+)/)?.[1] || 0) };
}
// номер вагона из вида НС: «Пострадавший пассажир · вагон 8» → 8
const carOfNs = n => +(String(n?.kind || "").match(/вагон (\d+)/)?.[1] || 0);

// поезд по графику → поезд смены (нужно, чтобы объявить по нему НС: ТКП показывает только поезда смены)
function toShiftTrain(x, stations) {
  const t = { id: x.id, delay: Math.max(0, x.delay), station: x.station };
  if (x.speed) t.speed = true;
  if (!stations.some(s => s.name === x.station) && EXTRA_ST[x.station]) [t.lat, t.lon] = EXTRA_ST[x.station];
  return t;
}

// ---------- паспорт: общее, бригада, состав, техоперации ----------
const SURN = ["Орлов", "Зуев", "Сергеев", "Ковалёв", "Лебедев", "Морозов", "Никитин", "Фролов", "Ершов", "Гусев", "Белов", "Титов", "Панов", "Кротов", "Жуков", "Мельников", "Романов", "Широков", "Тарасов", "Дьяков"];
const INIT = ["А. С.", "В. Н.", "Д. К.", "П. А.", "И. М.", "Е. В.", "С. Ю.", "Н. Г.", "О. П.", "Р. Д."];
const name = p => `${p.pick(SURN)} ${p.pick(INIT)}`;
const W = (loco, crew, water, fuel, toilet, trash) => ({ loco: !!loco, crew: !!crew, water: !!water, fuel: !!fuel, toilet: !!toilet, trash: !!trash });
const WORKS = [["loco", "Локом."], ["crew", "Бригада"], ["water", "Вода"], ["fuel", "Топливо"], ["toilet", "ЭЧТК"], ["trash", "ТБО"]];
const WORK_TXT = { loco: "смена локомотива", crew: "смена бригады", water: "вода", fuel: "топливо", toilet: "ЭЧТК", trash: "сбор ТБО" };
// Т-106 «Как в макете» (137:5601): время работ – плановое, московское; день относительно даты смены
const T106_OPS = [["Москва-Курская", -1, "07:35", 40, W(0, 1, 1, 1, 1, 1)], ["Тула-1", -1, "11:20", 15, W(0, 0, 0, 0, 0, 1)], ["Орёл", -1, "15:10", 30, W(1, 0, 1, 0, 0, 1)],
  ["Курск", -1, "19:05", 20, W(0, 1, 1, 0, 1, 1)], ["Белгород", 0, "00:40", 30, W(1, 0, 1, 1, 1, 1)], ["Ростов-Главный", 0, "14:30", 30, W(1, 1, 1, 0, 0, 1)],
  ["Краснодар-1", 0, "18:20", 20, W(0, 1, 1, 0, 1, 1)], ["Туапсе", 0, "20:50", 10, W(0, 0, 0, 0, 0, 1)], ["Адлер", 0, "22:40", 30, W(0, 0, 1, 0, 1, 1)]];

function passport(x, d, stations, sample) {
  const p = R("pass" + x.id + d.date), now = toMin(d.time), fig = sample && x.id === "Т-106";
  const [from, to] = x.route.split(" – ");
  const total = fig ? 1620 : p.int(700, 2600), done = fig ? 1100 : Math.round(total * p.int(25, 85) / 100);
  const T = fig ? 38 * 60 + 25 : Math.round(total / p.int(48, 62) * 60);
  const f0 = done / total, dep = fig ? -1440 + 8 * 60 + 15 : now - x.delay - Math.round(f0 * T), arr = dep + T;
  const day = m => dayOf(d.date, m), dd = m => `${day(m)} · ${hm(m)}`;
  const onWay = Math.max(0, now - dep);
  // состав
  const kidsTotal = x.kids ? p.int(6, 40) : 0, num = x.id.replace(/\D/g, "").padStart(3, "0"), sIdx = staffIdx(x.cars);
  const comp = x.types.map((ty, i) => ({ n: i + 1, num: `000-${num}${pad(i + 1)}`, type: ty, seats: SEATS[ty], pax: 0, kids: 0,
    note: i === sIdx && ty === "К" ? "штабной" : ty === "ВР" ? "служебный" : "" }));
  let left = x.pax;
  const withSeats = comp.filter(c => c.seats);
  withSeats.forEach(c => { c.pax = Math.min(c.seats, Math.round(c.seats * x.pax / x.seats * (0.94 + p.r() * 0.1))); left -= c.pax; });
  for (let guard = 0; left && guard < 5; guard++)
    for (const c of withSeats) { const add = Math.max(-c.pax, Math.min(c.seats - c.pax, left)); c.pax += add; left -= add; if (!left) break; }
  // вагон НС: число людей из карточки НС (может быть больше мест – люди из соседних вагонов)
  const nc = comp[carOfNs(nsRec(d, x.id)) - 1];
  if (nc && x.nsInCar) {
    let diff = x.nsInCar - nc.pax; nc.pax = x.nsInCar;
    // разница – поровну с остальных вагонов (пропорционально заполнению), а не с первого подряд
    const others = withSeats.filter(c => c !== nc), T = others.reduce((a, c) => a + c.pax, 0) || 1, d0 = diff;
    for (const c of others) { const take = Math.min(c.pax - 1, Math.floor(d0 * c.pax / T)); c.pax -= take; diff -= take; }
    for (let i = 0; diff > 0 && i < others.length * 3; i++) { const c = others[i % others.length]; if (c.pax > 1) { c.pax--; diff--; } }
  }
  const forKids = withSeats.filter(c => c.pax > 1);
  for (let k = kidsTotal; k > 0 && forKids.length; k--) { const c = p.pick(forKids); if (c.kids < c.pax) c.kids++; }
  const crewSize = x.cars + Math.round(x.cars * 0.4);
  // техоперации
  let ops;
  if (fig) ops = T106_OPS.map(([station, dday, t, stay, works], i) => ({ station, from: dday * 1440 + toMin(t), stay, works, done: i <= 5 }));
  else {
    const n = p.int(7, 9), cur = Math.min(n - 2, Math.max(1, Math.round(f0 * (n - 1))));
    // промежуточные станции – ближайшие к текущей: до неё по приближению, после – по удалению (условно, без графа сети)
    const here = stations.find(s => s.name === x.station) || { lat: x.lat ?? 50, lon: x.lon ?? 40 };
    const km = s => Math.hypot(s.lat - here.lat, (s.lon - here.lon) * Math.cos(here.lat * Math.PI / 180));
    const near = stations.filter(s => s.poly === x.poly && s.name !== x.station && km(s) > 0.3).sort((a, b) => km(a) - km(b)).slice(0, 2 * n);
    const before = [], after = [];
    near.forEach(s => (p.r() < 0.5 ? before : after).push(s));
    before.sort((a, b) => km(b) - km(a)).splice(0, Math.max(0, before.length - (cur - 1)));
    const nb = before.length;
    const pickName = i => (i < cur ? before[i - 1 - (cur - 1 - nb)] : after[i - cur - 1])?.name || "–";
    ops = Array.from({ length: n }, (_, i) => {
      const f = i <= cur ? f0 * i / cur : f0 + (1 - f0) * (i - cur) / (n - 1 - cur);
      const stay = i === 0 || i === n - 1 ? p.pick([30, 40]) : p.pick([10, 15, 20, 30]);
      const st = i === 0 ? from : i === n - 1 ? to : i === cur ? x.station : pickName(i);
      const at = dep + Math.round(f * T);
      return { station: st, from: i === 0 ? at - stay : at, stay, done: i <= cur,
        works: W(p.r() < 0.25, p.r() < 0.35, p.r() < 0.5, p.r() < 0.15, p.r() < 0.45, i === n - 1 || p.r() < 0.7) };
    });
  }
  const cur = ops.findLastIndex(o => o.done), next = Math.min(cur + 1, ops.length - 1);
  const late = Math.max(0, x.delay);
  ops.forEach((o, i) => { o.to = o.from + o.stay; o.status = o.done ? "выполнено" : i === ops.length - 1 ? "по прибытии" : "запланировано";
    o.fFrom = o.from + (o.done ? 0 : late); o.fTo = o.to + (o.done ? 0 : late);
    o.time = `${day(o.from)} ${hm(o.from)}–${hm(o.to)}`; o.list = Object.keys(o.works).filter(k => o.works[k]); });
  const crew = crewOf(x, d, sample);
  const pp = R("people" + x.id);
  return { from, to, dep: dd(dep), arr: dd(arr), forecast: dd(arr + late), total, done, left: total - done,
    onWay: `${Math.floor(onWay / 1440) ? Math.floor(onWay / 1440) + " д " : ""}${Math.floor(onWay % 1440 / 60)} ч ${onWay % 60} мин`,
    firm: fig ? "ФПК, Россия" : pp.pick(["ФПК, Россия", "ФПК, Россия", "ФПК, Россия", "ТКС"]), chief: fig ? "Сергеев В. Н." : name(pp),
    phone: fig ? "+7 954 000-00-00" : `+7 954 ${pp.int(100, 999)}-${pad(pp.int(0, 99))}-${pad(pp.int(0, 99))}`,
    staff: x.cat === "Скоростной" ? "–" : `${sIdx + 1} · ${sIdx + 2}`, crewSize, loco: `${crew.driver}, ${crew.assist}`,
    crewChange: `${crew.station} · по плану ${hm(crew.plan)}${crew.late > 5 ? `, ожид. ${hm(crew.exp)}` : ""}`,
    source: `ЦЦ Г · ${x.upd}`, comp, kidsTotal, ops, cur, next, day,
    workText: o => {
      const yes = o.list.map(k => WORK_TXT[k]), no = ["loco", "fuel"].filter(k => !o.works[k]).map(k => WORK_TXT[k]);
      return `Работы: ${yes.join(", ") || "нет"}${no.length ? ` · ${no.join(" и ")} не требу${no.length > 1 ? "ются" : "ется"}` : ""}`;
    } };
}
function dayOf(date, m) {
  const [dd, mm, yy] = date.split(",")[0].split(".").map(Number);
  const dt = new Date(Date.UTC(yy, mm - 1, dd)); dt.setUTCDate(dt.getUTCDate() + Math.floor(m / 1440));
  return `${pad(dt.getUTCDate())}.${pad(dt.getUTCMonth() + 1)}`;
}

// ---------- блоки справа: показатели полигона, инфраструктура, отправления, города ----------
const DEP = {
  "Окт": [["Санкт-Петербург – Москва", "Санкт-Петербург-Главный"], ["Мурманск – Москва", "Мурманск"], ["Псков – Москва", "Псков"], ["Петрозаводск – Москва", "Петрозаводск"], ["Калининград – Москва", "Калининград"]],
  "Моск": [["Москва – Брянск", "Москва-Киевская"], ["Москва – Курск", "Москва-Курская"], ["Тула – Москва", "Тула-1"], ["Смоленск – Москва", "Смоленск"], ["Рязань – Москва", "Рязань-1"]],
  "Ю-З": [["Ростов – Москва", "Ростов-Главный"], ["Самара – Адлер", "Самара"], ["Волгоград – Москва", "Волгоград-1"], ["Адлер – Москва", "Адлер"], ["Воронеж – Санкт-Петербург", "Воронеж-1"], ["Саратов – Москва", "Саратов-1"]],
  "С-З": [["Екатеринбург – Москва", "Екатеринбург-Пасс."], ["Новосибирск – Москва", "Новосибирск-Главный"], ["Челябинск – Москва", "Челябинск-Главный"], ["Омск – Москва", "Омск-Пассажирский"], ["Пермь – Москва", "Пермь II"]],
  "Вост": [["Владивосток – Москва", "Владивосток"], ["Иркутск – Москва", "Иркутск-Пасс."], ["Красноярск – Москва", "Красноярск"], ["Хабаровск – Москва", "Хабаровск-1"], ["Чита – Москва", "Чита-2"]],
};
const CITY = {
  "Окт": [["Санкт-Петербург", 3, -8], ["Петрозаводск", 3, -12], ["Псков", 3, -6], ["Мурманск", 3, -15], ["Калининград", 2, -2], ["Тверь", 3, -9]],
  "Моск": [["Москва", 3, -8], ["Тула", 3, -8], ["Смоленск", 3, -7], ["Брянск", 3, -6], ["Рязань", 3, -9], ["Калуга", 3, -8]],
  "Ю-З": [["Ростов-на-Дону", 3, -2], ["Адлер", 3, 4], ["Волгоград", 3, -6], ["Воронеж", 3, -7], ["Саратов", 4, -10], ["Самара", 4, -12]],
  "С-З": [["Екатеринбург", 5, -16], ["Новосибирск", 7, -20], ["Нижний Новгород", 3, -10], ["Челябинск", 5, -15], ["Омск", 6, -19], ["Пермь", 5, -15]],
  "Вост": [["Красноярск", 7, -22], ["Иркутск", 8, -24], ["Чита", 9, -26], ["Хабаровск", 10, -22], ["Владивосток", 10, -12], ["Улан-Удэ", 8, -25]],
};
const SKIES = ["ясно", "облачно", "снег", "пасмурно"];
const FIG_BLOCKS = {
  dep: [["Т-233", "Ростов – Москва", "Ростов-Главный", "19:05", 0], ["Т-235", "Самара – Адлер", "Самара", "19:20", 12], ["Т-237", "Волгоград – Москва", "Волгоград-1", "19:30", 0],
        ["Т-239", "Адлер – Москва", "Адлер", "19:45", 0], ["Т-241", "Воронеж – Санкт-Петербург", "Воронеж-1", "20:10", 0]],
  cities: [["Ростов-на-Дону", 3, "ясно", -5], ["Адлер", 3, "ясно", 0], ["Волгоград", 3, "облачно", -8], ["Воронеж", 3, "облачно", -7], ["Саратов", 4, "снег", -10], ["Самара", 4, "снег", -12]],
};

// доля полигона от числа смены: накопленное округление по POLYS, поэтому сумма по полигонам равна числу на ТКП.
// В образце Ю-З задан макетом (fixed), остальные полигоны делят остаток
function quota(total, d, p, sample, fixed) {
  if (sample && p === "Ю-З") return fixed;
  const ps = POLYS.filter(q => !(sample && q === "Ю-З")), rest = Math.max(0, total - (sample ? fixed : 0));
  const w = ps.map(q => d.transit[q] || 0), W = w.reduce((a, b) => a + b, 0) || 1, i = ps.indexOf(p);
  const cum = k => Math.round(rest * w.slice(0, k).reduce((a, b) => a + b, 0) / W);
  return cum(i + 1) - cum(i);
}
function polyBlocks(d, p, list, nsIds, sample) {
  const fig = sample && p === "Ю-З", now = toMin(d.time), pr = R("blocks" + p + d.date + d.time);
  const tot = POLYS.reduce((a, q) => a + (d.transit[q] || 0), 0) || 1, share = (d.transit[p] || 0) / tot, s = d.summary;
  // отправления со станций формирования полигона
  const ids = new Set(list.map(x => x.id));
  // список на ближайшую часть смены (за 1,5 ч до текущего времени и на 4 ч вперёд), блок листается;
  // «Как в макете» – 5 строк из Figma, за ними – более поздние
  const rel = t => (toMin(t) - now + 720 + 1440) % 1440 - 720;
  const routes = [...DEP[p]].sort(() => pr.r() - 0.5);
  const mkDep = (t, i) => { let id; do id = `Т-${pr.int(200, 299)}`; while (ids.has(id)); ids.add(id);
    const [route, station] = routes[i % routes.length];
    return { id, route, station, t: hm(t), late: 0 }; };
  let dep;
  if (fig) {
    dep = FIG_BLOCKS.dep.map(([id, route, station, t, late]) => (ids.add(id), { id, route, station, t, late }));
    for (let t = toMin("20:10") + 17, i = 0; t <= now + 240; t += 14 + pr.int(0, 12), i++) dep.push(mkDep(t, i));
  } else {
    dep = [];
    for (let t = now - 90 + pr.int(0, 10), i = 0; t <= now + 240; t += 12 + pr.int(0, 14), i++) dep.push(mkDep(t, i));
  }
  dep.forEach(x => { x.rel = rel(x.t); });
  // задержанных отправлений – доля полигона от «Задержано отправление» на ТКП, среди уже ушедших и ближайших
  if (!fig) {
    const k = quota(s.delayedDep, d, p, sample, FIG_BLOCKS.dep.filter(r => r[4]).length);
    const cand = dep.filter(x => x.rel <= 60).sort(() => pr.r() - 0.5);
    (cand.length >= k ? cand : [...cand, ...dep.filter(x => x.rel > 60)]).slice(0, k).forEach(x => { x.late = pr.int(6, 25); });
  }
  dep.forEach(x => { const m = x.rel + x.late;
    x.status = m < 0 ? "ушёл" : m <= 20 ? "посадка" : x.late ? "задержан" : "по графику"; });
  dep.sort((a, b) => a.rel - b.rel);
  // инфраструктура: события карточки полигона на ТКП
  const side = d.side?.[p] || { events: [], weather: [] };
  const byDelay = [...list].sort((a, b) => b.delay - a.delay);
  const near = i => fig ? "Т-106, Т-147" : byDelay.filter((_, k) => (k + i) % 3 === 0).slice(0, 2).map(x => x.id).join(", ") || "–";
  const infra = side.events.map((e, i) => e.type === "fail"
    ? { kind: e.head[0], lvl: e.train && nsIds.has(e.train) ? "red" : "fail", where: e.where, until: `${e.head[1]} · устраняется`, trains: e.train || near(i) }
    : { kind: e.head[0] === "Предупреждение" ? `${e.head[0]} ${e.head[1]}` : e.head[0], lvl: "amb", where: e.where,
        until: e.head[0] === "Предупреждение" ? (fig ? "до 23:00" : `до ${hm(now + 60 * pr.int(1, 4))}`) : e.head[1], trains: near(i) });
  // города: из карточки полигона (погода с предупреждением), остальные – из списка полигона
  const cities = [];
  if (fig) FIG_BLOCKS.cities.forEach(([city, tz, sky, t]) => cities.push({ city, tz, sky, t }));
  else {
    for (const w of side.weather || []) cities.push({ city: w.city, tz: 3 + Math.round(((toMin(w.local) - now + 1440 + 720) % 1440 - 720) / 60), sky: w.sky, t: w.t });
    for (const [city, tz, t0] of CITY[p]) if (cities.length < 6 && !cities.some(c => c.city === city)) cities.push({ city, tz, sky: pr.pick(SKIES), t: t0 + pr.int(-5, 5) });
  }
  cities.forEach(c => { c.local = hm(now + (c.tz - 3) * 60); });
  const ctl = list.filter(x => x.ctl), kids = list.filter(x => x.kids);
  const plan = Math.max(1, quota(s.plan, d, p, sample, 70)), sent = Math.min(plan, quota(s.sent, d, p, sample, 38));
  return { plan, sent, pct: Math.round(sent / plan * 100), delayedDep: dep.filter(x => x.late).length,
    ctl: ctl.length, ctlSplit: [ctl.filter(x => x.ctl === "постоянный").length, ctl.filter(x => x.ctl !== "постоянный").length],
    kids: kids.length, kidsN: quota(s.kids[1], d, p, sample, 1640), groups: quota(s.kids[2], d, p, sample, 55),
    transit: list.length, delta: s.transitDelta, intl: quota(s.intl, d, p, sample, 3), foreign: quota(s.foreign, d, p, sample, 2),
    infra, dep, cities };
}

// ---------- локомотивные бригады (РМ «Бригады») ----------
// В исходных макетах бригад и контактов нет: данные условные (допущение), но одни и те же для поезда во всей смене:
// машинист и смена бригады в паспорте поезда (РМ мониторинга) – те же, что на РМ «Бригады».
// Депо – ближайшее к текущей станции поезда депо его полигона; бригада сменяется в другом депо полигона.
// Норма работы – 12 ч от явки. «Превышение» – бригаду сменят позже конца работы по графику (из-за опоздания поезда).
const DEPOTS = {
  "Окт": [["Санкт-Петербург", 59.93, 30.36, "Санкт-Петербург-Главный"], ["Бологое", 57.88, 34.05], ["Петрозаводск", 61.79, 34.35], ["Мурманск", 68.97, 33.08], ["Великие Луки", 56.34, 30.54], ["Псков", 57.82, 28.33]],
  "Моск": [["Москва", 55.75, 37.62, "Москва-Курская"], ["Тула", 54.2, 37.6, "Тула-1"], ["Брянск", 53.24, 34.36, "Брянск-Орловский"], ["Смоленск", 54.78, 32.04], ["Рязань", 54.63, 39.74, "Рязань-1"], ["Орёл", 52.97, 36.06]],
  "Ю-З": [["Ростов", 47.22, 39.72, "Ростов-Главный"], ["Волгоград", 48.7, 44.5, "Волгоград-1"], ["Саратов", 51.53, 46.0, "Саратов-1"], ["Самара", 53.2, 50.15, "Самара"],
          ["Тихорецкая", 45.85, 40.12, "Тихорецкая"], ["Лиски", 50.98, 39.5, "Лиски"], ["Минводы", 44.2, 43.13, "Минеральные Воды"], ["Пенза", 53.2, 45.0, "Пенза-1"],
          ["Краснодар", 45.04, 38.98, "Краснодар-1"], ["Оренбург", 51.77, 55.1, "Оренбург"], ["Воронеж", 51.67, 39.18, "Воронеж-1"]],
  "С-З": [["Нижний Новгород", 56.33, 44.0, "Нижний Новгород-Моск."], ["Киров", 58.6, 49.66], ["Пермь", 58.0, 56.25, "Пермь II"], ["Екатеринбург", 56.84, 60.6, "Екатеринбург-Пасс."], ["Тюмень", 57.15, 65.53],
          ["Омск", 54.99, 73.37, "Омск-Пассажирский"], ["Новосибирск", 55.03, 82.92, "Новосибирск-Главный"], ["Челябинск", 55.16, 61.4, "Челябинск-Главный"], ["Ярославль", 57.63, 39.87, "Ярославль-Главный"]],
  "Вост": [["Красноярск", 56.01, 92.85], ["Тайшет", 55.94, 98.0], ["Иркутск", 52.29, 104.3, "Иркутск-Пасс."], ["Улан-Удэ", 51.83, 107.6], ["Чита", 52.03, 113.5, "Чита-2"],
           ["Белогорск", 50.92, 128.47], ["Хабаровск", 48.48, 135.08, "Хабаровск-1"], ["Владивосток", 43.12, 131.9]],
};
const DEPOT_BY_ST = Object.fromEntries(Object.values(DEPOTS).flat().map(([n, , , st]) => [st || n, n]));
const CREW_SURN = ["Орлов", "Зуев", "Белов", "Карпов", "Ковалёв", "Егоров", "Морозов", "Андреев", "Лебедев", "Макаров", "Соколов", "Захаров", "Волков", "Яковлев",
  "Никитин", "Борисов", "Фёдоров", "Григорьев", "Зайцев", "Романов", "Павлов", "Осипов", "Семёнов", "Савельев", "Голубев", "Мельников", "Виноградов", "Щербаков",
  "Богданов", "Блинов", "Воробьёв", "Антонов", "Филиппов", "Тарасов", "Марков", "Беляков", "Комаров", "Медведев", "Ершов", "Ширяев", "Тихонов", "Ефимов",
  "Гусев", "Широков", "Титов", "Королёв", "Кузьмин", "Абрамов", "Кудрявцев", "Ильин", "Баранов", "Мартынов"];
const CREW_INIT = ["А. С.", "В. Н.", "Д. К.", "П. А.", "И. М.", "Е. В.", "С. Ю.", "Н. Г.", "О. П.", "Р. Д.", "А. И.", "М. С.", "С. П.", "Д. В.", "И. В.", "И. Н.", "Н. А.", "О. Л.", "Г. С.", "К. Е."];
const crewName = p => `${p.pick(CREW_SURN)} ${p.pick(CREW_INIT)}`;
const crewPhone = p => `+7 9${p.int(10, 99)} ${p.int(100, 999)}-${pad(p.int(0, 99))}-${pad(p.int(0, 99))}`;
const WORK_NORM = 12 * 60;
// «Как в макете» (191:4378): бригады первых 26 поездов Ю-З. Отличия от макета ради сходимости с нормой 12 ч:
// Т-128 – явка 08:14 и смена 20:05 (в макете 14:13 и 21:40 при «до конца работы 0:40»), явка Т-205, Т-211, Т-217 на час–два позже (иначе превышение) – машинист, помощник, депо, явка, станция и ожидаемое время смены, телефон
const FIG_CREW = `Т-106|Орлов Д. К.|Зуев П. А.|Ростов|09:30|Краснодар-1|23:00|+7 928 410-22-15|+7 928 410-37-08
Т-128|Белов А. И.|Карпов М. С.|Волгоград|08:14|Саратов-1|20:05|+7 945 453-39-51
Т-119|Ковалёв С. П.|Егоров Д. В.|Саратов|12:26|Тихорецкая|22:34|+7 952 506-68-92
Т-117|Морозов И. В.|Андреев И. Н.|Самара|10:39|Воронеж-1|20:51|+7 959 559-97-44
Т-147|Лебедев Н. А.|Макаров О. Л.|Тихорецкая|15:52|Самара|21:08|+7 966 612-37-85
Т-149|Соколов П. Е.|Захаров Р. С.|Лиски|13:05|Волгоград-1|22:25|+7 973 665-66-37
Т-203|Волков Р. М.|Яковлев П. И.|Минводы|11:18|Краснодар-1|20:42|+7 980 718-95-78
Т-205|Никитин Г. С.|Борисов К. Е.|Саратов|10:31|Пенза-1|21:59|+7 987 771-35-30
Т-151|Фёдоров В. О.|Григорьев А. А.|Пенза|14:44|Ростов-Главный|22:16|+7 994 824-64-71
Т-163|Зайцев К. Л.|Романов С. Д.|Лиски|12:57|Минеральные Воды|20:33|+7 911 877-93-23
Т-167|Павлов Е. Д.|Осипов В. В.|Пенза|10:10|Саратов-1|21:50|+7 918 430-33-64
Т-201|Семёнов А. Ю.|Савельев Г. М.|Краснодар|15:23|Лиски|22:07|+7 925 483-62-16
Т-207|Голубев М. Н.|Мельников А. С.|Самара|13:36|Тихорецкая|20:24|+7 932 536-91-57
Т-209|Виноградов О. П.|Щербаков Е. И.|Самара|11:49|Воронеж-1|21:41|+7 939 589-31-98
Т-211|Богданов Т. И.|Блинов Р. Р.|Оренбург|11:02|Самара|22:58|+7 946 642-60-50
Т-213|Воробьёв Л. А.|Антонов Ф. К.|Волгоград|14:15|Волгоград-1|20:15|+7 953 695-89-91
Т-215|Филиппов Д. С.|Тарасов Л. Н.|Минводы|12:28|Краснодар-1|21:32|+7 960 748-29-43
Т-217|Марков Ю. В.|Беляков Д. П.|Краснодар|11:41|Пенза-1|22:49|+7 967 801-58-84
Т-219|Комаров Б. Г.|Медведев О. А.|Лиски|15:54|Ростов-Главный|20:06|+7 974 854-87-36
Т-223|Ершов В. К.|Ширяев И. Т.|Лиски|13:07|Минеральные Воды|21:23|+7 981 407-27-77
Т-227|Тихонов С. Р.|Ефимов Н. Н.|Самара|11:20|Саратов-1|22:40|+7 988 460-56-29
Т-161|Гусев И. Л.|Широков А. Г.|Краснодар|09:33|Лиски|20:57|+7 995 513-85-70
Т-153|Титов А. М.|Королёв М. Е.|Лиски|14:46|Тихорецкая|21:14|+7 912 566-25-22
Т-225|Кузьмин Н. Е.|Абрамов С. С.|Волгоград|12:59|Воронеж-1|22:31|+7 919 619-54-63
Т-221|Кудрявцев П. О.|Ильин В. Ю.|Ростов|10:12|Самара|20:48|+7 926 672-83-15
Т-229|Баранов Е. А.|Мартынов К. А.|Пенза|15:25|Волгоград-1|21:05|+7 933 725-23-56`
  .split("\n").map(l => l.split("|"));
const FIG_CREW_BY = Object.fromEntries(FIG_CREW.map(r => [r[0], r]));
const kmTo = (x, [, lat, lon]) => Math.hypot(lat - (x.lat ?? 50), (lon - (x.lon ?? 40)) * Math.cos((x.lat ?? 50) * Math.PI / 180));

function crewOf(x, d, sample) {
  const now = toMin(d.time), p = R("crew" + x.id + d.date), late = Math.max(0, x.delay);
  const deps = DEPOTS[x.poly] || DEPOTS["Моск"], byDist = [...deps].sort((a, b) => kmTo(x, a) - kmTo(x, b));
  const f = sample && x.poly === "Ю-З" ? FIG_CREW_BY[x.id] : null;
  let depot, driver, assist, phone, aPhone, start, station, exp;
  if (f) {
    [, driver, assist, depot, , station, , phone, aPhone] = f;
    start = toMin(f[4]); exp = toMin(f[6]);
    if (start > now) start -= 1440; if (exp < now - 120) exp += 1440;
  } else {
    depot = byDist[0][0]; driver = crewName(p); assist = crewName(p); phone = crewPhone(p);
    // явка 3:40–11:30 назад; смена – в другом депо полигона, по плану до конца работы, ожидание = план + опоздание
    start = now - p.int(220, sample ? 600 : 690);
    const to = byDist[1 + Math.floor(p.r() * Math.min(3, byDist.length - 1))] || byDist[0];
    station = to[3] || to[0];
    const room = start + WORK_NORM - now;
    exp = now + p.int(15, Math.max(30, room - 10)) + late;
  }
  aPhone = aPhone || crewPhone(R("crew2" + x.id));
  const q = R("crewnext" + x.id + d.date), next = crewName(q);
  const end = start + WORK_NORM, plan = exp - late;
  const toDepot = DEPOT_BY_ST[station] || station.replace(/-.*$/, "");
  const over = exp - end, left = end - now;
  const status = over > 0 ? "превышение" : left < 60 ? "близко к концу" : x.stop ? x.stop : "в норме";
  return { depot, driver, assist, phone, aPhone, next, start, end, worked: now - start, station, toDepot, plan, exp, late, over, left, status,
    // явка новой бригады – за 30 мин до смены
    ready: exp - 30 };
}
// резерв бригад в депо полигона – условно, от числа депо и поездов
const crewReserve = (d, p, n) => (DEPOTS[p] || []).length + Math.round(n / 40) + R("res" + p + d.date).int(0, 3);

// отправлено пассажиров за сутки, месяц, год (РМ руководителя) – условно; в образце – числа макета 146:3458
function paxTotals(d, sample) {
  if (sample) return { day: 257371, dayPct: 32, month: 499382, monthPct: 14.9, year: 4842400, yearPct: 14.9 };
  const p = R("paxsum" + d.date), [dd, mm] = d.date.split(",")[0].split(".").map(Number), doy = Math.round((mm - 1) * 30.4) + dd;
  const dayPct = Math.round(d.summary.sent / Math.max(1, d.summary.plan) * 100), day = p.int(180, 320) * 1000 + p.int(0, 999);
  const month = Math.round(day * (dd - 1 + dayPct / 100) * p.int(94, 104) / 100), year = Math.round(day * (doy - 1 + dayPct / 100) * p.int(95, 103) / 100);
  return { day, dayPct, month, monthPct: Math.round(dd / 30.4 * 980) / 10, year, yearPct: Math.round(doy / 365 * 1000) / 10 };
}

// ---------- инфраструктура (РМ «Инфраструктура», 194:4704 / 198:5121) ----------
// Действующие события – из карточек полигонов на ТКП (d.side): отказы, окна, предупреждения. Журнал за сутки – их шаги
// и закрытые за сутки события (условные). В исходных макетах данных по инфраструктуре нет – допущение.
const DIR_OF = k => /СЦБ|связ/.test(k) ? "СЦБ и связь" : /КС|энерг/.test(k) ? "энергоснабжение" : "путь";
const FAIL_INFO = {
  "Отказ СЦБ": { what: "отказ автоблокировки на перегоне", short: "отказ автоблокировки", lim: "25 км/ч по разрешению", crew: "дистанции СЦБ", ns: "отказ автоблокировки, сигнал запрещающий" },
  "Отказ КС": { what: "обрыв контактного провода", short: "обрыв контактного провода", lim: "по соседнему пути", crew: "района контактной сети", ns: "обрыв контактного провода, напряжение снято" },
  "Отказ пути": { what: "излом рельса на перегоне", short: "излом рельса", lim: "движение закрыто", crew: "дистанции пути", ns: "излом рельса, движение закрыто" },
};
const WIN_WHAT = { "путь": ["плановый ремонт", "плановая смена стрелки", "замена рельсов"], "энергоснабжение": ["плановая замена изоляторов", "ремонт контактной подвески"], "СЦБ и связь": ["замена светофора", "ремонт рельсовых цепей"] };
const WARN_WHAT = ["дефект рельса", "просадка пути после оттепели", "выплеск балласта", "после окна, до проверки"];
const RESP = { "путь": "дистанция пути", "СЦБ и связь": "дистанция СЦБ", "энергоснабжение": "дистанция электроснабжения" };
const INFRA_WHERE = {
  "Окт": ["Чудово – Малая Вишера", "Бологое – Угловка", "Кемь – Беломорск", "Окуловка – Боровёнка"],
  "Моск": ["Курск – Солнцево", "Серпухов – Тарусская", "Вязьма – Смоленск", "Тула – Орёл"],
  "Ю-З": ["Сызрань – Октябрьск", "Лиски – Россошь", "Батайск – Каневская", "Туапсе – Сочи"],
  "С-З": ["Омск – Называевская", "Тюмень – Ялуторовск", "Екатеринбург – Шарташ", "Пермь – Кунгур"],
  "Вост": ["Иркутск – Слюдянка", "Улан-Удэ – Заиграево", "Зима – Куйтун", "Тайшет – Решоты"],
};
// закрытые за сутки: [событие, что произошло, итог: fix – устранён, win – окно закрыто, warn – снято]
const INFRA_PAST = [["Отказ СЦБ", "ложная занятость рельсовой цепи", "fix"], ["Отказ СЦБ", "сбой рельсовой цепи в мороз", "fix"], ["Отказ связи", "обрыв кабеля поездной радиосвязи", "fix"],
  ["Отказ энергоснабжения", "отключение фидера, переход на резерв", "fix"], ["Отказ энергоснабжения", "перекрытие изоляции на КС", "fix"], ["Окно (путь)", "плановый ремонт", "win"],
  ["Окно (путь)", "плановая смена стрелки", "win"], ["Окно (КС)", "плановая замена изоляторов", "win"], ["Предупр. 50 км/ч", "выправка пути", "warn"], ["Предупр. 60 км/ч", "после окна, до проверки", "warn"]];
// «Как в макете» (194:5885): закрытые события журнала – [время, событие, полигон, перегон, что произошло, итог]
const FIG_PAST = `18:05|Отказ энергоснабжения|С-З|Омск – Называевская|отключение фидера, переход на резерв|устранён 18:40 · 2 поезда до +0:12
15:50|Окно (КС)|С-З|Тюмень – Ялуторовск|плановая замена изоляторов|закрыто вовремя 17:20
13:05|Отказ связи|Окт|Чудово – Малая Вишера|обрыв кабеля поездной радиосвязи|устранён 13:40 · без задержек
12:30|Окно (путь)|С-З|Екатеринбург – Шарташ|плановый ремонт|закрыто вовремя 15:30
11:10|Предупр. 50 км/ч|Моск|Курск – Солнцево|выправка пути|снято 14:00
10:25|Отказ энергоснабжения|Ю-З|Сызрань – Октябрьск|перекрытие изоляции на КС|устранён 11:05 · 1 поезд +0:18
09:15|Отказ СЦБ|Ю-З|Лиски – Россошь|ложная занятость рельсовой цепи|устранён 09:50 · без задержек
08:40|Окно (путь)|Вост|Иркутск – Слюдянка|плановая смена стрелки|закрыто вовремя 11:40
07:20|Предупр. 60 км/ч|Окт|Бологое – Угловка|после окна, до проверки|снято 09:00
06:05|Отказ СЦБ|Вост|Улан-Удэ – Заиграево|сбой рельсовой цепи в мороз|устранён 06:45 · 1 поезд +0:09`.split("\n").map(l => l.split("|"));
// «Как в макете» (194:5721): дорога, начало и конец, поезда, влияние, что произошло – по перегону
const FIG_NOW = {
  "Луховицы – Рыбное": { road: "Московская", prog: "20:30", trains: "Т-243 (19:50), Т-245 (20:15)", approach: "Т-243 · 19:50, Т-245 · 20:15", exp: 15, phone: "+7 495 262-41-08" },
  "Тверь – Бологое": { road: "Октябрьская", trains: "Т-752(ск) до начала; 4 в окно", impact: "до +0:10", what: "плановый ремонт" },
  "Ростов – Батайск": { road: "Северо-Кавказская", from: "16:40", to: "23:00", trains: "Т-106, Т-147", impact: "+0:04", what: "дефект рельса" },
  "Тайшет – Нижнеудинск": { road: "Восточно-Сибирская", trains: "3 поезда в окно", impact: "по графику", what: "плановая замена изоляторов" },
  "Ачинск – Боготол": { road: "Красноярская", from: "14:10", to: "06:00", trains: "Т-114", impact: "+0:06", what: "просадка пути после оттепели" },
};
const dly = m => `+${Math.floor(m / 60)}:${pad(m % 60)}`;
const PH = p => `+7 ${p.pick(["495", "499", "812", "863", "383", "391"])} ${p.int(200, 899)}-${pad(p.int(10, 99))}-${pad(p.int(10, 99))}`;

function infraOf(d, ALL, nsl, stations, sample) {
  const now = toMin(d.time), key = `${d.date}|${d.time}|`, ago = t => ((now - t) % 1440 + 1440) % 1440;
  const nsBy = Object.fromEntries(nsl.map(n => [n.train, n]));
  const roadAt = (p, where) => {
    const w = where.replace(/^у ст\. /, "").split(" – ")[0].toLowerCase(), st = stations.find(s => s.poly === p && s.name.toLowerCase().startsWith(w));
    if (st) return roadOf(st);
    const m = new Map(); for (const x of ALL[p] || []) m.set(x.road, (m.get(x.road) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] || "–";
  };
  const now_ = [], journal = [], ended = [];
  let jn = 0;
  const J = (ev, t, what, res, resLvl) => journal.push({ id: `j${++jn}`, ev: ev.id, t: hm(t), ago: ago(t), kind: ev.jkind || ev.kind, dir: ev.dir, poly: ev.poly, where: ev.where, what, res, resLvl });
  for (const p of POLYS) (d.side?.[p]?.events || []).forEach((e, i) => {
    const pr = R(key + "inf" + p + e.where + i), fig = sample ? FIG_NOW[e.where] || {} : {}, h0 = e.head[0];
    const ev = { id: `${p}:${i}`, poly: p, where: e.where, road: fig.road || roadAt(p, e.where), past: false, phone: fig.phone || PH(pr) };
    const late = (ALL[p] || []).filter(x => x.delay > 5).sort((a, b) => b.delay - a.delay), any = [...(ALL[p] || [])].sort((a, b) => R(key + "on" + a.id).r() - R(key + "on" + b.id).r());
    if (e.type === "fail") {
      const F = FAIL_INFO[h0] || FAIL_INFO["Отказ СЦБ"], start = toMin(e.head[1].replace(/^с /, "")), ns = e.train && nsBy[e.train];
      const prog = fig.prog ? toMin(fig.prog) : start + Math.round(pr.int(70, 130) / 5) * 5, arrive = start + 22, exp = fig.exp || pr.int(8, 25);
      const [a, b] = any.filter(x => x.id !== e.train), ta = now + pr.int(10, 25), tb = ta + pr.int(15, 30);
      // в журнале – вид отказа («Отказ СЦБ»), а НС – в итоге
      Object.assign(ev, { kind: ns ? `НС · ${h0.toLowerCase()}` : h0, jkind: h0, lvl: ns ? "red" : "fail", dir: DIR_OF(h0), start, from: hm(start), to: `прогноз ${hm(prog)}`, prog, arrive,
        lim: ns ? "движение закрыто" : F.lim, what: F.what, crew: F.crew, nsWhy: F.ns, train: e.train, ns, exp,
        trains: fig.trains || (ns ? `${e.train} стоит; ${b?.id || a?.id || "–"} ждёт` : `${a?.id || "–"} (${hm(ta)})${b ? `, ${b.id} (${hm(tb)})` : ""}`),
        approach: fig.approach || `${a?.id || "–"} · ${hm(ta)}${b ? `, ${b.id} · ${hm(tb)}` : ""}`, next: b?.id || a?.id, nextSt: e.where.replace(/^у ст\. /, "").split(" – ")[0],
        impact: ns ? `стоит ${ns.mins} мин` : `ожидается ${dly(exp)}`, impactLvl: ns ? "red" : "amb" });
      const steps = [[start, ns ? `${F.short}; ${e.train} остановлен на перегоне` : `${F.short}; ${/^движение/.test(F.lim) ? F.lim : `движение ${F.lim}`}`], [start + 2, ns ? `переведён в НС: ${e.train} стоит на перегоне с пассажирами` : `сообщено руководителю смены и команде ${p}`, ns ? "НС" : ""],
        [start + 8, `выехала бригада ${F.crew}`], [arrive, `бригада ${F.crew} на перегоне, прогноз восстановления ${hm(prog)}`]].filter(s => ago(s[0]) <= ago(start));
      steps.forEach(([t, w, r], k) => { const last = k === steps.length - 1; J(ev, t, w, last ? (ns ? "НС" : "действует") : r || "–", last ? (ns ? "red" : "amb") : r ? "red" : "none"); });
    } else if (/^Окно/.test(h0)) {
      const [f0, t0] = e.head[1].split("–"), from = toMin(f0), dir = DIR_OF(h0), on = ago(from) < 720 && ago(from) > 0 || from === now;
      // окно уже закончилось – это не «действует», а закрытое за сутки событие
      if (on && ago(toMin(t0)) < ago(from)) { ended.push({ h0, p, where: e.where, from, to: toMin(t0), what: fig.what || pr.pick(WIN_WHAT[dir]) }); return; }
      const n = pr.int(2, 5), first = any.find(x => x.speed) || any[0];
      Object.assign(ev, { kind: h0, lvl: "amb", dir, start: from, from: f0, to: t0, lim: "по соседнему пути", what: fig.what || pr.pick(WIN_WHAT[dir]), on,
        trains: fig.trains || (on ? `${n} ${plural(n, "поезд", "поезда", "поездов")} в окно` : `${first ? first.id + (first.speed ? "(ск)" : "") + " до начала; " : ""}${n} в окно`),
        impact: fig.impact || (dir === "энергоснабжение" ? "по графику" : `до ${dly(pr.int(5, 15))}`) });
      ev.impactLvl = /^\+|до \+/.test(ev.impact) ? "amb" : "";
      if (on) J(ev, from, `${ev.what}, окно открыто`, `действует до ${t0}`, "amb");
    } else {
      const v = e.head[1], start = fig.from ? toMin(fig.from) : Math.round((now - pr.int(60, 420)) / 10) * 10;
      const to = fig.to || hm(Math.ceil((start + pr.int(6, 16) * 60) / 60) * 60);
      Object.assign(ev, { kind: `Предупр. ${v}`, lvl: "amb", dir: "путь", start, from: hm(start), to, lim: v, what: fig.what || pr.pick(WARN_WHAT),
        trains: fig.trains || (late.slice(0, 2).map(x => x.id).join(", ") || any[0]?.id || "–"), impact: fig.impact || `+0:${pad(pr.int(2, 8))}`, impactLvl: "amb" });
      J(ev, start, `${ev.what}, выдано предупреждение`, `действует до ${to}`, "amb");
    }
    ev.resp = RESP[ev.dir];
    now_.push(ev);
  });
  // сначала НС, потом отказы, потом окна и предупреждения (по полигонам с запада на восток)
  const rank = e => e.lvl === "red" ? 0 : e.lvl === "fail" ? 1 : 2;
  now_.sort((a, b) => rank(a) - rank(b));
  // закрытые за сутки
  const past = [];
  if (sample) FIG_PAST.forEach(([t, kind, poly, where, what, res], i) => past.push({ id: `past:${i}`, past: true, kind, dir: DIR_OF(kind), poly, where, what, res, start: toMin(t) }));
  else {
    const pr = R(key + "infpast"), n = pr.int(7, 11);
    let t = now - pr.int(60, 110);
    for (let i = 0; i < n && ago(t) < 1380; i++) {
      const [kind, what, kindRes] = pr.pick(INFRA_PAST), poly = pr.pick(POLYS), where = pr.pick(INFRA_WHERE[poly]), dur = kindRes === "fix" ? pr.int(30, 70) : pr.int(2, 4) * 60 + pr.pick([0, 30]);
      const k = pr.int(0, 2), res = kindRes === "fix" ? `устранён ${hm(t + dur)} · ${k ? `${k} ${plural(k, "поезд", "поезда", "поездов")} ${k > 1 ? "до " : ""}${dly(pr.int(5, 20))}` : "без задержек"}`
        : kindRes === "win" ? `закрыто вовремя ${hm(t + dur)}` : `снято ${hm(t + dur)}`;
      if (ago(t + dur) > 0 && ago(t + dur) < ago(t)) past.push({ id: `past:${i}`, past: true, kind, dir: DIR_OF(kind), poly, where, what, res, start: t, end: t + dur });
      t -= pr.int(50, 130);
    }
  }
  ended.forEach((w, i) => past.push({ id: `ended:${i}`, past: true, kind: w.h0, dir: DIR_OF(w.h0), poly: w.p, where: w.where, what: w.what, res: `закрыто вовремя ${hm(w.to)}`, start: w.from }));
  for (const e of past) { e.from = hm(e.start); J(e, e.start, e.what, e.res, "ok"); }
  // номер события за сутки – по времени начала (раньше начавшееся – меньший номер, ещё не начавшиеся окна – в конце);
  // один номер в «Действуют сейчас», журнале, карточке и состоянии полигонов
  const order = e => !e.past && /^Окно/.test(e.kind) && !e.on ? 1e4 + ((e.start - now) % 1440 + 1440) % 1440 : -ago(e.start);
  [...now_, ...past].sort((a, b) => order(a) - order(b)).forEach((e, i) => { e.no = i + 1; });
  const noOf = Object.fromEntries([...now_, ...past].map(e => [e.id, e.no]));
  journal.forEach(j => { j.no = noOf[j.ev]; });
  journal.sort((a, b) => a.ago - b.ago);
  // состояние полигонов по направлениям: худшее действующее событие
  const DIRS = ["путь", "СЦБ и связь", "энергоснабжение"];
  const state = POLYS.map(p => [p, DIRS.map(dir => {
    const e = now_.filter(x => x.poly === p && x.dir === dir).sort((a, b) => rank(a) - rank(b))[0];
    if (!e) return { txt: "норма", lvl: "ok" };
    if (e.lvl === "red") return { txt: "НС", lvl: "red", ev: e.id, no: e.no };
    if (e.lvl === "fail") return { txt: "отказ", lvl: "fail", ev: e.id, no: e.no };
    return { txt: /^Окно/.test(e.kind) ? (e.on ? `окно до ${e.to}` : `окно ${e.from}`) : e.lim, lvl: "amb", ev: e.id, no: e.no };
  })]);
  return { now: now_, past, journal, state, byId: Object.fromEntries([...now_, ...past].map(e => [e.id, e])) };
}
// погода с риском для инфраструктуры: города с морозом, снегом или гололёдом
const FIG_WX = [["Иркутск", "Вост", -26, "снег"], ["Красноярск", "Вост", -24, "снег"], ["Новосибирск", "С-З", -19, "снег"], ["Ростов-на-Дону", "Ю-З", -5, "ясно"], ["Москва", "Моск", -6, "снег"]];
const wxRisk = (t, sky) => t <= -25 ? "стрелки, излом рельса" : t <= -15 && /снег|метель/.test(sky) ? "очистка стрелок" : t <= -15 ? "излом рельса"
  : /снег|метель/.test(sky) ? "налипание на КС" : t <= 0 ? "гололёд на КС ночью" : "";
function infraWeather(cities, sample) {
  if (sample) return FIG_WX.map(([city, poly, t, sky]) => ({ city, poly, t, sky, risk: wxRisk(t, sky) }));
  const seen = new Set();
  return cities.filter(c => !seen.has(c.city) && seen.add(c.city)).map(c => ({ ...c, risk: wxRisk(c.t, c.sky) })).filter(c => c.risk).sort((a, b) => a.t - b.t).slice(0, 6);
}


// ---------- РМ «Отправление и информирование» (Figma, секция 5: 263:8786 штатный, 270:7740 НС, 279:8080 окно текста) ----------
// Отправления со станций формирования и поезда в пути с оповещением пассажиров, очередь «Ждут оповещения», 14 городов.
// Правило оповещения – допущение команды (в кейсе его нет): опоздание от +0:20 или сдвиг прогноза на 10 мин и больше.
const WEST = ["Окт", "Моск", "Ю-З"];
const EAST = ["С-З", "Вост"];
const ANN_MIN = 20;
const ANN_SHIFT = 10;
// часовой пояс по координатам станции (условно: по долготе, Поволжье южнее 54° – UTC+4)
const tzOf = (lat, lon) => lon < 22 ? 2 : lon < 45.5 ? 3 : lon < 52 ? (lat < 54 ? 4 : 3) : lon < 66 ? 5 : lon < 76 ? 6 : lon < 100 ? 7 : lon < 113 ? 8 : lon < 127 ? 9 : 10;
const POLY_TZ = { "Окт": 3, "Моск": 3, "Ю-З": 3, "С-З": 5, "Вост": 8 };
// 14 городов с запада на восток: [город, полигон, пояс, t °C в макете, погода в макете]
const INFO_CITIES = [["Калининград", "Окт", 2, -1, "облачно"], ["Мурманск", "Окт", 3, -14, "облачно"], ["Москва", "Моск", 3, -6, "снег"], ["Минск", "БЧ", 3, -4, "облачно"],
  ["Ростов-на-Дону", "Ю-З", 3, -5, "ясно"], ["Адлер", "Ю-З", 3, 0, "ясно"], ["Воркута", "С-З", 3, -19, "снег"], ["Екатеринбург", "С-З", 5, -22, "ясно"], ["Новый Уренгой", "С-З", 5, -20, "облачно"],
  ["Новосибирск", "С-З", 7, -19, "снег"], ["Красноярск", "Вост", 7, -24, "снег"], ["Иркутск", "Вост", 8, -26, "снег"], ["Благовещенск", "Вост", 9, -20, "снег"], ["Владивосток", "Вост", 10, -16, "снег"]];
const durTxt = m => { const h = Math.floor(m / 60), r = m % 60; return [h && `${h} ч`, r && `${r} мин`].filter(Boolean).join(" ") || "0 мин"; };
const trainNo = id => id.replace(/\D/g, "");
// шаблоны текста: stop – задержка на станции, arr – новое время прибытия, dep – новое время отправления, own – свой текст
const ANN_TPL = [["stop", "Задержка на станции"], ["arr", "Новое время прибытия"], ["dep", "Новое время отправления"], ["own", "Свой текст"]];
function annText(q, tpl, now) {
  const n = trainNo(q.id);
  if (tpl === "stop") return `Поезд ${n} ${q.route} задерживается на станции ${q.at}. Новое время сообщим до ${hm(now + 60)}.`;
  if (tpl === "dep") return `Поезд ${n} ${q.route} отправится со станции ${q.at} в ${q.newT}, задержка ${durTxt(q.delay)}.`;
  if (tpl === "arr") return `Поезд ${n} ${q.route} прибудет на станцию ${q.final} в ${q.progE} по местному времени, опоздание ${durTxt(q.delay)}.`;
  return "";
}
const boardLine = (q, tpl) => `${trainNo(q.id)}   ${q.route.toUpperCase()}   ${tpl === "stop" ? "ЗАДЕРЖИВАЕТСЯ · ВРЕМЯ УТОЧНЯЕТСЯ" : tpl === "dep" ? `ОТПРАВЛЕНИЕ ${q.newT}` : tpl === "arr" ? `ПРИБЫТИЕ ${q.progE} · ОПОЗДАНИЕ ${durTxt(q.delay).toUpperCase()}` : "СМ. ОБЪЯВЛЕНИЕ"}`;
// SMS кириллицей: 70 знаков в одном сообщении, в длинном – части по 67
const smsParts = len => len <= 70 ? 1 : Math.ceil(len / 67);

function infoOf(d, ALL, stations, nsl, sample) {
  const now = toMin(d.time), ann = d.ann || {}, nsIds = new Set(nsl.map(n => n.train));
  const stTz = name => { const k = String(name).split(/[- ]/)[0], s = stations.find(s => s.name === name) || stations.find(s => s.name.startsWith(k)); return s ? tzOf(s.lat, s.lon) : null; };
  const loc = (m, tz) => hm(m + (tz - 3) * 60);
  const shortOf = name => stations.find(s => s.name === name)?.short || name;
  // прибытие и оповещение: все поезда в пути
  const arr = POLYS.flatMap(p => ALL[p].map(x => {
    const P = passport(x, d, stations, sample), pr = R("info" + x.id + d.date), ns = nsIds.has(x.id), delay = Math.max(0, x.delay);
    // при НС «следующая» – станция, где поезд стоит: план отправления с неё по её поясу
    const nx = ns ? { ...P.ops[P.cur], station: x.station, from: P.ops[P.cur].to } : P.ops[P.next], last = P.ops[P.ops.length - 1], tzN = stTz(nx.station) ?? POLY_TZ[p], tzE = stTz(last.station) ?? POLY_TZ[p], key = "a:" + x.id, a = ann[key];
    // уже объявленное до начала работы окна (условно, по номеру поезда): чаще всего то же опоздание, иногда меньше – тогда прогноз сдвинулся
    const pre = !a && delay >= ANN_MIN && pr.r() < 0.6 ? { at: hm(now - pr.int(5, 40)), delay: pr.r() < 0.3 ? Math.max(ANN_MIN, delay - pr.int(ANN_SHIFT, 25)) : delay } : null, A = a || pre;
    let k;
    if (ns) k = a?.ns ? "ok" : "ns";
    else if (delay < ANN_MIN) k = A ? "ok" : delay > 5 ? "small" : "ontime";
    else k = !A ? "wait" : delay - A.delay >= ANN_SHIFT ? "shift" : "ok";
    const ch = ns ? ["табло", "приложение", "SMS", "голос"] : delay >= 60 ? ["табло", "приложение", "SMS"] : ["табло", "приложение"];
    return { key, kind: ns ? "ns" : "arr", id: x.id, x, poly: p, route: x.route, delay, ns, pax: x.pax, kids: x.kids, ctl: x.ctl,
      at: x.station, next: nx.station, planN: loc(nx.from, tzN), progN: ns ? null : loc(nx.fFrom, tzN), tzN, inN: nx.fFrom - now,
      final: last.station, progE: loc(last.fFrom, tzE), tzE, k, ann: A, ch, st: [...new Set([ns && shortOf(x.station), shortOf(nx.station), shortOf(last.station)].filter(Boolean))] };
  }));
  arr.sort((a, b) => b.ns - a.ns || b.delay - a.delay || a.id.localeCompare(b.id));
  // отправления со станций формирования
  const pb = Object.fromEntries(POLYS.map(p => [p, polyBlocks(d, p, ALL[p], nsIds, sample)]));
  const dep = POLYS.flatMap(p => pb[p].dep.map(y => {
    const pr = R("idep" + y.id + y.station + d.date), key = "d:" + y.id + ":" + y.station, a = ann[key], tz = stTz(y.station) ?? POLY_TZ[p], t = toMin(y.t);
    const pre = !a && y.late && pr.r() < 0.4 ? { at: hm(t - pr.int(10, 30)), delay: y.late } : null, A = a || pre;
    const k = y.late ? (A ? "ok" : y.status === "ушёл" ? "late" : "wait") : y.status === "посадка" ? "board" : y.status === "по графику" ? "auto" : "none";
    return { key, kind: "dep", id: y.id, poly: p, route: y.route, at: y.station, st: [shortOf(y.station)], delay: y.late, status: y.status, rel: y.rel,
      plan: loc(t, tz), newT: loc(t + y.late, tz), tz, pax: pr.int(280, 1100), track: pr.int(1, 9), k, ann: A, ch: ["табло", "приложение"],
      boardAt: loc(t - 20, tz) };
  }));
  dep.sort((a, b) => a.rel - b.rel);
  // очередь: НС, сдвиг прогноза, новое опоздание, задержка отправления
  const ord = { ns: 0, shift: 1, wait: 2 };
  const queue = [...arr.filter(q => q.k in ord), ...dep.filter(q => q.k === "wait")].sort((a, b) => (ord[a.k] ?? 3) - (ord[b.k] ?? 3) || b.delay - a.delay);
  // 14 городов: местное время, погода, сколько поездов в пути едет в город (конечная) и сколько из них опаздывает
  const pc = R("icity" + d.date + d.time);
  const cities = INFO_CITIES.map(([city, poly, tz, t0, sky0]) => {
    const key = city.split("-")[0], hit = q => q.final.startsWith(key);
    const list = arr.filter(hit);
    return { city, poly, tz, local: hm(now + (tz - 3) * 60), t: sample ? t0 : t0 + pc.int(-4, 4), sky: sample ? sky0 : pc.pick(["ясно", "облачно", "снег", "пасмурно"]),
      n: list.length, late: list.filter(q => q.delay > 5).length };
  });
  return { arr, dep, queue, cities, plan: Object.fromEntries(POLYS.map(p => [p, { plan: pb[p].plan, sent: pb[p].sent }])) };
}

Object.assign(__M, { hm, toMin, fmtDelay, nf, v1, ON_TIME, RED_MIN, lvl, EXTRA_ST, makeStOf, roadOf, CAR_FULL, CAR_SHORT, allTrains, nsPax, carOfNs, toShiftTrain, WORKS, passport, polyBlocks, WORK_NORM, crewOf, crewReserve, paxTotals, infraOf, wxRisk, infraWeather, WEST, EAST, ANN_MIN, ANN_SHIFT, tzOf, INFO_CITIES, ANN_TPL, annText, boardLine, smsParts, infoOf });
})();

// ---- rm.js ----
(function () {
// РМ «Мониторинг поездов» полигона: таблица всех поездов в пути, показатели полигона, паспорт поезда.
// Смена общая с окном ТКП (js/shift.js): всё, что меняется здесь, видно на табло, и наоборот.
const { SAMPLE, generate, plural, POLYS, POLY_FULL } = __M;
const { nsList } = __M;
const { loadGeo, placeStation } = __M;
const { publishShift, readShift, onShift, onTheme } = __M;
const { allTrains, carOfNs, passport, polyBlocks, makeStOf, toShiftTrain, fmtDelay, nf, v1, lvl, hm, toMin, WORKS, CAR_FULL, CAR_SHORT, crewOf, crewReserve, nsPax, paxTotals, infraOf, infraWeather, infoOf, WEST, EAST, ANN_MIN, ANN_SHIFT, ANN_TPL, annText, boardLine, smsParts } = __M;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const params = new URLSearchParams(location.search);
const HOME = POLYS.includes(params.get("poly")) ? params.get("poly") : "Ю-З";
// роль рабочего места: «Мониторинг поездов» (по умолчанию) или «Бригады» (?role=crews). Смена у обеих общая
// и «Руководитель смены» (?role=lead): вся сеть, без таблицы поездов
// и «Инфраструктура» (?role=infra): вся сеть, события, журнал за сутки
// и «Отправление и информирование» (?role=info): отправления, прибытие и оповещение пассажиров
const ROLE = ["crews", "lead", "infra", "info"].includes(params.get("role")) ? params.get("role") : "trains", CREWS = ROLE === "crews", LEAD = ROLE === "lead", INFRA = ROLE === "infra", INFO = ROLE === "info";
const MODES = ["norm", "ns", "multi"], MODE_TXT = { norm: "НС: нет", ns: "НС: одна", multi: "НС: несколько" };
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// S – общая смена (как в ТКП); ui – своё состояние окна
let S = { source: "sample", seed: 0, heavy: false, mode: "norm", data: null, added: [] };
// фильтры колонок: null – все значения, Set – только отмеченные
const F0 = () => INFO ? { poly: new Set(["Окт", "Моск", "Ю-З"]) } : INFRA ? { poly: null, kind: null, dir: null } : LEAD ? { poly: null, cat: null, road: null, delay: null, marks: null } : CREWS ? { poly: new Set([HOME]), delay: null, depot: null, cst: null } : { poly: new Set([HOME]), cat: null, road: null, delay: null, marks: null };
// отправления: сортировка по колонке и свои фильтры (ключи меню – с приставкой «d:»)
const DS0 = () => ({ k: "t", dir: 1 });
const ui = { f: F0(), df: { station: null, route: null, late: null, status: null }, ds: DS0(), fOpen: null, sort: CREWS ? "left" : INFRA ? "t" : "delay", dir: CREWS || INFRA ? (INFRA ? -1 : 1) : -1, q: "", sel: null, tab: "gen", op: null,
  // «Отправление и информирование»: запад/восток у каждой таблицы, поиск, сортировка, снятые галочки очереди, окно текста
  side: { d: "west", a: "west" }, iq: { d: "", a: "" }, isort: { d: { k: "rel", dir: 1 }, a: { k: "delay", dir: -1 } }, qOff: new Set(), edit: null, ed: null };
// полигоны, за которые сейчас отвечает оператор: выбранные в фильтре «Полигон» (без фильтра – все).
// По ним строка НС сверху, «Опоздания», инфраструктура, отправления и города
const scope = () => ui.f.poly ? POLYS.filter(p => ui.f.poly.has(p)) : POLYS;
const scopeLabel = () => { const s = scope(); return s.length === POLYS.length ? "все полигоны" : s.join(", ") || "полигон не выбран"; };
let lastScope = "";
let stations = [], stOf = null, ALL = null, nsl = [], nsIds = new Set(), view = [], INF = null, IFO = null;
const wrap = $("#wrap"), rm = $("#rm"), tb = $("#tb"), tbl = $("#tbl"), fmenu = $("#fmenu");

// блоки справа по полигонам оператора: один полигон – как в макете, несколько – суммы и общие списки
function blocks() {
  const now = toMin(S.data.time), parts = scope().map(p => ({ p, b: polyBlocks(S.data, p, ALL[p], nsIds, isSample()) }));
  if (parts.length === 1) return { ...parts[0].b, infra: parts[0].b.infra.map(e => ({ ...e, poly: parts[0].p })) };
  // вся сеть: контроль и дети – как на ТКП (сводка смены), остальное – суммы полигонов (они сходятся со сводкой)
  const all = parts.length === POLYS.length ? S.data.summary : null;
  const sum = k => parts.reduce((a, x) => a + x.b[k], 0), plan = Math.max(1, sum("plan")), sent = sum("sent");
  const near = t => Math.abs((toMin(t) - now + 720 + 1440) % 1440 - 720);
  return { plan, sent, pct: Math.round(sent / plan * 100), delayedDep: sum("delayedDep"), ctl: sum("ctl"),
    ...(all ? { ctl: all.control[0] + all.control[1], ctlSplit: all.control } : {}),
    ctlSplit: all ? all.control : [0, 1].map(i => parts.reduce((a, x) => a + x.b.ctlSplit[i], 0)),
    kids: all ? all.kids[0] : sum("kids"), kidsN: all ? all.kids[1] : sum("kidsN"), groups: all ? all.kids[2] : sum("groups"),
    transit: sum("transit"), delta: parts[0]?.b.delta || "", intl: sum("intl"), foreign: sum("foreign"),
    infra: parts.flatMap(x => x.b.infra.map(e => ({ ...e, poly: x.p }))).sort((a, b) => ({ red: 0, fail: 1, amb: 2 })[a.lvl] - ({ red: 0, fail: 1, amb: 2 })[b.lvl]),
    dep: parts.flatMap(x => x.b.dep).sort((a, b) => a.rel - b.rel),
    cities: parts.flatMap(x => x.b.cities.slice(0, Math.ceil(6 / parts.length))).slice(0, 6) };
}
function renderScope() { ui.df = { station: null, route: null, late: null, status: null }; renderAlarm(); renderRight(renderLate()); renderStat(); }

// ---------- значки (как в макете: маркер/a, r, n, o, g, q) ----------
const mk = {
  a: s => `<svg class="mk" width="${s}" height="${s}" viewBox="0 0 60 60" aria-hidden="true"><path class="b-a" d="M30 8L55.98 53H4.02Z"/><rect class="g-a" x="27" y="23" width="6" height="15" rx="3"/><circle class="g-a" cx="30" cy="45" r="3"/></svg>`,
  g: s => `<svg class="mk" width="${s}" height="${s}" viewBox="0 0 60 60" aria-hidden="true"><rect class="b-g" width="60" height="60" rx="30"/><path class="g-g" d="M16.2 31.2L26.4 40.8L44.4 20.4" fill="none" stroke-width="6.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  o: s => `<svg class="mk" width="${s}" height="${s}" viewBox="0 0 60 60" aria-hidden="true"><path class="b-o" d="M30 6L54 30L30 54L6 30Z"/></svg>`,
  n: s => `<svg class="mk mk-n" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.9"/></svg>`,
  r: s => `<span class="mk mk-r" style="width:${s}px;height:${s}px;border-radius:${s * 0.14}px;font-size:${s * 0.78}px" aria-hidden="true">!</span>`,
  q: s => `<span class="mk mk-r mk-q" style="width:${s}px;height:${s}px;border-radius:${s * 0.14}px;font-size:${s * 0.78}px" aria-hidden="true">!</span>`,
};
const lvMk = (l, s) => l === "red" ? mk.r(s) : l === "amb" ? mk.a(s) : mk.n(s);
const lvCls = l => l === "red" ? "red" : l === "amb" ? "amb" : "sec";
const isSample = () => S.source === "sample";

// ---------- данные ----------
function recompute() {
  nsl = nsList(S.data, S.mode);
  nsIds = new Set(nsl.map(n => n.train));
  ALL = allTrains(S.data, stOf, stations, isSample());
  if (CREWS) for (const p of POLYS) for (const x of ALL[p]) x.crew = crewOf(x, S.data, isSample());
  if (INFRA) INF = infraOf(S.data, ALL, nsl, stations, isSample());
  if (INFO) IFO = infoOf(S.data, ALL, stations, nsl, isSample());
}
const findTrain = id => { for (const p of POLYS) { const x = ALL[p].find(t => t.id === id); if (x) return x; } return null; };
const marks = x => {
  const m = [];
  if (nsIds.has(x.id)) m.push(`<b class="red">НС</b>`);
  if (x.stale) m.push(`<span class="amb">данные ${esc(x.upd)}</span>`);
  if (x.ctl) m.push(`<span class="sec">на контроле</span>`);
  if (x.kids) m.push(`<span class="sec">дети</span>`);
  if (x.stop) m.push(`<span class="sec">${x.stop}</span>`);
  return m.join('<span class="mut"> · </span>');
};
const norm = s => String(s).toLowerCase().replace(/ё/g, "е");
const SORTS = INFRA ? [["t", "Время", -1]] : CREWS ? [["left", "До конца работы", 1], ["chg", "Смена бригады", 1], ["depot", "Депо", 1], ["id", "Номер", 1]]
  : [["delay", "Опоздание", -1], ["pax", "Пассажиры", -1], ["upd", "Обновление", 1], ["id", "Номер", 1]];
// длительность «1:30»
const dur = m => `${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, "0")}`;
const num = id => +id.replace(/\D/g, "");
// фильтры в заголовках: в макете – «Категория», «Дорога», «Полигон», «Отметки»; «Опоздание» добавлено
const delayGroup = x => nsIds.has(x.id) ? "НС" : x.delay > 240 ? "более 4 ч" : x.delay >= 60 ? "1–4 ч" : x.delay > 5 ? "до 1 ч" : x.delay >= 0 ? "по графику" : "раньше графика";
const markList = x => { const m = [nsIds.has(x.id) && "НС", x.stale && "данные устарели", x.ctl && "на контроле", x.kids && "дети", x.stop].filter(Boolean); return m.length ? m : ["без отметок"]; };
const TFILTERS = {
  cat: { title: "Категория", val: x => [x.cat], order: ["Скоростной", "Фирменный", "Скорый", "Пассажирский"] },
  road: { title: "Дорога", val: x => [x.road] },
  poly: { title: "Полигон", val: x => [x.poly], order: POLYS },
  delay: { title: "Опоздание", val: x => [delayGroup(x)], order: ["НС", "более 4 ч", "1–4 ч", "до 1 ч", "по графику", "раньше графика"] },
  marks: { title: "Отметки", val: x => markList(x), order: ["НС", "данные устарели", "на контроле", "дети", "стоянка", "прибыл", "без отметок"] },
};
// РМ «Бригады» (191:4347): фильтры «Опоздание», «Депо», «Статус»; «Полигон» – ярлыком над таблицей (колонки нет)
const CFILTERS = {
  poly: TFILTERS.poly, delay: TFILTERS.delay,
  depot: { title: "Депо", val: x => [x.crew.depot] },
  cst: { title: "Статус", val: x => [x.crew.status], order: ["превышение", "близко к концу", "стоянка", "прибыл", "в норме"] },
};
// РМ «Инфраструктура», журнал за сутки (194:5885): фильтры «Событие», «Направление», «Полигон»
const IFILTERS = {
  kind: { title: "Событие", val: x => [x.kind] },
  dir: { title: "Направление", val: x => [x.dir], order: ["путь", "СЦБ и связь", "энергоснабжение"] },
  poly: TFILTERS.poly,
};
const FILTERS = INFRA ? IFILTERS : CREWS ? CFILTERS : TFILTERS;
// [заголовок, фильтр, класс, сортировка по щелчку на заголовке, направление по умолчанию]
const COLS = INFRA ? [["Время", null, "", "t", -1], ["№", null, "", "no", 1], ["Событие", "kind", "", "kind", 1], ["Направление", "dir", "", "dir", 1], ["Полигон", "poly", "", "poly", 1],
  ["Перегон", null, "", "where", 1], ["Что произошло"], ["Итог", null, "", "res", 1]]
  : CREWS ? [["Поезд", null, "", "id", 1], ["Опоздание", "delay", "", "delay", -1], ["Где сейчас", null, "", "station", 1], ["Машинист", null, "", "driver", 1],
  ["Помощник", null, "", "assist", 1], ["Депо", "depot", "", "depot", 1], ["На смене", null, "", "worked", -1], ["Смена бригады", null, "", "chg", 1],
  ["Телефон машиниста"], ["Статус", "cst", "", "left", 1]]
  : [["Поезд", null, "", "id", 1], ["Категория", "cat", "", "cat", 1], ["Маршрут", null, "", "route", 1], ["Дорога", "road", "", "road", 1], ["Полигон", "poly", "", "poly", 1],
  ["Станция", null, "", "station", 1], ["Скорость, км/ч", null, "r", "v", -1], ["Опоздание", "delay", "", "delay", -1], ["Обновлено", null, "", "upd", 1],
  ["Ваг.", null, "r", "cars", -1], ["Пасс.", null, "r", "pax", -1], ["Отметки", "marks"]];
const WIDTHS = INFRA ? [122, 76, 309, 228, 131, 361, 841, 563] : CREWS ? [140, 150, 260, 300, 280, 240, 230, 400, 290, 326] : [162, 170, 524, 283, 140, 339, 156, 180, 150, 70, 100, 366];
const passF = (x, k) => !ui.f[k] || FILTERS[k].val(x).some(v => ui.f[k].has(v));
const rowsAll = () => INFRA ? INF.journal : POLYS.flatMap(p => ALL[p]);
function baseList() {
  let list = rowsAll();
  if (ui.q.trim()) {
    const q = norm(ui.q.trim()).replace(/^т-?(?=\d)/, "т-");
    const hay = INFRA ? x => [x.kind, x.where, x.what, x.poly, x.dir, x.res] : CREWS ? x => [x.id, x.station, x.crew.driver, x.crew.assist, x.crew.depot] : x => [x.id, x.station, x.route];
    // «№7» – ровно событие 7
    const no = INFRA && q.match(/^№\s*(\d+)$/)?.[1];
    list = list.filter(x => no ? x.no === +no : hay(x).some(v => norm(v).includes(q)));
  }
  return list;
}
// значения колонки и сколько строк даст каждое – с учётом остальных фильтров и поиска
function facet(k) {
  const list = baseList().filter(x => Object.keys(FILTERS).every(j => j === k || passF(x, j))), cnt = new Map();
  for (const x of rowsAll()) for (const v of FILTERS[k].val(x)) if (!cnt.has(v)) cnt.set(v, 0);
  for (const x of list) for (const v of FILTERS[k].val(x)) cnt.set(v, cnt.get(v) + 1);
  const ord = FILTERS[k].order;
  return [...cnt].sort((a, b) => ord ? (ord.indexOf(a[0]) + 1 || 99) - (ord.indexOf(b[0]) + 1 || 99) : a[0].localeCompare(b[0], "ru"));
}
// подпись ярлыка: «Скорый, Фирменный», при почти полном выборе – «кроме по графику»
const fLabel = k => { const s = [...ui.f[k]], rest = facet(k).map(v => v[0]).filter(v => !ui.f[k].has(v));
  if (s.length > rest.length && rest.length <= 2) return "кроме " + rest.join(", ");
  return s.length ? s.length > 2 ? `${s.slice(0, 2).join(", ")} и ещё ${s.length - 2}` : s.join(", ") : "ничего"; };
function listView() {
  let list = baseList().filter(x => Object.keys(FILTERS).every(k => passF(x, k)));
  const key = { delay: x => (nsIds.has(x.id) ? 1e6 : 0) + x.delay, pax: x => x.pax, upd: x => (toMin(x.upd) - toMin(S.data.time) + 720 + 1440) % 1440, id: x => num(x.id),
    // бригады: сверху НС, затем превышение и меньше всего запаса до конца работы
    left: x => (nsIds.has(x.id) ? -1e6 : 0) + Math.min(x.crew.end - x.crew.exp, x.crew.left), chg: x => x.crew.exp, depot: x => x.crew.depot,
    // сортировка по щелчку на заголовке колонки
    cat: x => x.cat, route: x => x.route, road: x => x.road, poly: x => POLYS.indexOf(x.poly), station: x => x.station, v: x => x.v, cars: x => x.cars,
    driver: x => x.crew.driver, assist: x => x.crew.assist, worked: x => x.crew.worked,
    t: x => -x.ago, no: x => x.no, kind: x => x.kind, dir: x => x.dir, where: x => x.where, res: x => x.res }[ui.sort];
  const cmp = (a, b) => { const p = key(a), q = key(b); return typeof p === "string" ? p.localeCompare(q, "ru") : p - q; };
  return list.sort((a, b) => cmp(a, b) * ui.dir || a.rank - b.rank || num(a.id) - num(b.id));
}

// ---------- отрисовка ----------
function renderAlarm() {
  const el = $("#alarm"), sc = INFO ? POLYS : scope(), mine = nsl.filter(n => sc.includes(findTrain(n.train)?.poly)), other = nsl.filter(n => !mine.includes(n));
  const otherTxt = other.length ? `<span class="other${mine.length ? " o" : ""}">НС в других полигонах: ${other.map(n => `${esc(n.train)} (${findTrain(n.train)?.poly || "?"})`).join(", ")}</span>` : "";
  el.classList.toggle("ns", mine.length > 0);
  if (!mine.length) { el.innerHTML = `${mk.g(44)}<p class="ok">Нештатных ситуаций нет</p>${otherTxt}`; return; }
  const n = mine[0], x = findTrain(n.train);
  el.innerHTML = `${mk.r(52)}<p class="t">НС · ${esc(n.train)} · ${esc(x?.station || "")} <span>· ${esc(n.kind)} · с ${esc(n.since)}${mine.length > 1 ? ` · ещё ${mine.length - 1}: ${mine.slice(1).map(m => esc(m.train)).join(", ")}` : ""}</span></p>${otherTxt}<p class="m">${n.mins} мин</p>`;
}
function renderTime() {
  const d = S.data;
  $("#time").innerHTML = `<p class="tm">${esc(d.time)}</p><div class="dt"><p>${esc(d.date)}</p><p>${esc(d.shift)}</p></div>
    <div class="fr"><p>${mk.g(24)}Обновлено ${esc(d.updated)}</p>${d.stale ? `<p class="org">${mk.o(22)}${esc(d.stale.train)}: данные ${esc(d.stale.time)}</p>` : ""}</div>`;
}
const crewSt = k => k.over > 0 ? `<span class="c">${mk.a(24)}<b class="amb">превышение ≈ ${dur(k.over)}</b></span>`
  : k.left < 60 ? `<span class="c">${mk.a(24)}<b class="amb">до конца работы ${dur(k.left)}</b></span>`
  : `<span class="c">${mk.n(24)}<span class="sec">${esc(k.status)}</span></span>`;
function crewRow(x) {
  const l = lvl(x, nsIds.has(x.id)), k = x.crew;
  return `<tr data-id="${esc(x.id)}" class="${x.id === ui.sel ? "sel" : ""}" aria-selected="${x.id === ui.sel}">
    <td><b>${esc(x.id)}</b></td><td><span class="c">${lvMk(l, 24)}<span class="${lvCls(l)}">${fmtDelay(x.delay)}</span></span></td><td>${esc(x.station)}</td>
    <td>${esc(k.driver)}</td><td class="sec">${esc(k.assist)}</td><td>${esc(k.depot)}</td><td class="sec num">с ${hm(k.start)} · ${dur(k.worked)}</td>
    <td class="num">${esc(k.station)} · ${hm(k.exp)}${k.late > 5 ? ` <small class="pl">план ${hm(k.plan)}</small>` : ""}</td><td class="sec num">${k.phone}</td><td>${crewSt(k)}</td></tr>`;
}
function rowHtml(x) {
  if (CREWS) return crewRow(x);
  if (INFRA) return journalRow(x);
  const l = lvl(x, nsIds.has(x.id));
  return `<tr data-id="${esc(x.id)}" class="${x.id === ui.sel ? "sel" : ""}" aria-selected="${x.id === ui.sel}">
    <td><b>${esc(x.id)}</b></td><td>${esc(x.cat)}</td><td>${esc(x.route)}</td><td>${esc(x.road)}</td><td>${esc(x.poly)}</td><td>${esc(x.station)}</td>
    <td class="r">${v1(x.v)}</td><td><span class="c">${lvMk(l, 24)}<span class="${lvCls(l)}">${fmtDelay(x.delay)}</span></span></td>
    <td>${x.stale ? `<span class="c">${mk.o(20)}<span>${esc(x.upd)}</span></span>` : `<span class="sec">${esc(x.upd)}</span>`}</td>
    <td class="r">${x.cars}</td><td class="r">${nf(x.pax)}</td><td>${marks(x)}</td></tr>`;
}
function renderList() {
  if (LEAD || INFO) return;
  view = listView();
  $("#list-poly").textContent = scopeLabel();
  const funnel = `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
  // заголовок: название сортирует (повторно – обратный порядок), воронка рядом открывает фильтр
  $("#th").innerHTML = `<tr>${COLS.map(([t, k, cls, sk]) => {
    const on = sk && ui.sort === sk, name = sk ? `<button type="button" class="sortb${on ? " on" : ""}" data-csort="${sk}" aria-label="Сортировать по колонке «${t}»${on ? (ui.dir < 0 ? ", сейчас по убыванию" : ", сейчас по возрастанию") : ""}">${t}${on ? (ui.dir < 0 ? " ↓" : " ↑") : ""}</button>` : t;
    const fb = k ? `<button type="button" class="thf thf-i${ui.f[k] ? " on" : ""}${ui.fOpen === k ? " open" : ""}" data-f="${k}" aria-haspopup="dialog" aria-expanded="${ui.fOpen === k}" aria-label="${t}: фильтр${ui.f[k] ? " (включён)" : ""}">${funnel}</button>` : "";
    return `<th${cls ? ` class="${cls}"` : ""}${on ? ` aria-sort="${ui.dir < 0 ? "descending" : "ascending"}"` : ""}>${fb || sk ? `<span class="ths">${name}${fb}</span>` : t}</th>`; }).join("")}</tr>`;
  $("#chips").innerHTML = Object.keys(FILTERS).filter(k => ui.f[k]).map(k => `<span class="fchip"><button type="button" class="fl" data-f="${k}" title="${FILTERS[k].title}: ${esc([...ui.f[k]].join(", "))}">${FILTERS[k].title}: ${esc(fLabel(k))}</button><button type="button" data-clear="${k}" aria-label="Снять фильтр «${FILTERS[k].title}»">×</button></span>`).join("");
  // два фильтра и больше: подпись «Сортировка:» убирается, поиск уже – место ярлыкам
  $(".lh").classList.toggle("many", Object.values(ui.f).filter(Boolean).length > 1);
  if (ui.fOpen && !isDep(ui.fOpen)) renderMenu(); else if (!ui.fOpen) fmenu.hidden = true;
  // сменились полигоны оператора – перерисовать НС сверху и блоки справа
  const sk = scope().join();
  if (sk !== lastScope) { lastScope = sk; renderScope(); }
  $("#sort").innerHTML = SORTS.map(([k, t]) => `<button type="button" data-sort="${k}" aria-pressed="${ui.sort === k}">${t} ${ui.sort === k ? (ui.dir < 0 ? "↓" : "↑") : ""}</button>`).join("");
  tb.innerHTML = view.length ? view.map(rowHtml).join("") : `<tr><td colspan="${COLS.length}" class="empty">Ничего не найдено. Измените поиск или нажмите «Сбросить».</td></tr>`;
  rowsInfo();
  if (window.__rm) window.__rm.view = view.length;
}
function rowsInfo() {
  const a = Math.min(view.length, Math.floor(tbl.scrollTop / 45) + 1), b = Math.min(view.length, a + 25);
  $("#rows-info").textContent = view.length ? `строки ${a}–${b} из ${view.length}` : "0 строк";
}
tbl.addEventListener("scroll", rowsInfo);

function renderLate() {
  if (CREWS) return renderWho();
  const sc = scope(), lbl = scopeLabel(), list = sc.flatMap(p => ALL[p]), late = list.filter(x => x.delay > 5), reg = late.filter(x => !x.speed), sp = late.filter(x => x.speed);
  const red = x => x.delay > 240 || nsIds.has(x.id);
  const c = [[reg.filter(x => x.delay < 60 && !red(x)).length, sp.filter(x => x.delay <= 30 && !red(x)).length, "до 1 ч / до 30 мин", "a"],
             [reg.filter(x => x.delay >= 60 && !red(x)).length, sp.filter(x => x.delay > 30 && !red(x)).length, "1–4 ч / более 30 мин", "a"],
             [reg.filter(red).length, null, "более 4 ч", "r"]];
  const b = blocks();
  const v = (n, cls) => `<span class="${n ? cls : "mut"}">${n ?? "–"}</span>`;
  $("#late").innerHTML = `<div>
    <div class="k h"><h2>Опоздания · ${lbl}</h2><span>обычн. / скоростн.</span></div>
    ${c.map(([r, s, t, m]) => `<div class="k">${m === "r" ? mk.r(24) : mk.a(24)}<span>${t}</span><span class="v">${v(r, m === "r" ? "red" : "amb")} / ${s == null ? '<span class="' + (r ? "red" : "mut") + '">–</span>' : v(s, "amb")}</span></div>`).join("")}
  </div><div>
    <div class="s"><span>Отправлено</span><b>${b.sent} из ${b.plan} · ${b.pct} %</b></div>
    <div class="s"><span class="c">${b.delayedDep ? mk.a(24) + " " : ""}Задержано отправление</span><b class="${b.delayedDep ? "amb" : ""}">${b.delayedDep}</b></div>
    <div class="s"><span>На контроле<small>постоянный ${b.ctlSplit[0]} · оперативный ${b.ctlSplit[1]}</small></span><b>${b.ctl}</b></div>
    <div class="s"><span>Поездов с детьми<small>детей ${nf(b.kidsN)} · групп ${b.groups}</small></span><b>${b.kids}</b></div>
    <div class="s"><span>В пути · ${esc(b.delta)} к вчера<small>межгос. ${b.intl} · зарубежного формирования ${b.foreign}</small></span><b>${b.transit}</b></div>
  </div>`;
  return b;
}
let depKey = "", depTop = 0;
// блок «Отправления»: сортировка по колонкам, фильтры, листается (общий для ролей)
function depHtml(b) {
  const dv = depView(b.dep), dFiltered = Object.values(ui.df).some(Boolean);
  return `<section class="p rm-blk rm-dep" aria-label="Отправления полигона">
    <div class="bh"><h2>Отправления · ${scopeLabel()}</h2><span class="sec">со станций формирования ${scope().length > 1 ? "полигонов" : "полигона"} · задержано ${b.delayedDep}${dv.length < b.dep.length ? ` · показано ${dv.length} из ${b.dep.length}` : ""}</span>${dFiltered ? '<button type="button" class="link" data-dreset>Сбросить</button>' : ""}</div>
    <div class="dep-scroll" id="dep-scroll" tabindex="0" aria-label="Список отправлений, листается"><table><colgroup><col style="width:130px"><col style="width:375px"><col style="width:330px"><col style="width:120px"><col style="width:170px"><col></colgroup>
    <thead id="dep-th"><tr>${DCOLS.map(([t, k, f]) => `<th><span class="ths"><button type="button" class="sortb${ui.ds.k === k ? " on" : ""}" data-ds="${k}" aria-label="Сортировать по колонке «${t}»">${t}${ui.ds.k === k ? (ui.ds.dir < 0 ? " ↓" : " ↑") : ""}</button>${f ? `<button type="button" class="thf thf-i${ui.df[f] ? " on" : ""}${ui.fOpen === "d:" + f ? " open" : ""}" data-df="${f}" aria-haspopup="dialog" aria-expanded="${ui.fOpen === "d:" + f}" aria-label="${t}: фильтр${ui.df[f] ? " (включён)" : ""}">${FUNNEL}</button>` : ""}</span></th>`).join("")}</tr></thead><tbody>
    ${dv.length ? "" : `<tr><td colspan="6" class="empty">Нет отправлений под эти фильтры.</td></tr>`}
    ${dv.map(x => `<tr><td><b>${esc(x.id)}</b></td><td>${esc(x.route)}</td><td>${esc(x.station)}</td><td>${esc(x.t)}</td>
      <td class="${x.late ? "amb" : "sec"}"${x.late ? ' style="font-weight:600"' : ""}>${fmtDelay(x.late)}</td><td class="sec">${x.status}</td></tr>`).join("")}</tbody></table></div>
  </section>`;
}
// прокрутка отправлений: при новой смене или фильтре – к ближайшим, иначе – где была
function depAfter(dv) {
  const box = $("#dep-scroll"), key = `${S.source}|${S.seed}|${S.data.date}|${S.data.time}|${scopeLabel()}|${ui.ds.k}${ui.ds.dir}|${Object.values(ui.df).map(v => v ? [...v].join() : "").join("|")}`;
  if (box) {
    if (key !== depKey) {
      // по времени: три ушедших сверху, дальше – ближайшие; при другой сортировке – с начала
      const k = ui.ds.k === "t" && ui.ds.dir > 0 ? Math.max(0, dv.findIndex(x => x.status !== "ушёл") - 3) : 0, row = box.querySelectorAll("tbody tr")[k];
      depTop = row ? row.offsetTop - box.querySelector("thead").offsetHeight : 0; depKey = key;
    }
    box.scrollTop = depTop;
  }
}
function renderRight(b) {
  if (CREWS) return renderCrewRight();
  if (LEAD) return renderLeadRight(b);
  if (INFRA) return renderInfraRight();
  if (INFO) return renderInfoRight();
  const right = $("#right"), old = $("#dep-scroll");
  if (old) depTop = old.scrollTop;
  if (ui.sel && findTrain(ui.sel)) { right.innerHTML = passHtml(findTrain(ui.sel)); return; }
  const fail = b.infra.some(e => e.lvl !== "amb" || /^Окно/.test(e.kind));
  lastB = b;
  const dv = depView(b.dep), dFiltered = Object.values(ui.df).some(Boolean);
  right.innerHTML = `
  <section class="p rm-blk rm-infra" aria-label="Инфраструктура полигона">
    <div class="bh"><h2>Инфраструктура · ${scopeLabel()}</h2><span class="sec">окна, предупреждения, отказы</span></div>
    ${b.infra.length ? `<table><colgroup><col style="width:440px"><col style="width:380px"><col style="width:220px"><col></colgroup>
      <thead><tr><th>Событие</th><th>Перегон</th><th>Действует</th><th>Поезда на участке</th></tr></thead><tbody>
      ${b.infra.slice(0, 2).map(e => `<tr><td><span class="c">${e.lvl === "red" ? mk.r(22) : e.lvl === "fail" ? mk.q(22) : mk.a(22)}<span class="${e.lvl === "red" ? "red" : "amb"}" style="font-weight:500">${e.lvl === "red" ? "НС · " : ""}${scope().length > 1 ? esc(e.poly) + " · " : ""}${esc(e.kind)}</span></span></td>
        <td>${esc(e.where)}</td><td class="sec">${esc(e.until)}</td><td>${esc(e.trains)}</td></tr>`).join("")}</tbody></table>` : ""}
    ${!fail ? `<p class="foot-ok">${mk.g(22)}${b.infra.length ? "Окон и отказов нет" : "Окон, предупреждений и отказов нет"}</p>` : ""}
  </section>
  ${depHtml(b)}
  <section class="p rm-blk rm-city" aria-label="Города полигона">
    <div class="bh"><h2>Города · ${scopeLabel()}</h2><span class="sec">местное время и погода</span></div>
    <table><colgroup><col style="width:400px"><col style="width:180px"><col style="width:200px"><col style="width:300px"><col></colgroup>
    <thead><tr><th>Город</th><th>Пояс</th><th>Местное</th><th>Погода</th><th class="r">t, °C</th></tr></thead><tbody>
    ${b.cities.map(c => `<tr><td>${esc(c.city)}</td><td class="sec">UTC+${c.tz}</td><td>${c.local}</td><td class="sec">${esc(c.sky)}</td><td class="r">${c.t < 0 ? "−" + -c.t : c.t}</td></tr>`).join("")}</tbody></table>
  </section>`;
  depAfter(dv);
}

// ---------- РМ «Бригады»: кто на линии, карточка бригады, смены в ближайший час ----------
function crewStats() {
  const now = toMin(S.data.time), list = scope().flatMap(p => ALL[p]);
  return { list, now, hour: list.filter(x => x.crew.exp >= now && x.crew.exp <= now + 60).sort((a, b) => a.crew.exp - b.crew.exp),
    over: list.filter(x => x.crew.over > 0), near: list.filter(x => x.crew.over <= 0 && x.crew.left < 60),
    // резерв в депо – условно; в макете у Ю-З 14
    reserve: scope().reduce((a, p) => a + (isSample() && p === "Ю-З" ? 14 : crewReserve(S.data, p, ALL[p].length)), 0) };
}
function renderWho() {
  const c = crewStats(), row = (t, n, warn) => `<div class="s"><span class="c">${warn && n ? mk.a(24) : ""}${t}</span><b class="${warn && n ? "amb" : ""}">${n}</b></div>`;
  $("#late").innerHTML = `<div class="k h"><h2>Кто на линии · ${scopeLabel()}</h2><span>локомотивные бригады</span></div>
    ${row("Бригад на линии", c.list.length)}${row("Смена бригады в ближайший час", c.hour.length)}${row("Превышение по графику работы", c.over.length, 1)}
    ${row("Близко к концу работы (< 1 ч)", c.near.length, 1)}${row(`В резерве в депо ${scope().length > 1 ? "полигонов" : "полигона"}`, c.reserve)}`;
  return null;
}
function crewCard(x) {
  if (!x) return `<section class="p crew-card none" aria-label="Бригада поезда"><div class="bh"><h2>Бригада</h2></div>
    <p class="sec hint">Выберите поезд в таблице: здесь появятся машинист, связь и смена бригады.</p></section>`;
  const k = x.crew, P = passport(x, S.data, stations, isSample()), late = k.late > 5;
  const warn = k.over > 0 ? `<div class="cw amb">${mk.a(30)}<p>Опоздание ${fmtDelay(x.delay)}: на смену в ${esc(k.station)} бригада придёт в ${hm(k.exp)}, конец работы по графику ${hm(k.end)}&nbsp;– превышение ≈ ${dur(k.over)}</p></div>`
    : k.left < 60 ? `<div class="cw amb">${mk.a(30)}<p>До конца работы по графику ${dur(k.left)} (в ${hm(k.end)}), смена в ${esc(k.station)} в ${hm(k.exp)}</p></div>`
    : `<div class="cw">${mk.g(30)}<p>Бригада в норме: смена в ${esc(k.station)} в ${hm(k.exp)}, до конца работы по графику ${dur(k.left)}</p></div>`;
  const kv = [["Машинист", `${k.driver} · депо ${k.depot}`], ["Телефон машиниста", k.phone], ["Помощник машиниста", `${k.assist} · ${k.aPhone}`],
    ["Спутниковый телефон поезда", P.phone], ["Начальник поезда (ЛНП)", P.chief], ["На смене", `с ${hm(k.start)} · ${dur(k.worked)}`],
    ["Конец работы по графику", hm(k.end)], ["Смена бригады", `${k.station} · план ${hm(k.plan)}${late ? `, ожид. ${hm(k.exp)}` : ""}`, late ? "amb" : ""]];
  return `<section class="p crew-card" aria-label="Бригада поезда ${esc(x.id)}">
    <div class="bh"><h2>Бригада · ${esc(x.id)}</h2><span class="sec">${esc(x.route)} · ${esc(x.station)}</span></div>${warn}
    <dl class="ckv">${kv.map(([a, b, cls]) => `<div><dt>${a}</dt><dd class="${cls || ""}">${esc(b)}</dd></div>`).join("")}</dl></section>`;
}
function renderCrewRight() {
  const old = $("#chg-scroll"), top = old ? old.scrollTop : 0, c = crewStats();
  const st = x => { const k = x.crew;
    return k.late > 5 ? `<span class="c">${mk.a(22)}<b class="amb">поезд ${fmtDelay(x.delay)}</b></span>`
      : k.ready <= c.now ? `<span class="c">${mk.g(22)}<span>готова</span></span>` : `<span class="c">${mk.n(22)}<span class="sec">явка ${hm(k.ready)}</span></span>`; };
  $("#right").innerHTML = crewCard(ui.sel && findTrain(ui.sel)) + `
  <section class="p rm-blk rm-chg" aria-label="Смены бригад в ближайший час">
    <div class="bh"><h2>Смены бригад · ближайший час · ${scopeLabel()}</h2><span class="sec">${c.hour.length ? `до ${hm(c.now + 60)} · ${c.hour.length}` : ""}</span></div>
    <div class="dep-scroll" id="chg-scroll" tabindex="0" aria-label="Смены бригад, листается"><table><colgroup><col style="width:110px"><col style="width:270px"><col style="width:130px"><col style="width:520px"><col></colgroup>
    <thead><tr><th>Время</th><th>Станция</th><th>Поезд</th><th>Сдаёт → принимает</th><th>Статус</th></tr></thead><tbody>
    ${c.hour.length ? c.hour.map(x => `<tr data-sel="${esc(x.id)}" class="${x.id === ui.sel ? "sel" : ""}"><td class="num">${hm(x.crew.exp)}</td><td>${esc(x.crew.station)}</td><td><b>${esc(x.id)}</b></td>
      <td>${esc(x.crew.driver)} <span class="sec">→</span> ${esc(x.crew.next)}</td><td>${st(x)}</td></tr>`).join("") : `<tr><td colspan="5" class="empty">В ближайший час смен бригад нет.</td></tr>`}</tbody></table></div>
  </section>`;
  const box = $("#chg-scroll"); if (box) box.scrollTop = top;
}

// ---------- РМ «Руководитель смены» (146:2013 штатный, 156:2239 НС) ----------
// Вся сеть: полигоны с запада на восток, дороги, отправления, опоздания, пассажиры. При НС – центр работы по ней и состав поезда.
const LEAD_NAME = "Громов И. В.";
const shortSt = name => stations.find(s => s.name === name)?.short || name;
const lateOf = p => ALL[p].filter(x => x.delay > 5 || nsIds.has(x.id)).sort((a, b) => nsIds.has(b.id) - nsIds.has(a.id) || b.delay - a.delay);
const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const pl = (n, a, b, c) => `${nf(n)} ${plural(n, a, b, c)}`;
// НС Т-102 «как в макете»: тексты карточки 160:2472
const FIG_NS = { title: "Биологическая угроза: повреждён бокс с опасными пробами",
  desc: "Медицинская бригада разбила бокс с пробами особо опасной инфекции в вагоне № 5. Заражение пассажиров подтверждено, число случаев уточняется.",
  extra: ["Заражение", "подтверждено 19:10 · число случаев уточняется", "red"],
  log: [["18:49", "Зарегистрировано сообщение о повреждении бокса"], ["18:52", "Принята в работу · руководитель смены"], ["19:10", "Подтверждены заражения пассажиров"], ["19:34", "Экстренные службы уведомлены"]],
  next: "Решение по вагону 5 и отправлению поезда" };
function nsInfo(n) {
  const x = findTrain(n.train), P = passport(x, S.data, stations, isSample()), car = carOfNs(n), np = nsPax(n);
  const all = Array.isArray(S.data.ns) ? S.data.ns : [S.data.ns], [dd, mm, yy] = S.data.date.split(",")[0].split(".");
  // номер НС закрепляется за ней: снятие одной НС не перенумеровывает остальные
  all.forEach(m => { if (!m.no) m.no = Math.max(0, ...all.map(k => k.no || 0)) + 1; });
  const facts = n.facts.map(f => f.join("")).join(" | "), track = facts.match(/на (\d+)-м пути/)?.[1], open = /перегон/.test(facts);
  const carRec = P.comp.find(c => c.n === car), fig = isSample() && n.train === "Т-102" && /^Биоугроза/.test(n.kind);
  return { x, P, car, carRec, track, open, fig, kindMain: n.kind.split(" · ")[0],
    id: `НС-${String(yy).slice(-2)}${mm}${dd}-${String(n.no).padStart(2, "0")}`,
    total: np.total || x.pax, inCar: np.inCar || carRec?.pax || 0, kids: carRec?.kids || 0 };
}
function netHtml(ns) {
  const tot = POLYS.reduce((a, p) => a + ALL[p].length, 0), lateN = POLYS.reduce((a, p) => a + lateOf(p).length, 0), MAX = 10;
  return `<section class="p lead-net" aria-label="Сеть по полигонам">
    <div class="bh"><h2>Сеть по полигонам</h2><span class="sec">${ns ? "" : "с запада на восток · "}опаздывают ${lateN} из ${nf(tot)}</span></div>
    <div class="net-cols">${POLYS.map(p => {
      const list = lateOf(p), n = list.length, hasNs = list.some(x => nsIds.has(x.id)), red = hasNs || list.some(x => x.delay > 240);
      const st = !n ? `<span class="st grn">${mk.g(22)}по графику</span>` : `<span class="st ${red ? "red" : "amb"}">${red ? mk.r(22) : mk.a(22)}${plural(n, "опаздывает", "опаздывают", "опаздывают")} ${n}${hasNs ? " · НС" : ""}</span>`;
      const shown = n > MAX ? list.slice(0, MAX - 1) : list;
      return `<div><div class="net-h"><p class="nm"><b class="pn">${p}</b>${st}</p><small>${pl(ALL[p].length, "поезд", "поезда", "поездов")} в пути</small></div>
        ${n ? shown.map(x => { const r = nsIds.has(x.id) || x.delay > 240;
          return `<button type="button" class="nt${nsIds.has(x.id) ? " ns" : ""}${ui.sel === x.id ? " sel" : ""}" data-open="${esc(x.id)}" aria-pressed="${ui.sel === x.id}" aria-label="Паспорт ${esc(x.id)}"><b>${esc(x.id)}${x.speed ? "(ск)" : ""}</b><b class="${r ? "red" : "amb"}">${fmtDelay(x.delay)}</b><span class="${nsIds.has(x.id) ? "red" : "sec"}">${esc(shortSt(x.station))}</span></button>`; }).join("")
          + (n > MAX ? `<p class="nt sec">ещё ${pl(n - shown.length, "поезд", "поезда", "поездов")}</p>` : "")
          : `<p class="nt mut">отклонений нет</p>`}</div>`; }).join("")}</div></section>`;
}
function roadsOf() {
  return POLYS.map(p => { const m = new Map(); for (const x of ALL[p]) m.set(x.road, (m.get(x.road) || 0) + 1); return [p, [...m].sort((a, b) => b[1] - a[1])]; });
}
function roadsHtml(ns) {
  const by = roadsOf(), tot = POLYS.reduce((a, p) => a + ALL[p].length, 0), nr = by.reduce((a, [, r]) => a + r.length, 0), max = Math.max(...by.flatMap(([, r]) => r.map(v => v[1])));
  return `<section class="p lead-roads" aria-label="Поезда в пути по дорогам">
    <div class="bh"><h2>${ns ? "Поезда по дорогам" : "Поезда в пути по дорогам"}</h2><span class="sec">всего ${nf(tot)}${ns ? "" : ` · ${pl(nr, "дорога", "дороги", "дорог")}`}</span>${ns ? "" : '<button type="button" class="pbtn sm" id="roads-export">Выгрузить</button>'}</div>
    <div class="rd-cols">${by.map(([p, r]) => `<div><p class="rh"><b>${ns ? p : POLY_FULL[p]}</b><b>${ALL[p].length}</b></p>
      ${r.map(([road, n]) => `<div class="rd"><p><span>${esc(road)}</span><b>${n}</b></p><i style="--w:${Math.round(n / max * 100)}%"></i></div>`).join("")}</div>`).join("")}</div></section>`;
}
function paxHtml() {
  const all = POLYS.flatMap(p => ALL[p]), T = paxTotals(S.data, isSample()), pct = v => `${String(v).replace(".", ",")} %`;
  const tile = (t, v, sub, w) => `<div><p>${t}</p><b>${nf(v)}</b>${w != null ? `<i style="--w:${Math.min(100, w)}%"></i>` : ""}${sub ? `<small>${sub}</small>` : ""}</div>`;
  return `<section class="p lead-pax" aria-label="Пассажиры и вагоны">
    <div class="bh"><h2>Пассажиры и вагоны</h2><span class="sec">в пути и отправлено</span></div>
    <div class="pax-t">${tile("Пассажиров в пути", all.reduce((a, x) => a + x.pax, 0), "оценка")}${tile("Вагонов в составе", all.reduce((a, x) => a + x.cars, 0))}
      ${tile("Отправлено за сутки", T.day, pct(T.dayPct) + " плана", T.dayPct)}${tile("за месяц", T.month, pct(T.monthPct) + " плана", T.monthPct)}${tile("за год", T.year, pct(T.yearPct) + " плана", T.yearPct)}</div></section>`;
}
function nsHtml(n) {
  const I = nsInfo(n), { x, P } = I, now = toMin(S.data.time);
  const start = n.log.find(l => /ведёт/.test(l[1]))?.[0] || n.since, next = n.log.find(l => l[2]), svc = n.log.find(l => /служб/.test(l[1]));
  const desc = I.fig ? FIG_NS.desc : `${n.facts[0][0]}${I.open ? "" : `, ${x.station}`}. В поезде ${pl(I.total, "пассажир", "пассажира", "пассажиров")}${I.car ? `, в вагоне ${I.car}\u00a0– ${I.inCar}` : ""}. Новое время отправления уточняется.`;
  const title = I.fig ? FIG_NS.title : I.car ? `${I.kindMain}: вагон ${I.car}` : I.open ? `${I.kindMain}: поезд стоит на перегоне` : cap(I.kindMain);
  const kv = [I.car && ["Вагон происшествия", `№ ${I.car} · ${pl(I.inCar, "пассажир", "пассажира", "пассажиров")}${I.kids ? `, из них ${pl(I.kids, "ребёнок", "ребёнка", "детей")} до 5 лет` : ""}`],
    I.fig && FIG_NS.extra, ["Всего в поезде", `${pl(I.total, "пассажир", "пассажира", "пассажиров")} · ${pl(x.cars, "вагон", "вагона", "вагонов")} · бригада ${P.crewSize}`],
    ["Отправление", I.open ? "остановлен на перегоне" : `приостановлено, стоит ${I.track ? `на ${I.track}-м пути` : "на станции"}`],
    ["Экстренные службы", svc ? `уведомлены ${svc[0]}` : "не вызывались"]].filter(Boolean);
  const log = I.fig ? FIG_NS.log : [[n.since, `Зарегистрировано: ${n.kind.toLowerCase()}`], ...n.log.filter(l => !l[2]).map(([t, v]) => [t, cap(v)])];
  const left = next ? ((toMin(next[0]) - now) % 1440 + 1440) % 1440 : 0;
  return `<section class="p lead-nsc" aria-label="Работа по НС ${I.id}">
    <p class="nsc-h">${mk.r(32)}<b>${I.id}</b><span class="chip-r">${/^Отказ/.test(n.kind) ? "Высокая" : "Критическая"}</span></p>
    <h3>${esc(title)}</h3>
    <p class="st">${mk.g(24)}В работе с ${start} · ведёт ${LEAD_NAME} · прошло ${n.mins} мин</p>
    <p class="ds">${esc(desc)}</p>
    <p class="h4">Задержка отправления</p>
    <div class="g3"><div><p>${I.open ? "Где" : "Станция"}</p><p>${esc(I.open ? "перегон у ст. " + shortSt(x.station) : shortSt(x.station) + (I.track ? `, п. ${I.track}` : ""))}</p></div><div><p>План (МСК)</p><p>${n.since}</p></div><div><p>Факт</p><p class="red">не отправлен</p></div>
      <div><p>Задержка</p><p class="red">${fmtDelay(n.mins)}</p></div><div><p>Новое время</p><p class="amb">уточняется</p></div><div><p>Причина</p><p>${esc(I.car ? `вагон ${I.car}` : I.kindMain)}</p></div></div>
    <p class="h4">Обстановка и реагирование</p>
    <dl class="sk">${kv.map(([a, v, c]) => `<div><dt>${a}</dt><dd class="${c || ""}">${esc(v)}</dd></div>`).join("")}</dl>
    <p class="h4">Журнал событий</p>
    <div class="log">${log.map(([t, v]) => `<p><b>${t}</b><span>${esc(v)}</span></p>`).join("")}</div>
    ${next ? `<div class="nx"><p>${mk.a(24)}Следующий шаг · ${next[0]} · ${left ? `через ${left} мин` : "сейчас"}</p><p>${esc(I.fig ? FIG_NS.next : cap(next[1]))}</p></div>` : ""}
    <div class="act"><button type="button" class="pbtn ns on" id="ns-clear" data-train="${esc(x.id)}">Снять НС</button><button type="button" class="pbtn ghost" id="ns-export">Выгрузить</button></div>
  </section>`;
}
const CAR_LOW = { "С": "сидячий", "С2": "сидячий", "П": "плацкарт", "К": "купе", "ВР": "ресторан" };
function nsCarHtml(n) {
  const I = nsInfo(n), { x, P } = I, tiles = I.car
    ? [[`Пассажиров в вагоне ${I.car}`, I.inCar, "red"], [`Детей до 5 лет в вагоне ${I.car}`, I.kids, I.kids ? "amb" : ""], [`Пассажиров в поезде · ${pl(x.cars, "вагон", "вагона", "вагонов")}`, nf(I.total)]]
    : [["Пассажиров в поезде", nf(I.total), "red"], ["Детей до 5 лет в поезде", P.kidsTotal, P.kidsTotal ? "amb" : ""], ["Вагонов", x.cars]];
  const cars = [`<div><b>Л</b><span>локомотив</span></div>`, ...P.comp.map(c => `<div class="${c.n === I.car ? "ns" : ""}"><b>${c.n}</b><span>${CAR_LOW[c.type]}${c.note === "штабной" ? " · штаб" : ""}</span>
    ${c.type === "ВР" ? "" : `<strong>${c.pax} пасс.</strong><em class="${c.kids ? "amb" : "mut"}">${c.kids ? `детей ${c.kids}` : "детей нет"}</em>`}</div>`)];
  return `<section class="p lead-car" aria-label="Пассажиры и состав поезда ${esc(x.id)}">
    <div class="ph">${mk.r(32)}<h2>${I.id} · ${esc(x.id)}</h2></div>
    <p class="sec sub">${esc(x.route)} · ${I.open ? "стоит на перегоне у ст. " + esc(shortSt(x.station)) : `стоит: ${esc(x.station)}${I.track ? `, путь ${I.track}` : ""}`}</p>
    <div class="kt">${tiles.map(([t, v, c]) => `<div><p>${t}</p><b class="${c || ""}">${v}</b></div>`).join("")}
      <div><p>Штабной вагон</p><b>${String(P.staff).split(" · ")[0]}</b></div><div><p>Начальник поезда (ЛНП)</p><b class="s">${esc(P.chief)}</b></div><div><p>Спутниковый телефон</p><b class="s">${P.phone}</b></div></div>
    <p class="h3c"><b>Состав ${esc(x.id)}</b> <span class="sec">голова слева</span></p>
    <div class="cars${P.comp.length + 1 > 18 ? " c3" : ""}">${cars.join("")}</div>
    <button type="button" class="pbtn pri" data-open="${esc(x.id)}" data-tab="comp">Открыть паспорт ${esc(x.id)}</button>
  </section>`;
}
function renderLeadMain() {
  const n = nsl[0];
  rm.classList.toggle("lead-ns", !!n);
  $("#lead").innerHTML = netHtml(!!n) + roadsHtml(!!n) + (n ? nsHtml(n) : "");
}
function renderLeadRight(b) {
  const x = ui.sel && findTrain(ui.sel);
  if (x) { $("#right").innerHTML = passHtml(x); return; }
  b = b || blocks(); lastB = b;
  const n = nsl[0], old = $("#dep-scroll");
  if (old) depTop = old.scrollTop;
  $("#right").innerHTML = (n ? nsCarHtml(n) : depHtml(b)) + paxHtml();
  if (!n) depAfter(depView(b.dep));
}
function exportRoads() {
  const rows = roadsOf().flatMap(([p, r]) => r.map(([road, n]) => [POLY_FULL[p], road, n]));
  download(`дороги_${S.data.time.replace(":", "-")}.csv`, [["Полигон", "Дорога", "Поездов в пути"], ...rows].map(r => r.map(csvCell).join(";")).join("\r\n"), "text/csv;charset=utf-8");
}
function exportNs() {
  const n = nsl[0]; if (!n) return;
  const el = $(".lead-nsc"), L = [...el.querySelectorAll("h3,.st,.ds,.h4,.g3 div,.sk div,.log p,.nx p")].map(e => e.matches(".h4") ? "\r\n" + e.textContent : e.textContent.replace(/\s+/g, " ").trim());
  download(`НС_${n.train}.txt`, [$(".nsc-h").textContent.trim(), `Смена ${S.data.date}, ${S.data.time}`, "", ...L].join("\r\n"), "text/plain;charset=utf-8");
}

// ---------- РМ «Инфраструктура» (194:4704 штатный, 198:5121 НС по инфраструктуре) ----------
// Действующие события – из карточек полигонов ТКП; журнал за сутки – общая таблица РМ (фильтры, сортировка, поиск, CSV)
const curEv = () => (ui.sel && INF.byId[ui.sel]) || INF.now[0] || null;
const evMk = (e, s = 22) => e.lvl === "red" ? mk.r(s) : e.lvl === "fail" ? mk.q(s) : mk.a(s);
const resHtml = x => x.resLvl === "red" ? `<span class="c">${mk.r(20)}<b class="red">${esc(x.res)}</b></span>` : x.resLvl === "amb" ? `<span class="c">${mk.a(20)}<span class="amb">${esc(x.res)}</span></span>`
  : x.resLvl === "ok" ? `<span class="c">${mk.g(20)}<span>${esc(x.res)}</span></span>` : `<span class="c">${mk.n(20)}<span class="sec">${esc(x.res)}</span></span>`;
function journalRow(x) {
  const on = curEv()?.id === x.ev;
  return `<tr data-id="${x.id}" data-ev="${esc(x.ev)}" class="${on ? "sel" : ""}" aria-selected="${on}"><td><b>${x.t}</b></td><td class="no">${x.no}</td><td>${esc(x.kind)}</td><td class="sec">${esc(x.dir)}</td><td>${esc(x.poly)}</td>
    <td>${esc(x.where)}</td><td class="sec">${esc(x.what)}</td><td>${resHtml(x)}</td></tr>`;
}
function renderInfraNow() {
  const q = norm(ui.nq || "").trim(), cur = curEv(), all = INF.now, ns = all.filter(e => e.lvl === "red").length;
  const no = q.match(/^№\s*(\d+)$/)?.[1];
  const list = all.filter(e => !q || (no ? e.no === +no : [e.kind, e.where, e.trains, e.road, e.poly, e.dir].some(v => norm(v).includes(q))));
  $("#inow-sub").textContent = ns ? `НС ${ns} · окна и предупреждения ${all.length - ns}` : `отказы, окна, предупреждения · ${all.length}${list.length < all.length ? ` · показано ${list.length}` : ""}`;
  $("#inow-tb").innerHTML = list.length ? list.map(e => { const c = e.lvl === "red" ? "red" : "amb";
    return `<tr data-ev="${esc(e.id)}" class="${cur?.id === e.id ? "sel" : ""}" aria-selected="${cur?.id === e.id}"><td class="no">${e.no}</td><td><span class="c">${evMk(e)}<b class="${c}">${esc(e.kind)}</b></span></td><td>${esc(e.dir)}</td><td>${esc(e.poly)}</td>
      <td class="sec">${esc(e.road)}</td><td>${esc(e.where)}</td><td class="num">${e.from}</td><td class="num ${e.lvl === "amb" ? "" : "amb"}">${esc(e.to)}</td><td class="sec">${esc(e.lim)}</td><td>${esc(e.trains)}</td>
      <td class="${e.impactLvl || ""}"${e.impactLvl ? ' style="font-weight:600"' : ""}>${esc(e.impact)}</td></tr>`; }).join("")
    : `<tr><td colspan="11" class="empty">${all.length ? "Ничего не найдено." : "Отказов, окон и предупреждений нет."}</td></tr>`;
}
function stateHtml() {
  const cell = c => c.lvl === "ok" ? `<span class="c">${mk.g(20)}<span>${c.txt}</span></span>` : c.lvl === "red" ? `<span class="c">${mk.r(20)}<b class="red">${c.txt}</b></span>`
    : c.lvl === "fail" ? `<span class="c">${mk.q(20)}<b class="amb">${c.txt}</b></span>` : `<span class="c">${mk.a(20)}<span class="amb">${esc(c.txt)}</span></span>`;
  return `<section class="p inf-state" aria-label="Состояние по полигонам">
    <div class="bh"><h2>Состояние по полигонам</h2><span class="sec">путь · СЦБ и связь · энергоснабжение</span></div>
    <table><colgroup><col style="width:330px"><col style="width:330px"><col style="width:330px"><col></colgroup>
    <thead><tr><th>Полигон</th><th>Путь</th><th>СЦБ и связь</th><th>Энергоснабж.</th></tr></thead><tbody>
    ${INF.state.map(([p, cells]) => `<tr><td><b style="font-weight:600">${POLY_FULL[p]}</b></td>${cells.map(c => `<td${c.ev ? ` data-ev="${esc(c.ev)}" class="lnk"` : ""}>${cell(c)}${c.no ? `<span class="no">№${c.no}</span>` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
}
function cardHtml(e) {
  if (!e) return `<section class="p inf-card none" aria-label="Карточка события"><div class="bh"><h2>Событий нет</h2></div><p class="sec hint">Отказов, окон и предупреждений сейчас нет.</p></section>`;
  const now = toMin(S.data.time), mins = m => ((now - m) % 1440 + 1440) % 1440, kv = rows => `<dl class="ckv">${rows.filter(Boolean).map(([a, b, c]) => `<div><dt>${a}</dt><dd class="${c || ""}">${esc(b)}</dd></div>`).join("")}</dl>`;
  const head = (t, sub, cls) => `<section class="p inf-card ${cls}" aria-label="${esc(t)}"><p class="ih">${e.past ? mk.g(28) : evMk(e, 28)}<span class="noc">№${e.no}</span><b class="${e.lvl === "red" ? "red" : e.past ? "" : "amb"}">${esc(t)}</b></p><p class="sec sub">${sub}</p>`;
  if (e.past) return head(`${e.kind} · ${e.where}`, `${POLY_FULL[e.poly]} полигон · с ${e.from} · закрыто`, "past") + kv([["Что", e.what], ["Направление", e.dir], ["Итог", e.res]]) + `</section>`;
  if (e.lvl === "red") {
    const n = e.ns, x = findTrain(e.train), P = x && passport(x, S.data, stations, isSample()), nx = n.log.find(l => l[2]);
    const log = [[e.from, `поезд остановлен, ${e.what.replace(/ на перегоне$/, "")}`], ...n.log.filter(l => !l[2]).map(([t, v]) => [t, v])];
    return head(`НС · ${e.kind.replace(/^НС · /, "")} · ${e.where}`, `${POLY_FULL[e.poly]} полигон · с ${e.from} · ${mins(e.start)} мин · ведёт руководитель смены`, "ns")
      + kv([["Остановлен на перегоне", x ? `${x.id} ${x.route} · ${nf(x.pax)} пасс.${P.kidsTotal ? `, детей ${P.kidsTotal}` : ""}` : e.train, "red"], ["Стоит", `с ${e.from} · ${mins(e.start)} мин`],
        ["Причина", e.nsWhy], e.next && ["Следом", `${e.next} задержан на ст. ${e.nextSt || "–"}`], [`Бригада ${e.crew}`, `${mins(e.arrive) < mins(e.start) ? "на перегоне" : "в пути"} · ${e.phone}`], ["Прогноз восстановления", hm(e.prog), "amb"]])
      + `<p class="h4">Ход работы</p><div class="log">${log.map(([t, v]) => `<p><b>${t}</b><span>${esc(v)}</span></p>`).join("")}${nx ? `<p class="amb"><b>${nx[0]}</b><span>${esc(nx[1])}</span></p>` : ""}</div></section>`;
  }
  if (e.lvl === "fail") {
    const arrived = mins(e.arrive) <= mins(e.start) && mins(e.arrive) >= 0 && (now - e.arrive + 1440) % 1440 < 720;
    return head(`${e.kind} · ${e.where}`, `${POLY_FULL[e.poly]} полигон · ${esc(e.road)} ж.\u00a0д. · с ${e.from} · ${mins(e.start)} мин`, "fail")
      + kv([["Что", e.what], ["Ограничение", e.lim], ["Поезда на подходе", e.approach], ["Ожидаемая задержка", `+${Math.floor(e.exp / 60)}:${String(e.exp % 60).padStart(2, "0")}`, "amb"],
        [`Бригада ${e.crew}`, arrived ? `на перегоне с ${hm(e.arrive)}` : `выехала ${hm(e.start + 8)}`], ["Прогноз восстановления", hm(e.prog), "amb"],
        [`Диспетчер ${e.crew}`, e.phone], ["Сообщено", `руководителю, команде ${e.poly} · ${hm(e.start + 2)}`]])
      + `<div class="nsif"><p>Станет НС, если</p><p>остановлен пассажирский поезд с людьми · угроза безопасности · задержка ≥ 1:00 (сейчас ожидается ${Math.floor(e.exp / 60)}:${String(e.exp % 60).padStart(2, "0")}) · решение руководителя</p></div></section>`;
  }
  const win = /^Окно/.test(e.kind);
  return head(`${e.kind} · ${e.where}`, `${POLY_FULL[e.poly]} полигон · ${esc(e.road)} ж.\u00a0д. · ${win ? (e.on ? `идёт с ${e.from}` : `с ${e.from}`) : `с ${e.from}`} до ${e.to}`, "amb")
    + kv([["Что", e.what], ["Ограничение", e.lim], ["Действует", `${e.from}–${e.to}`], [win && !e.on ? "Поезда до начала и в окно" : "Поезда на участке", e.trains],
      ["Влияние", e.impact, e.impactLvl], ["Ответственный", e.resp], ["Телефон", e.phone]]) + `</section>`;
}
function weatherHtml() {
  const cities = POLYS.flatMap(p => [...(S.data.side?.[p]?.weather || []).map(w => ({ city: w.city, poly: p, t: w.t, sky: w.sky })),
    ...polyBlocks(S.data, p, ALL[p], nsIds, isSample()).cities.map(c => ({ city: c.city, poly: p, t: c.t, sky: c.sky }))]);
  const wx = infraWeather(cities, isSample());
  return `<section class="p inf-wx" aria-label="Погода с риском для инфраструктуры">
    <div class="bh"><h2>Погода · риски</h2><span class="sec">города с отклонениями</span></div>
    ${wx.length ? `<table><colgroup><col style="width:300px"><col style="width:140px"><col style="width:300px"><col></colgroup>
    <thead><tr><th>Город</th><th>Полигон</th><th>Погода</th><th>Риск</th></tr></thead><tbody>
    ${wx.map(c => `<tr><td>${esc(c.city)}</td><td class="sec">${c.poly}</td><td class="sec num">${c.t < 0 ? "−" + -c.t : c.t} °C · ${esc(c.sky)}</td><td>${esc(c.risk)}</td></tr>`).join("")}</tbody></table>`
    : `<p class="foot-ok">${mk.g(22)}Погодных рисков нет</p>`}</section>`;
}
function renderInfraRight() { $("#right").innerHTML = stateHtml() + cardHtml(curEv()) + weatherHtml(); }
function exportNow() {
  const rows = INF.now.map(e => [e.no, e.kind, e.dir, e.poly, e.road, e.where, e.from, e.to, e.lim, e.trains, e.impact]);
  download(`инфраструктура_сейчас_${S.data.time.replace(":", "-")}.csv`, [["№", "Событие", "Направление", "Полигон", "Дорога", "Перегон", "Начало", "До", "Ограничение", "Поезда на участке", "Влияние"], ...rows].map(r => r.map(csvCell).join(";")).join("\r\n"), "text/csv;charset=utf-8");
}

// ---------- РМ «Отправление и информирование» (Figma, секция 5: 263:8786 штатный, 295:8650 НС, 295:9870 окно текста) ----------
// Слева отправления и прибытие с оповещением, справа общие «Опоздания», журнал «Объявлено за смену» и 14 городов.
// Очереди отдельным списком нет: то, что ждёт объявления, стоит в своих таблицах сверху с галочкой в «Оповещении», объявляет
// одна кнопка «Объявить выбранные» в шапке «Прибытия» (отмеченное в обеих таблицах своего участка). Текст правится в окне на месте паспорта.
const SIDES = [["west", "Запад", "Окт, Моск, Ю-З"], ["east", "Восток", "С-З, Вост"], ["all", "Вся сеть", ""]];
const sidePolys = s => s === "west" ? WEST : s === "east" ? EAST : POLYS;
const CH = ["табло", "приложение", "SMS", "голос"];
const tplOf = q => q.kind === "ns" ? "stop" : q.kind === "dep" ? "dep" : "arr";
const tplsOf = q => q.kind === "dep" ? ["dep", "stop", "own"] : q.kind === "ns" ? ["stop", "arr", "own"] : ["arr", "stop", "own"];
const qText = q => S.data.annText?.[q.key]?.text || annText(q, tplOf(q), toMin(S.data.time));
const qCh = q => S.data.annText?.[q.key]?.ch || q.ch;
const findQ = key => IFO.arr.find(q => q.key === key) || IFO.dep.find(q => q.key === key) || null;
const nsSince = q => nsl.find(n => n.train === q.id)?.since || "";
const dCls = m => m > 240 ? "red" : m >= 60 ? "org" : m > 5 ? "amb" : "sec";
const dMk = (m, s) => m > 240 ? mk.r(s) : m >= 60 ? mk.o(s) : m > 5 ? mk.a(s) : "";
function sidesHtml(t) {
  return `<span class="ifo-side" role="group" aria-label="Полигоны"><span class="sec">Полигоны:</span>${SIDES.map(([k, a, b]) => `<button type="button" data-side="${t}:${k}" aria-pressed="${ui.side[t] === k}">${a}${b ? ` <span>${b}</span>` : ""}</button>`).join("")}</span>`;
}
// ждёт объявления: НС, новое опоздание от +0:20, сдвиг прогноза, задержка отправления
const isQ = q => q.k === "ns" || q.k === "wait" || q.k === "shift";
// колонка «Оповещение»: статус; у ждущих – галочка «объявить» и ссылка на окно текста (кнопка «Объявить» одна, в шапке «Прибытия»)
function annCell(q) {
  const A = q.ann, chs = qCh(q).join(" · "), on = ui.edit === q.key;
  const edit = t => `<span class="c"><label class="ifo-ck"><input type="checkbox" data-q="${esc(q.key)}"${ui.qOff.has(q.key) ? "" : " checked"} aria-label="Объявить ${esc(q.id)}"></label>`
    + `<button type="button" class="ifo-a${on ? " on" : ""}" data-edit="${esc(q.key)}" aria-label="${esc(q.id)}: ${t}, открыть текст объявления">${q.k === "ns" ? mk.r(22) : mk.a(22)}<span>${on ? "в очереди · текст открыт справа" : t}</span></button></span>`;
  if (q.k === "ok") return `<span class="c">${mk.g(22)}<span class="grn">объявлено ${A.at} · ${A.ns ? "НС" : fmtDelay(A.delay)}</span><span class="sec sm">${esc(chs)}</span></span>`;
  if (q.k === "ns" || q.k === "wait") return edit("в очереди · не объявлено");
  if (q.k === "shift") return edit(`в очереди · сдвиг ${fmtDelay(q.delay - A.delay)}`);
  if (q.k === "board") return `<span class="c">${mk.g(22)}<span class="grn">посадка объявлена ${q.boardAt}</span><span class="sec sm">табло · голос</span></span>`;
  return `<span class="mut">${q.k === "small" ? `не нужно · меньше +0:${ANN_MIN}` : q.k === "ontime" ? "по графику" : q.k === "auto" ? `посадка объявится сама в ${q.boardAt}` : q.k === "late" ? "не объявлялось" : "не требовалось"}</span>`;
}
// [заголовок, ключ сортировки, класс, ширина]
const IDEP = [["Поезд", "id", "", 150], ["Маршрут", "route", "", 420], ["Станция формирования", "at", "", 345], ["Отпр. план", "rel", "", 140], ["Задержка", "delay", "", 170], ["Новое / факт", null, "", 150],
  ["Статус", "status", "", 280], ["Пасс.", "pax", "r", 150], ["Путь", null, "", 110], ["Оповещение", "k", ""]];
const IARR = [["Поезд", "id", "", 140], ["Маршрут", "route", "", 340], ["Опоздание", "delay", "", 160], ["Следующая крупная станция", "next", "", 300], ["План, местн.", null, "", 140],
  ["Прогноз, местн.", "inN", "", 172], ["Пояс", null, "", 110], ["Конечная · прогноз, местн.", "final", "", 350], ["Пасс.", "pax", "r", 110], ["Отметки", null, "", 190], ["Оповещение", "k", ""]];
const KORD = ["ns", "shift", "wait", "late", "ok", "board", "small", "auto", "ontime", "none"];
const DSTO = ["задержан", "посадка", "по графику", "ушёл"];
function infoList(w) {
  const q = norm(ui.iq[w].trim()).replace(/^т-?(?=\d)/, "т-"), ps = sidePolys(ui.side[w]), s = ui.isort[w];
  const key = { id: x => num(x.id), k: x => KORD.indexOf(x.k), status: x => DSTO.indexOf(x.status) }[s.k] || (x => x[s.k]);
  const cmp = (a, b) => { const p = key(a), r = key(b); return typeof p === "string" ? p.localeCompare(r, "ru") : p - r; };
  return (w === "d" ? IFO.dep : IFO.arr).filter(x => (x.ns || ps.includes(x.poly)) && (!q || [x.id, x.route, x.at, x.next || "", x.final || ""].some(v => norm(v).includes(q))))
    // НС всегда сверху, под ней – то, что ждёт объявления, при любом фильтре и сортировке
    .sort((a, b) => (b.ns ? 1 : 0) - (a.ns ? 1 : 0) || (isQ(b) ? 1 : 0) - (isQ(a) ? 1 : 0) || cmp(a, b) * s.dir || (a.rel ?? 0) - (b.rel ?? 0) || num(a.id) - num(b.id));
}
function infoHead(w, cols) {
  const s = ui.isort[w];
  return `<tr>${cols.map(([t, k, cls]) => { const on = k && s.k === k;
    return `<th${cls ? ` class="${cls}"` : ""}${on ? ` aria-sort="${s.dir < 0 ? "descending" : "ascending"}"` : ""}>${k ? `<button type="button" class="sortb${on ? " on" : ""}" data-isort="${w}:${k}">${t}${on ? (s.dir < 0 ? " ↓" : " ↑") : ""}</button>` : t}</th>`; }).join("")}</tr>`;
}
function depRow(q) {
  const sc = { "задержан": "amb", "посадка": "blue", "по графику": "sec", "ушёл": "mut" }[q.status];
  return `<tr class="${q.k === "wait" ? "hl" + (ui.qOff.has(q.key) ? " off" : "") : ""}" data-qrow="${esc(q.key)}"><td><b>${esc(q.id)}</b></td><td>${esc(q.route)}</td><td>${esc(q.at)}</td><td class="sec num">${q.plan}</td>
    <td>${q.delay ? `<span class="c">${mk.a(22)}<b class="amb">${fmtDelay(q.delay)}</b></span>` : '<span class="mut">–</span>'}</td>
    <td class="num ${q.delay && q.status !== "ушёл" ? "amb" : q.status === "ушёл" ? "sec" : ""}">${q.newT}</td><td class="${sc}">${q.status}</td>
    <td class="r">${nf(q.pax)}</td><td class="sec">${q.status === "по графику" ? "–" : q.track}</td><td>${annCell(q)}</td></tr>`;
}
function arrRow(q) {
  const x = q.x, c = q.ns ? "red" : dCls(q.delay), m = [q.ns && '<b class="red">НС</b>', q.kids && "дети", q.ctl && "контроль"].filter(Boolean);
  return `<tr data-id="${esc(q.id)}" data-qrow="${esc(q.key)}" class="${q.ns ? "ns" : q.k === "wait" || q.k === "shift" ? "hl" : ""}${isQ(q) && ui.qOff.has(q.key) ? " off" : ""}${ui.sel === q.id ? " sel" : ""}" aria-selected="${ui.sel === q.id}">
    <td><b class="${q.ns ? "red" : ""}">${esc(q.id)}</b></td><td>${esc(q.route)}</td>
    <td>${q.ns ? `<span class="c">${mk.r(22)}<b class="red">НС ${fmtDelay(x.delay)}</b></span>` : q.delay > 5 ? `<span class="c">${dMk(q.delay, 22)}<b class="${c}">${fmtDelay(x.delay)}</b></span>` : `<span class="sec">${fmtDelay(x.delay)}</span>`}</td>
    <td>${esc(q.ns ? q.at + " · стоит" : q.next)}</td><td class="sec num">${q.planN}</td><td class="num ${q.ns ? "red" : q.delay > 5 ? c : ""}">${q.ns ? "не определён" : q.progN}</td><td class="sec">UTC+${q.tzN}</td>
    <td>${esc(q.final)} · ${q.ns ? "–" : q.progE}${q.tzE !== 3 ? ` <span class="sec">UTC+${q.tzE}</span>` : ""}</td><td class="r">${nf(q.pax)}</td>
    <td class="sec">${m.length ? m.join('<span class="mut"> · </span>') : '<span class="mut">–</span>'}</td><td>${annCell(q)}</td></tr>`;
}
const colg = cols => `<colgroup>${cols.map(c => c[3] ? `<col style="width:${c[3]}px">` : "<col>").join("")}</colgroup>`;
function infoPanel(w) {
  const d = w === "d", cols = d ? IDEP : IARR;
  return `<section class="p ifo-${d ? "dep" : "arr"}" id="ifo-${w}" aria-label="${d ? "Отправления" : "Прибытие и оповещение"}">
    <div class="bh"><h2>${d ? "Отправления" : "Прибытие и оповещение"}</h2><span class="sec" id="ifo-sub-${w}"></span>${sidesHtml(w)}
      ${d ? "" : (() => { const n = annSel().length; return `<button type="button" class="pbtn pri" id="q-ann"${n ? "" : " disabled"}>Объявить выбранные · ${n}</button>`; })()}
      <input type="search" class="ifo-qs" data-iq="${w}" value="${esc(ui.iq[w])}" placeholder="Поиск: номер, станция, маршрут" aria-label="Поиск: номер, станция, маршрут" autocomplete="off">
      <button type="button" class="pbtn" data-iexp="${w}">Выгрузить</button></div>
    <div class="dep-scroll ifo-scroll" id="ifo-scroll-${w}" tabindex="0" aria-label="${d ? "Отправления" : "Поезда в пути"}, листается"><table>${colg(cols)}<thead>${infoHead(w, cols)}</thead><tbody id="ifo-tb-${w}"></tbody></table></div>
    ${d ? "" : `<p class="ifo-note">Время – местное по станции. Галочки – в «Оповещении»; «Объявить выбранные» объявляет отмеченное в обеих таблицах своего участка. Оповещать от +0:${ANN_MIN} или при сдвиге прогноза на ${ANN_SHIFT} мин.</p>`}
  </section>`;
}
let ifoKey = "";
function infoBody(w) {
  const list = infoList(w), ps = sidePolys(ui.side[w]), tb = $("#ifo-tb-" + w);
  if (!tb) return;
  tb.innerHTML = list.length ? list.slice(0, 400).map(w === "d" ? depRow : arrRow).join("") : `<tr><td colspan="${(w === "d" ? IDEP : IARR).length}" class="empty">Ничего не найдено.</td></tr>`;
  if (w === "d") { const P = ps.reduce((a, p) => ({ plan: a.plan + IFO.plan[p].plan, sent: a.sent + IFO.plan[p].sent }), { plan: 0, sent: 0 });
    $("#ifo-sub-d").textContent = `план ${P.plan} · отправлено ${P.sent} · задержано ${list.filter(q => q.delay).length}${sideQ("d").length ? ` · в очереди ${sideQ("d").length}` : ""}`; }
  else { const all = IFO.arr.filter(q => ps.includes(q.poly)), waitN = sideQ("a").filter(q => !q.ns).length;
    $("#ifo-sub-a").textContent = `в пути ${nf(all.length)}${IFO.arr.some(q => q.ns) ? " · НС сверху" : ""}${waitN ? ` · в очереди ${waitN} сверху` : ""}${list.length > 400 ? " · показаны первые 400, уточните поиском" : ""}`; }
}
// ждут объявления в таблице своего участка (без поиска: поиск только прячет строки) и отмеченные из них
const sideQ = w => (w === "d" ? IFO.dep : IFO.arr).filter(q => isQ(q) && (q.ns || sidePolys(ui.side[w]).includes(q.poly)));
const annSel = () => [...sideQ("a"), ...sideQ("d")].filter(q => !ui.qOff.has(q.key));
// журнал «Объявлено за смену»: своё (d.ann), объявленное до открытия окна и посадки, по участку таблицы прибытия
function journalOf() {
  const ps = sidePolys(ui.side.a), now = toMin(S.data.time), me = $(".rm-user")?.textContent || "оператор";
  const J = [];
  for (const q of [...IFO.arr, ...IFO.dep]) {
    if (!(q.ns || ps.includes(q.poly))) continue;
    if (q.ann) J.push({ at: q.ann.at, id: q.id, ns: !!q.ann.ns,
      what: q.ann.ns ? `НС · стоит: ${q.at}` : q.kind === "dep" ? `отправление ${q.newT} · ${fmtDelay(q.ann.delay)}` : `прибытие ${q.final} ${q.progE} · ${fmtDelay(q.ann.delay)}`,
      ch: qCh(q).join(" · "), who: me });
    if (q.k === "board") J.push({ at: q.boardAt, id: q.id, what: `посадка, путь ${q.track}`, ch: "табло · голос", who: "автоматически" });
  }
  const ago = t => (now - toMin(t) + 1440) % 1440;
  return J.sort((a, b) => ago(a.at) - ago(b.at) || num(a.id) - num(b.id));
}
function journalHtml() {
  const J = journalOf(), side = SIDES.find(s => s[0] === ui.side.a)[1].toLowerCase();
  return `<section class="p ifo-j" aria-label="Объявлено за смену">
    <div class="bh"><h2>Объявлено за смену · ${J.length}</h2><span class="sec">${ui.side.a === "all" ? "вся сеть" : `свой участок · ${side}`}</span><button type="button" class="pbtn" id="j-exp">Выгрузить</button></div>
    <div class="dep-scroll ifo-scroll" id="ifo-scroll-j" tabindex="0" aria-label="Объявлено за смену, листается"><table><colgroup><col style="width:90px"><col style="width:110px"><col style="width:520px"><col style="width:340px"><col></colgroup>
    <thead><tr><th>Время</th><th>Поезд</th><th>Что объявили</th><th>Каналы</th><th>Кто</th></tr></thead><tbody>
    ${J.length ? J.map(j => `<tr><td class="num sec">${j.at}</td><td><b class="${j.ns ? "red" : ""}">${esc(j.id)}</b></td><td>${esc(j.what)}</td><td class="sec">${esc(j.ch)}</td><td class="sec">${esc(j.who)}</td></tr>`).join("")
      : `<tr><td colspan="5" class="empty">За смену ещё ничего не объявлено.</td></tr>`}</tbody></table></div>
  </section>`;
}
function exportJournal() {
  download(`объявлено_${ui.side.a}_${S.data.time.replace(":", "-")}.csv`, [["Время", "Поезд", "Что объявили", "Каналы", "Кто"], ...journalOf().map(j => [j.at, j.id, j.what, j.ch, j.who])].map(r => r.map(csvCell).join(";")).join("\r\n"), "text/csv;charset=utf-8");
}
function citiesHtml() {
  return `<section class="p ifo-city" aria-label="14 городов"><div class="bh"><h2>14 городов</h2><span class="sec">местное время, погода, поезда в пути до города</span></div>
    <table><colgroup><col style="width:250px"><col style="width:120px"><col style="width:110px"><col style="width:120px"><col style="width:170px"><col style="width:100px"><col></colgroup>
    <thead><tr><th>Город</th><th>Полигон</th><th>Пояс</th><th>Местное</th><th>Погода</th><th class="r">t, °C</th><th>Едут в город</th></tr></thead><tbody>
    ${IFO.cities.map(c => `<tr><td>${esc(c.city)}</td><td class="sec">${c.poly}</td><td class="sec">UTC+${c.tz}</td><td class="num">${c.local}</td><td class="sec">${esc(c.sky)}</td><td class="r">${c.t < 0 ? "−" + -c.t : c.t}</td>
      <td>${!c.n ? '<span class="mut">–</span>' : c.late ? `<span class="c">${mk.a(20)}<span class="amb">${c.n} · ${c.late} ${plural(c.late, "опаздывает", "опаздывают", "опаздывают")}</span></span>` : `<span class="sec">${c.n} · по графику</span>`}</td></tr>`).join("")}</tbody></table></section>`;
}
const cntTxt = len => { const n = smsParts(len); return `${len} ${plural(len, "знак", "знака", "знаков")} · SMS: ${n === 1 ? "одно сообщение" : `${n} ${plural(n, "часть", "части", "частей")}`} (кириллицей – 70 знаков в одном)`; };
function editorHtml(q) {
  const E = ui.ed, names = Object.fromEntries(ANN_TPL);
  const sub = q.kind === "ns" ? `НС · ${q.route} · стоит с ${nsSince(q)}, станция ${q.at}` : q.kind === "dep" ? `${q.route} · ${q.at} · отправление ${q.plan} → ${q.newT}` : `${q.route} · опоздание ${fmtDelay(q.delay)} · следующая ${q.next}`;
  const rc = { "табло": `вокзалы: ${q.st.join(", ")}`, "приложение": `${pl(q.pax, "пассажир", "пассажира", "пассажиров")} поезда`, "SMS": `${pl(Math.round(q.pax * 0.68), "номер", "номера", "номеров")} из билетов`, "голос": "на вокзалах при подходе поезда" };
  return `<section class="p ifo-ed" aria-label="Текст объявления ${esc(q.id)}">
    <div class="ph">${q.kind === "ns" ? mk.r(30) : mk.a(30)}<h2>Текст объявления · ${esc(q.id)}</h2><button type="button" class="close" id="ed-close">✕ Закрыть · Esc</button></div>
    <p class="sec sub">${esc(sub)}</p>
    <p class="h4">Шаблон</p><div class="ifo-tpl" role="group" aria-label="Шаблон">${tplsOf(q).map(k => `<button type="button" data-tpl="${k}" aria-pressed="${E.tpl === k}">${names[k]}</button>`).join("")}</div>
    <p class="h4"><label for="ed-text">Текст · правится здесь</label></p>
    <textarea id="ed-text" rows="3" spellcheck="true">${esc(E.text)}</textarea>
    <p class="ifo-cnt"><span>Из данных: номер, маршрут, станция, время</span><span id="ed-cnt">${cntTxt(E.text.length)}</span></p>
    <p class="h4">Каналы</p><div class="ifo-ch">${CH.map(c => `<label><input type="checkbox" data-ch="${c}"${E.ch.has(c) ? " checked" : ""}><b>${c === "SMS" ? c : cap(c)}</b><span class="sec">${esc(rc[c])}</span></label>`).join("")}</div>
    <p class="h4">Так будет на табло</p><p class="ifo-board" id="ed-board">${esc(boardLine(q, E.tpl === "own" ? tplOf(q) : E.tpl))}</p>
    <div class="ifo-act"><span class="sec">Объявляет кнопка «Объявить выбранные» в «Прибытии»</span><button type="button" class="pbtn" id="ed-reset">Вернуть шаблон</button><button type="button" class="pbtn pri" id="ed-save">Сохранить текст</button></div>
  </section>`;
}
function renderInfoMain() {
  const n = nsl[0], top = {};
  for (const w of ["d", "a"]) top[w] = $("#info #ifo-scroll-" + w)?.scrollTop;
  rm.classList.toggle("info-ns", !!n);
  $("#info").innerHTML = infoPanel("d") + infoPanel("a");
  infoBody("d"); infoBody("a");
  for (const w of ["a"]) { const b = $("#info #ifo-scroll-" + w); if (top[w] != null && b) b.scrollTop = top[w]; }
  // отправления: при новой смене или фильтре – к ближайшим (три ушедших сверху), иначе – где были
  const key = `${S.source}|${S.seed}|${S.data.time}|${ui.side.d}|${ui.isort.d.k}${ui.isort.d.dir}|${ui.iq.d}`, box = $("#ifo-scroll-d");
  if (key !== ifoKey) { ifoKey = key; const L = infoList("d"), k = ui.isort.d.k === "rel" && ui.isort.d.dir > 0 ? Math.max(0, L.findIndex(q => q.status !== "ушёл") - 3) : 0, row = box.querySelectorAll("tbody tr")[k];
    box.scrollTop = row ? row.offsetTop - box.querySelector("thead").offsetHeight : 0; }
  else if (top.d != null) box.scrollTop = top.d;
}
function renderInfoRight() {
  const x = ui.sel && findTrain(ui.sel), q = ui.edit && findQ(ui.edit), top = $("#right #ifo-scroll-j")?.scrollTop;
  if (x) { $("#right").innerHTML = passHtml(x); return; }
  if (q) { $("#right").innerHTML = editorHtml(q); return; }
  if (ui.edit) { ui.edit = null; ui.ed = null; }
  $("#right").innerHTML = nsl[0] ? nsCarHtml(nsl[0]) : journalHtml() + citiesHtml();
  const b = $("#right #ifo-scroll-j"); if (top != null && b) b.scrollTop = top;
}
function openEdit(key) {
  const q = findQ(key); if (!q) return;
  const saved = S.data.annText?.[key];
  ui.sel = null; ui.edit = key;
  ui.ed = { tpl: saved?.tpl || tplOf(q), text: saved?.text || annText(q, tplOf(q), toMin(S.data.time)), ch: new Set(saved?.ch || q.ch) };
  renderInfoMain(); renderInfoRight();
  $("#ed-text")?.focus();
}
function closeEdit() { ui.edit = null; ui.ed = null; renderInfoMain(); renderInfoRight(); }
function announce() {
  const d = S.data; d.ann = d.ann || {};
  for (const q of annSel()) d.ann[q.key] = { at: d.time, delay: q.delay, ns: q.kind === "ns" };
  ui.qOff.clear(); commit();
}
function exportInfo(w) {
  const L = infoList(w), annTxt = q => { const t = document.createElement("div"); t.innerHTML = annCell(q); return t.textContent.replace(/\s+/g, " ").trim(); };
  const rows = w === "d" ? [["Поезд", "Маршрут", "Станция формирования", "Отпр. план", "Задержка", "Новое / факт", "Статус", "Пассажиров", "Путь", "Оповещение"],
      ...L.map(q => [q.id, q.route, q.at, q.plan, q.delay ? fmtDelay(q.delay) : "", q.newT, q.status, q.pax, q.status === "по графику" ? "" : q.track, annTxt(q)])]
    : [["Поезд", "Маршрут", "Опоздание", "Следующая станция", "План, местн.", "Прогноз, местн.", "Пояс", "Конечная", "Прогноз на конечной, местн.", "Пассажиров", "Отметки", "Оповещение"],
      ...L.map(q => [q.id, q.route, (q.ns ? "НС " : "") + fmtDelay(q.x.delay), q.ns ? q.at : q.next, q.planN, q.ns ? "не определён" : q.progN, `UTC+${q.tzN}`, q.final, q.ns ? "" : q.progE, q.pax, [q.ns && "НС", q.kids && "дети", q.ctl && "контроль"].filter(Boolean).join(", "), annTxt(q)])];
  download(`${w === "d" ? "отправления" : "прибытие"}_${ui.side[w]}_${S.data.time.replace(":", "-")}.csv`, rows.map(r => r.map(csvCell).join(";")).join("\r\n"), "text/csv;charset=utf-8");
}
function infoClick(e) {
  const t = e.target, stop = () => { e.stopPropagation(); e.preventDefault(); };
  if (t.closest(".ifo-ck,input,textarea,.ifo-ch label")) return;
  const side = t.closest("[data-side]")?.dataset.side;
  if (side) { const [w, k] = side.split(":"); ui.side[w] = k; if (w === "a") ui.f.poly = k === "all" ? null : new Set(sidePolys(k)); stop(); render(); $(`[data-side="${side}"]`)?.focus(); return; }
  const so = t.closest("[data-isort]")?.dataset.isort;
  if (so) { const [w, k] = so.split(":"), s = ui.isort[w];
    if (s.k === k) s.dir = -s.dir; else ui.isort[w] = { k, dir: ["delay", "pax"].includes(k) ? -1 : 1 }; stop(); renderInfoMain(); $(`[data-isort="${so}"]`)?.focus(); return; }
  const ex = t.closest("[data-iexp]")?.dataset.iexp; if (ex) { stop(); exportInfo(ex); return; }
  if (t.closest("#q-ann")) { stop(); announce(); return; }
  if (t.closest("#j-exp")) { stop(); exportJournal(); return; }
  const tp = t.closest("[data-tpl]")?.dataset.tpl;
  if (tp && ui.ed) { const q = findQ(ui.edit); ui.ed.tpl = tp; if (tp !== "own") ui.ed.text = annText(q, tp, toMin(S.data.time)); stop(); renderInfoRight(); $("#ed-text")?.focus(); return; }
  const bid = t.closest("button")?.id;
  if (bid === "ed-close") { stop(); closeEdit(); return; }
  if (bid === "ed-reset" && ui.ed) { const q = findQ(ui.edit); ui.ed.tpl = tplOf(q); ui.ed.text = annText(q, ui.ed.tpl, toMin(S.data.time)); stop(); renderInfoRight(); return; }
  if (bid === "ed-save" && ui.ed) { const d = S.data; d.annText = d.annText || {}; d.annText[ui.edit] = { text: ui.ed.text.trim(), tpl: ui.ed.tpl, ch: CH.filter(c => ui.ed.ch.has(c)) };
    ui.edit = null; ui.ed = null; stop(); commit(); return; }
  const ed = t.closest("[data-edit]")?.dataset.edit; if (ed) { stop(); if (ui.edit === ed) closeEdit(); else openEdit(ed); return; }
  const id = t.closest("#info tr[data-id]")?.dataset.id; if (id) { stop(); ui.edit = null; ui.ed = null; if (ui.sel === id) select(null); else { ui.tab = "gen"; select(id); } }
}
function infoChange(e) {
  const k = e.target.dataset.q;
  if (k != null) { if (e.target.checked) ui.qOff.delete(k); else ui.qOff.add(k);
    $(`#info tr[data-qrow="${CSS.escape(k)}"]`)?.classList.toggle("off", !e.target.checked);
    const n = annSel().length, b = $("#q-ann"); if (b) { b.textContent = `Объявить выбранные · ${n}`; b.disabled = !n; } return; }
  const c = e.target.dataset.ch; if (c != null && ui.ed) { if (e.target.checked) ui.ed.ch.add(c); else ui.ed.ch.delete(c); }
}
function infoInput(e) {
  const w = e.target.dataset.iq; if (w) { ui.iq[w] = e.target.value; infoBody(w); $("#ifo-scroll-" + w).scrollTop = 0; return; }
  if (e.target.id === "ed-text" && ui.ed) { ui.ed.text = e.target.value; $("#ed-cnt").textContent = cntTxt(ui.ed.text.length); }
}

// ---------- паспорт ----------
const ck = v => v ? mk.g(24) : '<span class="mut">–</span>';
function passHtml(x) {
  const P = passport(x, S.data, stations, isSample()), ns = nsIds.has(x.id), l = lvl(x, ns);
  const nsRec = nsl.find(n => n.train === x.id), nsCarN = carOfNs(nsRec);
  const lvTxt = ns ? `нештатная ситуация · ${nsRec.kind}` : x.delay > 240 ? "опоздание более 4 ч · критично" : x.delay >= 60 ? "опоздание 1–4 ч" : x.delay > 5 ? "опоздание до 1 ч" : x.delay < 0 ? "раньше графика" : "по графику";
  const tabs = [["gen", "Общее"], ["comp", "Состав"], ["ops", "Техоперации"]];
  let body;
  if (ui.tab === "gen") {
    const pct = Math.round(P.done / P.total * 100);
    body = `<div class="big ${l === "ok" ? "" : l}">${lvMk(l, 52)}<div><p class="d ${lvCls(l)}">${fmtDelay(x.delay)}</p><p>${lvTxt}</p></div>
      <div class="r2">${x.stale ? `<p class="org" style="font-weight:600">${mk.o(20)}данные ${esc(x.upd)}, устарели на ${((toMin(S.data.time) - toMin(x.upd)) + 1440) % 1440} мин</p>` : `<p class="sec">данные ${esc(x.upd)}</p>`}
      <p class="sec">последняя станция: ${esc(x.station)}</p></div></div>
      <div class="prog"><p class="now">${esc(x.station)} · ${v1(x.v)} км/ч${x.stop ? ` · ${x.stop}` : ""}</p>
      <div class="bar2 ${l === "ok" ? "ok" : l}"><i style="width:${pct}%"></i></div>
      <div class="ends"><p><b>${esc(P.from)}</b><span class="sec">отпр. ${P.dep}</span></p>
      <p class="c">пройдено ${nf(P.done)} км · осталось ${nf(P.left)} км<br>в пути ${P.onWay} · всего ${nf(P.total)} км</p>
      <p class="e"><b>${esc(P.to)}</b><span class="sec">по графику ${P.arr}</span></p></div></div>
      <div class="kv">
        <div><p>Категория</p><p>${esc(x.cat)}</p></div><div><p>Дорога · полигон</p><p>${esc(x.road)} · ${x.poly}</p></div>
        <div><p>Вагонов · пассажиров</p><p>${x.cars} · ${nf(x.pax)}</p></div><div><p>Прогноз прибытия в ${esc(P.to)}</p><p class="${x.delay > 5 ? lvCls(l) : ""}">${P.forecast}</p></div>
        <div><p>Предприятие формирования</p><p>${esc(P.firm)}</p></div><div><p>На контроле</p><p>${x.ctl || "нет"}</p></div>
        <div><p>Дети в поезде</p><p>${P.kidsTotal ? `да, ${P.kidsTotal} до 5 лет` : "нет"}</p></div><div><p>Источник данных</p><p class="${x.stale ? "org" : ""}">${esc(P.source)}</p></div>
      </div>
      <p class="h3">Бригада и связь</p>
      <div class="kv">
        <div><p>Начальник поезда (ЛНП)</p><p>${esc(P.chief)}</p></div><div><p>Спутниковый телефон</p><p>${P.phone}</p></div>
        <div><p>Штабной вагон · ВР</p><p>${P.staff}</p></div><div><p>Бригада поезда</p><p>${P.crewSize} ${plural(P.crewSize, "человек", "человека", "человек")}</p></div>
        <div class="w2"><p>Локомотивная бригада</p><p>${esc(P.loco)}</p></div><div class="w2"><p>Смена бригады</p><p>${esc(P.crewChange)}</p></div>
      </div>`;
  } else if (ui.tab === "comp") {
    const seats = P.comp.reduce((a, c) => a + c.seats, 0), kids = P.comp.reduce((a, c) => a + c.kids, 0);
    const legend = [...new Set(x.types.map(t => CAR_SHORT[t]))].map(t => `${t} – ${CAR_FULL[t].toLowerCase()}`).join(", ");
    body = `<p class="cs">${x.cars} ${plural(x.cars, "вагон", "вагона", "вагонов")} · ${nf(x.pax)} ${plural(x.pax, "пассажир", "пассажира", "пассажиров")} · детей ${kids || "нет"} · бригада ${P.crewSize} ${plural(P.crewSize, "человек", "человека", "человек")} · нумерация от головы. ${legend}${P.comp.some(c => c.note === "штабной") ? ", ШТ – штабной" : ""}</p>
      <div class="strip"><span>Л<small>лок.</small></span>${P.comp.map(c => `<span${c.n === nsCarN ? ' class="ns" title="НС в этом вагоне"' : ""}>${c.n}<small>${c.note === "штабной" ? "ШТ" : CAR_SHORT[c.type]}</small></span>`).join("")}</div>
      <table><colgroup><col style="width:70px"><col style="width:180px"><col style="width:220px"><col style="width:100px"><col style="width:120px"><col style="width:150px"><col></colgroup>
      <thead><tr><th>№</th><th>Номер вагона</th><th>Тип</th><th class="r">Мест</th><th class="r">Пасс.</th><th class="r">Детей до 5</th><th>Особенности</th></tr></thead><tbody>
      ${P.comp.map(c => `<tr${c.n === nsCarN ? ' class="ns"' : ""}><td><b>${c.n}</b></td><td class="sec">${c.num}</td><td>${CAR_FULL[c.type]}</td><td class="r">${c.seats || "–"}</td><td class="r">${c.pax}</td><td class="r ${c.kids ? "" : "mut"}">${c.kids}</td><td class="sec">${c.n === nsCarN ? `<b class="red">НС · ${esc(nsRec.kind.split(" · ")[0])}</b>${c.note ? " · " + c.note : ""}` : c.note}</td></tr>`).join("")}
      <tr class="sum"><td>Σ</td><td>${x.cars} ${plural(x.cars, "вагон", "вагона", "вагонов")}</td><td></td><td class="r">${nf(seats)}</td><td class="r">${nf(x.pax)}</td><td class="r">${kids}</td><td class="sec">бригада ${P.crewSize}</td></tr></tbody></table>`;
  } else {
    const sel = ui.op != null && P.ops[ui.op] ? ui.op : P.next, o = P.ops[sel], late = Math.max(0, x.delay);
    body = `<div class="kpis"><div><b>${P.ops.length}</b><span>${plural(P.ops.length, "станция", "станции", "станций")}</span></div><div><b>${P.cur + 1}</b><span>пройдены</span></div>
      <div><b>${esc(P.ops[P.next].station)}</b><span>следующая</span></div><div><b class="${lvCls(l)}">${fmtDelay(x.delay)}</b><span>к плану</span></div></div>
      <table class="ops"><colgroup><col style="width:215px"><col style="width:235px"><col style="width:110px"><col span="6" style="width:92px"><col></colgroup>
      <thead><tr><th>Время работ (план)</th><th>Станция</th><th class="r">Стоянка</th>${WORKS.map(w => `<th class="ck">${w[1]}</th>`).join("")}<th>Статус</th></tr></thead><tbody>
      ${P.ops.map((op, i) => `<tr data-op="${i}" class="${i === sel ? "sel" : ""}"><td class="sec">${op.time}</td><td><b>${esc(op.station)}</b></td><td class="r">${op.stay} мин</td>
        ${WORKS.map(w => `<td class="ck">${ck(op.works[w[0]])}</td>`).join("")}<td class="${i === sel ? "blue" : "sec"}">${op.status}</td></tr>`).join("")}</tbody></table>
      <p class="cs" style="margin-top:8px">Время&nbsp;– московское. ЭЧТК&nbsp;– обслуживание туалетных комплексов, ТБО&nbsp;– сбор бытовых отходов, топливо&nbsp;– для&nbsp;локомотива.</p>
      <div class="opcard"><p><b style="font-size:24px">${esc(o.station)} · стоянка</b> <span class="${o.done ? "sec" : "blue"}">${o.status}</span></p>
        <div class="g"><div><p>Прибытие · план</p><p>${P.day(o.from)} · ${hm(o.from)}</p></div><div><p>Отправление · план</p><p>${P.day(o.to)} · ${hm(o.to)}</p></div>
        <div><p>Прибытие · ${o.done ? "факт" : "прогноз"}</p><p class="${!o.done && late > 5 ? lvCls(l) : ""}">${P.day(o.fFrom)} · ${hm(o.fFrom)}</p></div>
        <div><p>Отправление · ${o.done ? "факт" : "прогноз"}</p><p class="${!o.done && late > 5 ? lvCls(l) : ""}">${P.day(o.fTo)} · ${hm(o.fTo)}</p></div></div>
        <p class="cs">${P.workText(o)}${o.done ? "" : ` · прогноз при сохранении ${fmtDelay(x.delay)}`}</p></div>`;
  }
  return `<section class="pass" aria-label="Паспорт поезда ${esc(x.id)}">
    <div class="ph"><h2>Паспорт · ${esc(x.id)}</h2><span class="sec">${esc(x.cat)} · ${esc(x.route)}</span><button type="button" class="close" id="p-close">✕ Закрыть · Esc</button></div>
    <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${t}</button>`).join("")}</div>
    <div class="pb">${body}</div>
      <div class="pact"><button type="button" class="pbtn" id="p-export">Выгрузить паспорт</button>
        <button type="button" class="pbtn" id="p-ctl">${x.ctl ? "Снять с контроля" : "Поставить на контроль"}</button>
        <button type="button" class="pbtn ns${ns ? " on" : ""}" id="p-ns">${ns ? "Снять НС" : "Сообщить о НС"}</button></div>
    </section>`;
}

function render() {
  recompute();
  if (ui.sel && !findTrain(ui.sel)) ui.sel = null;
  if (LEAD) { renderAlarm(); renderTime(); renderLeadMain(); renderRight(renderLate()); renderStat(); return; }
  if (INFRA) { renderAlarm(); renderTime(); renderInfraNow(); renderList(); renderRight(); renderStat(); return; }
  if (INFO) { renderAlarm(); renderTime(); renderInfoMain(); renderRight(renderLate()); renderStat(); return; }
  renderAlarm(); renderTime(); renderList();
  renderRight(renderLate());
  renderStat();
  window.__rm = { S, ui, view: view.length, ns: nsl.map(n => n.train) };
}
function renderStat() {
  const d = S.data, mine = scope().flatMap(p => ALL[p]), lateN = mine.filter(x => x.delay > 5).length;
  const src = isSample() ? "смена из макета" : S.source === "seed" ? `${S.heavy ? "загруженная" : "случайная"} смена №${S.seed}` : "свои данные";
  const what = INFO ? `ждут оповещения <b>${annSel().length}</b>, объявлено за смену <b>${Object.keys(d.ann || {}).length}</b>` : INFRA ? `действует событий <b>${INF.now.length}</b>, отказов <b>${INF.now.filter(e => e.lvl !== "amb").length}</b>, записей в журнале <b>${INF.journal.length}</b>` : CREWS ? `бригад на линии <b>${mine.length}</b>, превышение <b>${mine.filter(x => x.crew.over > 0).length}</b>, близко к концу работы <b>${mine.filter(x => x.crew.over <= 0 && x.crew.left < 60).length}</b>`
    : `в пути <b>${mine.length}</b>, опаздывают <b>${lateN}</b>`;
  $("#stat").innerHTML = `${src} · ${d.time} · ${scopeLabel()}: ${what}${nsl.length ? ` · НС: <b>${nsl.map(n => n.train).join(", ")}</b>` : ""} · смена общая с окном ТКП`;
  $("#ns").setAttribute("aria-pressed", S.mode !== "norm");
  $("#ns-txt").textContent = MODE_TXT[S.mode];
  $("#heavy").setAttribute("aria-pressed", S.source === "seed" && S.heavy);
  window.__rm = { S, ui, view: view.length, ns: nsl.map(n => n.train) };
}
// изменение общей смены: записать для других окон и перерисовать
function commit() { publishShift(S); render(); }
function load(source, seed) {
  S.source = source; S.added = [];
  if (source === "sample") S.data = structuredClone(SAMPLE);
  else { S.seed = seed; S.data = generate(seed, stations, { heavy: S.heavy }); }
  ui.sel = null; ui.edit = null; ui.ed = null; ui.qOff.clear(); tbl.scrollTop = 0;
  commit();
  if (CREWS && view[0]) select(view[0].id);
}
function adopt(v) {
  S = { source: v.source, seed: v.seed || 0, heavy: !!v.heavy, mode: MODES.includes(v.mode) ? v.mode : "norm", data: v.data, added: v.added || [] };
  render();
}

// ---------- действия РМ ----------
function select(id, scroll) {
  ui.sel = id; ui.op = null;
  if (INFRA) { renderInfraNow(); renderList(); renderInfraRight(); return; }
  if (INFO) { if (id) { ui.edit = null; ui.ed = null; } renderInfoMain(); renderInfoRight(); if (scroll && id) $(`#info tr[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" }); return; }
  tb.querySelectorAll("tr.sel").forEach(r => { r.classList.remove("sel"); r.setAttribute("aria-selected", "false"); });
  const tr = id && tb.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
  if (tr) { tr.classList.add("sel"); tr.setAttribute("aria-selected", "true"); if (scroll) tr.scrollIntoView({ block: "nearest" }); }
  if (LEAD) renderLeadMain();
  renderRight(CREWS ? null : blocks());
}
function toggleNs(x) {
  const d = S.data;
  if (!Array.isArray(d.ns)) d.ns = d.ns ? [d.ns] : [];
  d.rmAdded = d.rmAdded || [];
  if (nsIds.has(x.id)) {
    d.ns = d.ns.filter(n => n.train !== x.id);
    if (d.rmAdded.includes(x.id)) { d.trains = d.trains.filter(t => t.id !== x.id); d.rmAdded = d.rmAdded.filter(i => i !== x.id); }
    if (!nsList(d, S.mode).length) S.mode = "norm";
  } else {
    if (!d.trains.some(t => t.id === x.id)) { d.trains.push(toShiftTrain(x, stations)); d.rmAdded.push(x.id); }
    const n = { train: x.id, kind: "сообщено с РМ мониторинга", since: d.time, mins: 0,
      facts: [[`${x.stop || "В пути"} · ${x.station}`], ["Задержка ", `${Math.max(0, x.delay)} мин`, "amber"], ["Новое время – уточняется"],
              [`${nf(x.pax)} ${plural(x.pax, "пассажир", "пассажира", "пассажиров")} в поезде`]],
      log: [[d.time, `сообщено с РМ мониторинга ${x.poly}`], [hm(toMin(d.time) + 10), "решение руководителя смены", "next"]] };
    d.ns = d.ns.filter(m => m.train !== x.id);
    // режим «нет НС» → «одна НС» с этой; иначе – добавить к уже показанным
    if (S.mode === "norm") { d.ns.unshift(n); S.mode = "ns"; } else { d.ns.push(n); S.mode = "multi"; }
  }
  commit();
}
function toggleCtl(x) {
  const d = S.data; d.ctl = (d.ctl || []).filter(i => i !== x.id); d.unctl = (d.unctl || []).filter(i => i !== x.id);
  if (x.ctl) d.unctl.push(x.id); else d.ctl.push(x.id);
  // сводка смены (её показывает ТКП) – по фактическим отметкам; расстановка остальных поездов не меняется (ctlBase)
  if (!d.ctlBase) d.ctlBase = [...d.summary.control];
  recompute();
  const all = POLYS.flatMap(p => ALL[p]);
  d.summary.control = [all.filter(t => t.ctl === "постоянный").length, all.filter(t => t.ctl === "оперативный").length];
  commit();
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csvCell = v => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
function exportList() {
  if (INFRA) {
    const rows = view.map(x => [x.t, x.no, x.kind, x.dir, x.poly, x.where, x.what, x.res]);
    return download(`журнал_инфраструктуры_${S.data.time.replace(":", "-")}.csv`, [["Время", "№", "Событие", "Направление", "Полигон", "Перегон", "Что произошло", "Итог"], ...rows].map(r => r.map(csvCell).join(";")).join("\r\n"), "text/csv;charset=utf-8");
  }
  if (CREWS) {
    const head = ["Поезд", "Опоздание", "Где сейчас", "Машинист", "Помощник", "Депо", "Явка", "Отработано", "Станция смены", "Смена ожид.", "Смена план", "Телефон машиниста", "Статус"];
    const rows = view.map(x => { const k = x.crew; return [x.id, fmtDelay(x.delay), x.station, k.driver, k.assist, k.depot, hm(k.start), dur(k.worked), k.station, hm(k.exp), hm(k.plan), k.phone,
      k.over > 0 ? `превышение ${dur(k.over)}` : k.left < 60 ? `до конца работы ${dur(k.left)}` : k.status]; });
    return download(`бригады_${scopeLabel().replace(/, /g, "+").replace(/ /g, "_")}_${S.data.time.replace(":", "-")}.csv`, [head, ...rows].map(r => r.map(csvCell).join(";")).join("\r\n"), "text/csv;charset=utf-8");
  }
  const head = ["Поезд", "Категория", "Маршрут", "Дорога", "Полигон", "Станция", "Скорость, км/ч", "Опоздание", "Обновлено", "Вагонов", "Пассажиров", "Отметки"];
  const rows = view.map(x => [x.id, x.cat, x.route, x.road, x.poly, x.station, v1(x.v), fmtDelay(x.delay), x.upd, x.cars, x.pax,
    [nsIds.has(x.id) && "НС", x.stale && `данные ${x.upd}`, x.ctl && "на контроле", x.kids && "дети", x.stop].filter(Boolean).join(", ")]);
  download(`поезда_${scopeLabel().replace(/, /g, "+").replace(/ /g, "_")}_${S.data.time.replace(":", "-")}.csv`, [head, ...rows].map(r => r.map(csvCell).join(";")).join("\r\n"), "text/csv;charset=utf-8");
}
function exportPass(x) {
  const P = passport(x, S.data, stations, isSample());
  const L = [`Паспорт поезда ${x.id} · ${x.cat} · ${x.route}`, `Смена ${S.data.date}, ${S.data.time}`, "",
    `Опоздание: ${fmtDelay(x.delay)}${nsIds.has(x.id) ? " · НС" : ""}`, `Последняя станция: ${x.station}, ${v1(x.v)} км/ч, данные ${x.upd}`,
    `Отправление: ${P.from}, ${P.dep} · Прибытие по графику: ${P.to}, ${P.arr} · Прогноз: ${P.forecast}`,
    `Пройдено ${P.done} км из ${P.total}`, `Дорога: ${x.road} · полигон ${x.poly}`, `Вагонов ${x.cars} · пассажиров ${x.pax} · на контроле: ${x.ctl || "нет"}`,
    `ЛНП ${P.chief}, ${P.phone} · штабной вагон · ВР ${P.staff} · бригада ${P.crewSize} · локомотивная бригада ${P.loco} · смена бригады ${P.crewChange}`,
    "", "Состав:", ...P.comp.map(c => `${c.n}\t${c.num}\t${CAR_FULL[c.type]}\tмест ${c.seats}\tпасс. ${c.pax}\tдетей ${c.kids}\t${c.note}`),
    "", "Техоперации (план, московское время):", ...P.ops.map(o => `${o.time}\t${o.station}\t${o.stay} мин\t${o.list.join(", ") || "–"}\t${o.status}`)];
  download(`паспорт_${x.id}.txt`, L.join("\r\n"), "text/plain;charset=utf-8");
}

// ---------- события ----------
// щелчок по строке открывает паспорт, повторный щелчок по той же строке – закрывает
tb.addEventListener("click", e => {
  // журнал инфраструктуры: строка показывает своё событие в карточке справа
  if (INFRA) { const ev = e.target.closest("tr[data-ev]")?.dataset.ev; if (ev) select(ev); return; }
  const id = e.target.closest("tr[data-id]")?.dataset.id; if (!id) return; if (ui.sel === id) select(null); else { ui.tab = "gen"; select(id); } });
$("#right").addEventListener("click", e => {
  const cs = e.target.closest("tr[data-sel]")?.dataset.sel; if (cs) { select(ui.sel === cs ? null : cs, true); return; }
  const iev = INFRA && e.target.closest("[data-ev]")?.dataset.ev; if (iev) { select(iev); return; }
  const po = e.target.closest("[data-open]"); if (po) { ui.tab = po.dataset.tab || "gen"; select(po.dataset.open); return; }
  const ds = e.target.closest("[data-ds]")?.dataset.ds;
  if (ds) { if (ui.ds.k === ds) ui.ds.dir = -ui.ds.dir; else ui.ds = { k: ds, dir: DCOLS.find(c => c[1] === ds)[3] }; renderRight(blocks()); return; }
  const df = e.target.closest("[data-df]")?.dataset.df; if (df) { e.stopPropagation(); openMenu("d:" + df); return; }
  if (e.target.closest("[data-dreset]")) { ui.df = { station: null, route: null, late: null, status: null }; ui.ds = DS0(); renderRight(blocks()); return; }
  const x = findTrain(ui.sel);
  const t = e.target.closest("[data-tab]"); if (t) { ui.tab = t.dataset.tab; renderRight(); return; }
  const op = e.target.closest("tr[data-op]"); if (op) { ui.op = +op.dataset.op; renderRight(); return; }
  const id = e.target.closest("button")?.id;
  if (id === "p-close") select(null);
  else if (id === "p-export" && x) exportPass(x);
  else if (id === "p-ns" && x) toggleNs(x);
  else if (id === "p-ctl" && x) toggleCtl(x);
});
// сортировка: кнопки над таблицей и названия колонок – одно состояние
function setSort(k, dir) {
  if (ui.sort === k) ui.dir = -ui.dir; else { ui.sort = k; ui.dir = dir; }
  renderList(); tbl.scrollTop = 0;
}
$("#sort").addEventListener("click", e => {
  const k = e.target.closest("[data-sort]")?.dataset.sort; if (k) setSort(k, SORTS.find(s => s[0] === k)[2]);
});
// ---------- меню фильтра колонки ----------
// таблица меню: основная (ключ «cat») или отправления («d:status»)
const isDep = key => String(key).startsWith("d:");
const MT = key => isDep(key)
  ? { k: key.slice(2), defs: DFILTERS, state: ui.df, facet: dfacet, anchor: k => $(`#dep-th [data-df="${k}"]`), redraw: () => renderRight(blocks()) }
  : { k: key, defs: FILTERS, state: ui.f, facet, anchor: k => $(`#th [data-f="${k}"]`), redraw: () => { tbl.scrollTop = 0; renderList(); } };
function renderMenu() {
  const key = ui.fOpen; if (!key) { fmenu.hidden = true; return; }
  const m = MT(key), k = m.k, th = m.anchor(k)?.closest("th") || $(`#chips [data-f="${k}"]`)?.closest(".fchip");
  if (!th) { fmenu.hidden = true; return; }
  const vals = m.facet(k), sel = m.state[k];
  fmenu.innerHTML = `<div class="fm-h"><b>${m.defs[k].title}</b><button type="button" class="link" data-all>Все</button><button type="button" class="fm-x" data-close aria-label="Закрыть">×</button></div>
    <ul>${vals.map(([v, n]) => `<li><label><input type="checkbox" data-v="${esc(v)}"${!sel || sel.has(v) ? " checked" : ""}><span class="${v === "НС" ? "red" : ""}">${esc(v)}</span><span class="n">${n}</span></label><button type="button" class="only" data-only="${esc(v)}">только</button></li>`).join("")}</ul>`;
  // координаты экрана РМ (он масштабирован под окно)
  const r = th.getBoundingClientRect(), rr = rm.getBoundingClientRect(), sc = rr.width / 4080;
  fmenu.hidden = false;
  fmenu.style.left = Math.min((r.left - rr.left) / sc, 4080 - fmenu.offsetWidth - 12) + "px";
  fmenu.style.top = Math.min((r.bottom - rr.top) / sc + 4, 1536 - fmenu.offsetHeight - 8) + "px";
}
function openMenu(key) {
  const prev = ui.fOpen; ui.fOpen = prev === key ? null : key;
  if (prev && isDep(prev) !== isDep(key)) MT(prev).redraw();
  MT(key).redraw(); renderMenu();
  if (ui.fOpen) fmenu.querySelector("input")?.focus();
}
function closeMenu() {
  if (!ui.fOpen) return; const key = ui.fOpen, m = MT(key); ui.fOpen = null; fmenu.hidden = true; m.redraw(); m.anchor(m.k)?.focus();
}
function setF(key, set) {
  const m = MT(key), all = m.facet(m.k).map(v => v[0]);
  m.state[m.k] = set && !(set.size === all.length && all.every(v => set.has(v))) ? set : null;
  m.redraw(); if (ui.fOpen) renderMenu();
}
$("#th").addEventListener("click", e => {
  const k = e.target.closest("[data-f]")?.dataset.f; if (k) { e.stopPropagation(); openMenu(k); return; }
  const c = e.target.closest("[data-csort]")?.dataset.csort; if (c) { const col = COLS.find(x => x[3] === c); setSort(c, col[4]); $(`#th [data-csort="${c}"]`)?.focus(); }
});
// ---------- отправления: колонки, фильтры, сортировка ----------
const FUNNEL = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
const DSTATUS = ["ушёл", "посадка", "задержан", "по графику"];
const DFILTERS = {
  route: { title: "Маршрут", val: x => [x.route] },
  station: { title: "Станция", val: x => [x.station] },
  late: { title: "Задержка", val: x => [x.late ? "с задержкой" : "без задержки"], order: ["с задержкой", "без задержки"] },
  status: { title: "Статус", val: x => [x.status], order: DSTATUS },
};
// [заголовок, ключ сортировки, фильтр, направление по умолчанию]
const DCOLS = [["Поезд", "id", null, 1], ["Маршрут", "route", "route", 1], ["Станция", "station", "station", 1], ["Отпр.", "t", null, 1], ["Задержка", "late", "late", -1], ["Статус", "status", "status", 1]];
const DKEY = { id: x => num(x.id), route: x => x.route, station: x => x.station, t: x => x.rel, late: x => x.late, status: x => DSTATUS.indexOf(x.status) };
let lastB = null;
const passD = (x, k) => !ui.df[k] || DFILTERS[k].val(x).some(v => ui.df[k].has(v));
function depView(dep) {
  const key = DKEY[ui.ds.k], cmp = (a, b) => { const p = key(a), q = key(b); return typeof p === "string" ? p.localeCompare(q, "ru") : p - q; };
  return dep.filter(x => Object.keys(DFILTERS).every(k => passD(x, k))).sort((a, b) => cmp(a, b) * ui.ds.dir || a.rel - b.rel);
}
function dfacet(k) {
  const dep = (lastB || blocks()).dep, cnt = new Map();
  for (const x of dep) for (const v of DFILTERS[k].val(x)) if (!cnt.has(v)) cnt.set(v, 0);
  for (const x of dep.filter(x => Object.keys(DFILTERS).every(j => j === k || passD(x, j)))) for (const v of DFILTERS[k].val(x)) cnt.set(v, cnt.get(v) + 1);
  const ord = DFILTERS[k].order;
  return [...cnt].sort((a, b) => ord ? ord.indexOf(a[0]) - ord.indexOf(b[0]) : a[0].localeCompare(b[0], "ru"));
}
$("#chips").addEventListener("click", e => {
  const c = e.target.closest("[data-clear]")?.dataset.clear; if (c) { e.stopPropagation(); setF(c, null); return; }
  const k = e.target.closest("[data-f]")?.dataset.f; if (k) { e.stopPropagation(); openMenu(k); }
});
fmenu.addEventListener("click", e => {
  e.stopPropagation();
  const k = ui.fOpen, b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.close != null) closeMenu();
  else if (b.dataset.all != null) setF(k, null);
  else if (b.dataset.only != null) setF(k, new Set([b.dataset.only]));
});
fmenu.addEventListener("change", e => {
  const k = ui.fOpen, v = e.target.dataset.v; if (v == null) return;
  const m = MT(k), set = new Set(m.state[m.k] || m.facet(m.k).map(x => x[0]));
  e.target.checked ? set.add(v) : set.delete(v);
  setF(k, set);
  fmenu.querySelector(`input[data-v="${CSS.escape(v)}"]`)?.focus();
});
document.addEventListener("click", e => { if (ui.fOpen && !e.target.closest("#fmenu")) closeMenu(); });
$("#reset").onclick = () => { ui.f = F0(); ui.fOpen = null; ui.q = ""; $("#q").value = ""; [ui.sort, , ui.dir] = SORTS[0]; tbl.scrollTop = 0; renderList(); };
$("#q").addEventListener("input", e => { ui.q = e.target.value; tbl.scrollTop = 0; renderList(); });
$("#export").onclick = exportList;
const newSeed = () => 1 + Math.floor(Math.random() * 99999);
$("#rand").onclick = () => { S.heavy = false; load("seed", newSeed()); };
$("#heavy").onclick = () => { S.heavy = true; load("seed", newSeed()); };
$("#sample").onclick = () => load("sample");
$("#ns").onclick = () => { S.mode = MODES[(MODES.indexOf(S.mode) + 1) % 3]; commit(); };
$("#full").onclick = () => togglePresent();

// тема – общая с ТКП
const THEMES = { dark: "Тема: тёмная", light: "Тема: светлая" };
let theme = params.get("theme") === "light" || (!params.get("theme") && lsGet("tkp-theme") === "light") ? "light" : "dark";
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  $("#theme-txt").textContent = THEMES[theme];
  $("#theme").setAttribute("aria-pressed", theme === "light");
}
$("#theme").onclick = () => { theme = theme === "light" ? "dark" : "light"; lsSet("tkp-theme", theme); applyTheme(); };
applyTheme();

function fit() { rm.style.transform = `scale(${wrap.clientWidth / 4080})`; }
new ResizeObserver(fit).observe(wrap);
function togglePresent() {
  document.body.classList.toggle("present");
  if (document.body.classList.contains("present")) document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen();
  fit();
}
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) document.body.classList.remove("present"); fit(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { if (ui.fOpen) closeMenu(); else if (INFO && ui.edit) closeEdit(); else if (e.target.id === "q" && ui.q) { e.target.value = ""; ui.q = ""; renderList(); } else if (ui.sel) select(null); return; }
  if (e.target.closest?.("input,select,textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    // инфраструктура: стрелки листают действующие события
    const L = INFRA ? INF.now : INFO ? infoList("a") : view, cur = INFRA ? curEv()?.id : ui.sel;
    const i = L.findIndex(x => x.id === cur), j = Math.max(0, Math.min(L.length - 1, i < 0 ? 0 : i + (e.key === "ArrowDown" ? 1 : -1)));
    if (L[j]) select(L[j].id, true);
  }
  else if (!CREWS && ui.sel && ["1", "2", "3"].includes(k)) { ui.tab = ["gen", "comp", "ops"][+k - 1]; renderRight(); }
  else if (k === "/") { e.preventDefault(); $("#q").focus(); }
  else if (k === "r" || k === "к") $("#rand").click();
  else if (k === "h" || k === "р") $("#heavy").click();
  else if (k === "n" || k === "т") $("#ns").click();
  else if (k === "m" || k === "ь") $("#sample").click();
  else if (k === "f" || k === "а") togglePresent();
  else if (k === "l" || k === "д") $("#theme").click();
});

// для проверок: window.__rmShow(seed, mode, heavy), window.__rmSel(id, tab)
window.__rmShow = (seed, mode = "norm", heavy = false) => { S.mode = mode; S.heavy = heavy; load(seed ? "seed" : "sample", seed); return window.__rm; };
window.__rmSel = (id, tab = "gen") => { ui.tab = tab; select(id, true); return !!ui.sel; };

// подписи под роль; вкладки шапки ведут на соседнее РМ той же смены (полигон сохраняется)
function setupRole() {
  $("#tbl colgroup").innerHTML = WIDTHS.map(w => `<col style="width:${w}px">`).join("");
  document.querySelectorAll(".rm-tab[data-role]").forEach(a => {
    const on = a.dataset.role === ROLE, u = new URLSearchParams();
    a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    if (a.dataset.role !== "trains") u.set("role", a.dataset.role);
    if (params.get("poly")) u.set("poly", HOME);
    a.href = "rm.html" + (String(u) ? "?" + u : "");
  });
  if (INFRA) {
    rm.classList.add("infra");
    rm.insertAdjacentHTML("afterbegin", `<section class="p inf-now" aria-labelledby="inow-h"><div class="bh"><h2 id="inow-h">Действуют сейчас · вся сеть</h2><span class="sec" id="inow-sub"></span>
      <input id="nq" type="search" placeholder="Поиск: перегон, станция, поезд" aria-label="Поиск по действующим событиям" autocomplete="off"><button type="button" class="pbtn" id="now-export">Выгрузить</button></div>
      <div class="dep-scroll inow-scroll" tabindex="0" aria-label="Действующие события, листается"><table><colgroup>${[76, 280, 225, 110, 265, 280, 100, 200, 280, 420].map(w => `<col style="width:${w}px">`).join("")}<col></colgroup>
      <thead><tr><th>№</th><th>Событие</th><th>Направление</th><th>Полигон</th><th>Дорога</th><th>Перегон</th><th>Начало</th><th>До</th><th>Ограничение</th><th>Поезда на участке</th><th>Влияние</th></tr></thead><tbody id="inow-tb"></tbody></table></div></section>`);
    $("#nq").addEventListener("input", e => { ui.nq = e.target.value; renderInfraNow(); });
    $("#now-export").onclick = exportNow;
    $("#inow-tb").addEventListener("click", e => { const ev = e.target.closest("tr[data-ev]")?.dataset.ev; if (ev) select(ev); });
    document.title = "РМ «Инфраструктура»\u00a0– живой прототип";
    $(".bar h1").innerHTML = "РМ «Инфраструктура» <span>· живой прототип</span>";
    $("#list-h").firstChild.textContent = "Журнал за сутки · ";
    $("#q").placeholder = "Поиск: событие, перегон"; $("#q").setAttribute("aria-label", "Поиск по журналу: событие, перегон");
    $(".rm-list .note").textContent = "Данных по инфраструктуре в исходных макетах нет\u00a0– условные (допущение). Отказ\u00a0– отклонение; НС он становится по правилу эскалации.";
    $(".foot").innerHTML = `<h2>Что здесь происходит</h2>
      <p>Рабочее место инфраструктуры по&nbsp;всей сети&nbsp;– перенос экранов 4080×1536 из&nbsp;Figma (штатный 194:4704 и&nbsp;НС по&nbsp;инфраструктуре 198:5121). Смена та&nbsp;же, что у&nbsp;табло ТКП и&nbsp;других РМ.</p>
      <p>«Действуют сейчас»&nbsp;– отказы, окна и&nbsp;предупреждения из&nbsp;карточек полигонов на&nbsp;ТКП, с&nbsp;ограничением, поездами на&nbsp;участке и&nbsp;влиянием. «Журнал за&nbsp;сутки»&nbsp;– шаги по&nbsp;ним и&nbsp;закрытые за&nbsp;сутки события: фильтры в&nbsp;заголовках, сортировка по&nbsp;колонкам, поиск, CSV. Щелчок по&nbsp;событию, записи журнала или ячейке «Состояния по&nbsp;полигонам» показывает карточку справа; стрелки ↑↓ листают действующие события.</p>
      <p>Отказ, из-за&nbsp;которого встал поезд с&nbsp;людьми, по&nbsp;правилу эскалации становится НС: красная строка сверху, карточка НС с&nbsp;ходом работы, то&nbsp;же на&nbsp;ТКП.</p>
      <p>Данные условные. «Как в&nbsp;макете» даёт события, журнал и&nbsp;погоду из&nbsp;Figma.</p>`;
  }
  if (INFO) {
    rm.classList.add("info"); rm.insertAdjacentHTML("afterbegin", '<div id="info"></div>');
    $(".rm-user").textContent = "Иванова О. П.";
    document.title = "РМ «Отправление и информирование»\u00a0– живой прототип";
    $(".bar h1").innerHTML = "РМ «Отправление и информирование» <span>· живой прототип</span>";
    $("#info").addEventListener("click", infoClick);
    $("#right").addEventListener("click", infoClick, true);
    rm.addEventListener("change", infoChange); rm.addEventListener("input", infoInput);
    $(".foot").innerHTML = `<h2>Что здесь происходит</h2>
      <p>Рабочее место отправления и&nbsp;информирования пассажиров&nbsp;– перенос экранов 4080×1536 из&nbsp;Figma (штатный 263:8786, НС 270:7740, окно текста 279:8080). Смена та&nbsp;же, что у&nbsp;табло ТКП и&nbsp;других РМ.</p>
      <p>Слева&nbsp;– отправления со&nbsp;станций формирования и&nbsp;поезда в&nbsp;пути: следующая крупная станция, план и&nbsp;прогноз по&nbsp;местному времени, пояс, прогноз на&nbsp;конечной, отметки и&nbsp;колонка «Оповещение». Переключатель «Запад / Восток / Вся сеть» у&nbsp;каждой таблицы, сортировка по&nbsp;заголовкам, поиск, выгрузка в&nbsp;CSV. Щелчок по&nbsp;поезду в&nbsp;пути открывает его паспорт справа (тот&nbsp;же, что на&nbsp;других РМ).</p>
      <p>Объявляет только очередь «Ждут оповещения»: у&nbsp;строк галочки, кнопка одна&nbsp;– «Объявить выбранные». Щелчок по&nbsp;строке очереди или по&nbsp;статусу «в&nbsp;очереди» открывает окно текста на&nbsp;месте паспорта: шаблон, текст со&nbsp;счётчиком SMS, каналы, вид на&nbsp;табло. Объявленное уходит из&nbsp;очереди и&nbsp;видно во&nbsp;всех окнах смены.</p>
      <p>При НС очередь переезжает наверх слева во&nbsp;всю ширину, с&nbsp;готовыми текстами, НС-поезд закреплён первой строкой при&nbsp;любом фильтре, справа&nbsp;– карточка НС (та&nbsp;же, что у&nbsp;руководителя смены).</p>
      <p>Правило «оповещать от&nbsp;+0:${ANN_MIN} или при&nbsp;сдвиге прогноза на&nbsp;${ANN_SHIFT}&nbsp;мин», каналы и&nbsp;часовые пояса станций&nbsp;– допущения, в&nbsp;кейсе их&nbsp;нет. Данные условные.</p>`;
  }
  if (LEAD) {
    rm.classList.add("lead"); rm.insertAdjacentHTML("afterbegin", '<div id="lead"></div>');
    $(".rm-user").textContent = LEAD_NAME;
    document.title = "РМ руководителя смены\u00a0– живой прототип";
    $(".bar h1").innerHTML = "РМ «Руководитель смены» <span>· живой прототип</span>";
    // поезд в сети, «Паспорт» у НС – паспорт открывается здесь же; повторный щелчок по тому же поезду – закрывает
    $("#lead").addEventListener("click", e => {
      const o = e.target.closest("[data-open]")?.dataset.open; if (o) { if (ui.sel === o) select(null); else { ui.tab = "gen"; select(o); } return; }
      const id = e.target.closest("button")?.id; if (id === "roads-export") exportRoads(); else if (id === "ns-export") exportNs();
      // «Снять НС» – то же действие, что в паспорте: НС уходит здесь, на ТКП и на РМ полигонов
      else if (id === "ns-clear") { const x = findTrain(e.target.closest("button").dataset.train); if (x) toggleNs(x); } });
    $(".foot").innerHTML = `<h2>Что здесь происходит</h2>
      <p>Рабочее место руководителя смены&nbsp;– перенос экранов 4080×1536 из&nbsp;Figma (штатный 146:2013 и&nbsp;НС 156:2239). Смена та&nbsp;же, что у&nbsp;табло ТКП и&nbsp;РМ полигонов: новая смена, НС и&nbsp;тема меняются во&nbsp;всех окнах сразу.</p>
      <p>Руководитель видит всю сеть: опаздывающие поезда по&nbsp;полигонам с&nbsp;запада на&nbsp;восток, поезда в&nbsp;пути по&nbsp;дорогам (выгрузка в&nbsp;CSV), отправления со&nbsp;станций формирования, опоздания и&nbsp;показатели смены, пассажиров и&nbsp;вагоны. Щелчок по&nbsp;поезду открывает его паспорт здесь&nbsp;же, справа (тот&nbsp;же, что на&nbsp;РМ мониторинга); повторный щелчок или Esc закрывает.</p>
      <p>При НС (кнопка «НС» вверху или НС, объявленная с&nbsp;РМ полигона) в&nbsp;центре появляется работа по&nbsp;ней: задержка, обстановка, журнал и&nbsp;следующий шаг, а&nbsp;на&nbsp;месте отправлений&nbsp;– пассажиры и&nbsp;состав поезда с&nbsp;вагоном происшествия. Числа те&nbsp;же, что на&nbsp;ТКП и&nbsp;в&nbsp;паспорте поезда.</p>
      <p>Данные условные. «Как в&nbsp;макете» даёт смену из&nbsp;Figma; пассажиры и&nbsp;вагоны в&nbsp;пути считаются по&nbsp;поездам смены, поэтому отличаются от&nbsp;чисел макета.</p>`;
  }
  if (!CREWS) return;
  rm.classList.add("crews");
  document.title = "РМ «Бригады»\u00a0– живой прототип";
  $(".bar h1").innerHTML = "РМ «Бригады» <span>· живой прототип</span>";
  $("#list-h").firstChild.textContent = "Бригады на линии · ";
  $("#q").placeholder = "Поиск: поезд, машинист, депо"; $("#q").setAttribute("aria-label", "Поиск по поезду, машинисту, депо");
  $(".rm-list .note").textContent = "Бригад и контактов в исходных макетах нет\u00a0– данные условные (допущение). Время работы считается от явки; «превышение»\u00a0– бригада придёт на смену позже конца работы по графику.";
  $(".foot").innerHTML = `<h2>Что здесь происходит</h2>
    <p>Рабочее место по&nbsp;локомотивным бригадам полигона Юго-Западный&nbsp;– перенос экрана 4080×1536 из&nbsp;Figma. Смена та&nbsp;же, что у&nbsp;РМ мониторинга поездов и&nbsp;табло ТКП: новая смена, НС и&nbsp;тема меняются во&nbsp;всех окнах сразу.</p>
    <p>Строка таблицы&nbsp;– бригада поезда в&nbsp;пути: машинист, помощник, депо, сколько уже работает, где и&nbsp;когда её&nbsp;сменят. Норма работы&nbsp;– 12&nbsp;ч от&nbsp;явки. Смена ожидается по&nbsp;плану плюс опоздание поезда, поэтому опоздание даёт «превышение», а&nbsp;меньше часа запаса&nbsp;– «близко к&nbsp;концу». Сортировка, поиск, фильтры в&nbsp;заголовках, выгрузка в&nbsp;CSV.</p>
    <p>Щелчок по&nbsp;строке (или стрелки ↑↓) показывает карточку бригады справа, повторный щелчок или Esc&nbsp;– убирает. Машинист и&nbsp;смена бригады те&nbsp;же, что в&nbsp;паспорте поезда на&nbsp;РМ мониторинга.</p>
    <p>Бригад и&nbsp;контактов в&nbsp;исходных макетах нет: данные условные и&nbsp;одинаковы при&nbsp;каждом открытии одной смены. «Как в&nbsp;макете» даёт таблицу из&nbsp;Figma; у&nbsp;Т-128, Т-205, Т-211 и&nbsp;Т-217 время явки поправлено, чтобы статусы сходились с&nbsp;нормой 12&nbsp;ч.</p>`;
}
setupRole();

(async () => {
  await loadGeo();
  stations = (window.TKP_DATA?.stations || await (await fetch("data/stations.json")).json()).map(placeStation);
  stOf = makeStOf(stations);
  await document.fonts.ready;
  fit();
  const seed = +params.get("seed");
  const stored = !seed ? readShift() : null;
  if (stored) adopt(stored);
  else if (seed) { S.mode = MODES.includes(params.get("mode")) ? params.get("mode") : "norm"; load("seed", seed); }
  else load("sample");
  if (LEAD || INFO) {}
  else if (isSample() && !stored) select("Т-106");
  else if (CREWS && !ui.sel && view[0]) select(view[0].id);
  onShift(v => adopt(v));
  onTheme(t => { theme = t === "light" ? "light" : "dark"; applyTheme(); });
})();

Object.assign(__M, {  });
})();
})();
