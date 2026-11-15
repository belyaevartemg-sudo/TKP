// РМ «Мониторинг поездов» полигона: таблица всех поездов в пути, показатели полигона, паспорт поезда.
// Смена общая с окном ТКП (js/shift.js): всё, что меняется здесь, видно на табло, и наоборот.
import { SAMPLE, generate, plural, POLYS, POLY_FULL } from "./data.js";
import { nsList } from "./board.js";
import { loadGeo, placeStation } from "./geo.js";
import { publishShift, readShift, onShift, onTheme } from "./shift.js";
import { allTrains, carOfNs, passport, polyBlocks, makeStOf, toShiftTrain, fmtDelay, nf, v1, lvl, hm, toMin, WORKS, CAR_FULL, CAR_SHORT, crewOf, crewReserve, nsPax, paxTotals, infraOf, infraWeather, infoOf, WEST, EAST, ANN_MIN, ANN_SHIFT, ANN_TPL, annText, boardLine, smsParts } from "./rmdata.js";

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
