// Данные рабочего места «Мониторинг поездов» из той же смены, что и ТКП.
// Смена хранит только опаздывающие поезда; РМ показывает все поезда полигона в пути, поэтому поезда по графику
// и подробности каждого поезда (категория, маршрут, дорога, паспорт, состав, техоперации) достраиваются здесь.
// Всё детерминировано: один и тот же поезд в одной смене всегда выглядит одинаково.
import { rng } from "./labels.js";
import { POLYS, plural } from "./data.js";
import { placeStation } from "./geo.js";

const pad = n => String(n).padStart(2, "0");
export const hm = m => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;
export const toMin = s => { const [h, m] = String(s).split(":").map(Number); return h * 60 + m; };
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const R = key => { const r = rng(hash(key) || 1); return { r, int: (a, b) => a + Math.floor(r() * (b - a + 1)), pick: a => a[Math.floor(r() * a.length)] }; };
// опоздание: «+4:40», «0:00», «−0:01» (минус – раньше графика)
export const fmtDelay = m => (m < 0 ? "−" : m > 0 ? "+" : "") + `${Math.floor(Math.abs(m) / 60)}:${pad(Math.abs(m) % 60)}`;
export const nf = n => n.toLocaleString("ru-RU").replace(/ /g, " ");
export const v1 = v => v.toFixed(1).replace(".", ",");
// правило РМ: до +0:05 включительно – по графику; больше 4 ч – критично
export const ON_TIME = 5;
export const RED_MIN = 240;
export const lvl = (x, ns) => ns || x.delay > RED_MIN ? "red" : x.delay > ON_TIME ? "amb" : "ok";

// станции из макета, которых нет в каталоге: координаты нужны, чтобы поезд встал на карту ТКП (НС с РМ)
export const EXTRA_ST = { "Пенза-1": [53.2, 45.0], "Грязи-Воронежские": [52.5, 39.95], "Крымская": [44.93, 38.0], "Тамбов-1": [52.73, 41.43],
  "Краснодар-1": [45.04, 38.98], "Таганрог-Пасс.": [47.22, 38.9], "Пачелма": [53.31, 43.39], "Воронеж-1": [51.67, 39.18] };

// станция поезда: из каталога по имени или по своим координатам (как на ТКП)
export function makeStOf(stations) {
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
export function roadOf(st) {
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
export const CAR_FULL = { "С": "Сидячий", "С2": "Сидячий", "П": "Плацкартный", "К": "Купейный", "ВР": "Вагон-ресторан" };
export const CAR_SHORT = { "С": "С", "С2": "С", "П": "П", "К": "К", "ВР": "ВР" };

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
export function allTrains(d, stOf, stations, sample) {
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
export function nsPax(n) {
  const txt = (n?.facts || []).map(f => f.join("")).join(" | ");
  return { total: +(txt.match(/(\d[\d\s]*) пассажир/)?.[1].replace(/\s/g, "") || 0), inCar: +(txt.match(/в вагоне \d+ – (\d+)/)?.[1] || 0) };
}
// номер вагона из вида НС: «Пострадавший пассажир · вагон 8» → 8
export const carOfNs = n => +(String(n?.kind || "").match(/вагон (\d+)/)?.[1] || 0);

// поезд по графику → поезд смены (нужно, чтобы объявить по нему НС: ТКП показывает только поезда смены)
export function toShiftTrain(x, stations) {
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
export const WORKS = [["loco", "Локом."], ["crew", "Бригада"], ["water", "Вода"], ["fuel", "Топливо"], ["toilet", "ЭЧТК"], ["trash", "ТБО"]];
const WORK_TXT = { loco: "смена локомотива", crew: "смена бригады", water: "вода", fuel: "топливо", toilet: "ЭЧТК", trash: "сбор ТБО" };
// Т-106 «Как в макете» (137:5601): время работ – плановое, московское; день относительно даты смены
const T106_OPS = [["Москва-Курская", -1, "07:35", 40, W(0, 1, 1, 1, 1, 1)], ["Тула-1", -1, "11:20", 15, W(0, 0, 0, 0, 0, 1)], ["Орёл", -1, "15:10", 30, W(1, 0, 1, 0, 0, 1)],
  ["Курск", -1, "19:05", 20, W(0, 1, 1, 0, 1, 1)], ["Белгород", 0, "00:40", 30, W(1, 0, 1, 1, 1, 1)], ["Ростов-Главный", 0, "14:30", 30, W(1, 1, 1, 0, 0, 1)],
  ["Краснодар-1", 0, "18:20", 20, W(0, 1, 1, 0, 1, 1)], ["Туапсе", 0, "20:50", 10, W(0, 0, 0, 0, 0, 1)], ["Адлер", 0, "22:40", 30, W(0, 0, 1, 0, 1, 1)]];

export function passport(x, d, stations, sample) {
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
export function polyBlocks(d, p, list, nsIds, sample) {
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
export const WORK_NORM = 12 * 60;
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

export function crewOf(x, d, sample) {
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
export const crewReserve = (d, p, n) => (DEPOTS[p] || []).length + Math.round(n / 40) + R("res" + p + d.date).int(0, 3);

// отправлено пассажиров за сутки, месяц, год (РМ руководителя) – условно; в образце – числа макета 146:3458
export function paxTotals(d, sample) {
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

export function infraOf(d, ALL, nsl, stations, sample) {
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
export const wxRisk = (t, sky) => t <= -25 ? "стрелки, излом рельса" : t <= -15 && /снег|метель/.test(sky) ? "очистка стрелок" : t <= -15 ? "излом рельса"
  : /снег|метель/.test(sky) ? "налипание на КС" : t <= 0 ? "гололёд на КС ночью" : "";
export function infraWeather(cities, sample) {
  if (sample) return FIG_WX.map(([city, poly, t, sky]) => ({ city, poly, t, sky, risk: wxRisk(t, sky) }));
  const seen = new Set();
  return cities.filter(c => !seen.has(c.city) && seen.add(c.city)).map(c => ({ ...c, risk: wxRisk(c.t, c.sky) })).filter(c => c.risk).sort((a, b) => a.t - b.t).slice(0, 6);
}


// ---------- РМ «Отправление и информирование» (Figma, секция 5: 263:8786 штатный, 270:7740 НС, 279:8080 окно текста) ----------
// Отправления со станций формирования и поезда в пути с оповещением пассажиров, очередь «Ждут оповещения», 14 городов.
// Правило оповещения – допущение команды (в кейсе его нет): опоздание от +0:20 или сдвиг прогноза на 10 мин и больше.
export const WEST = ["Окт", "Моск", "Ю-З"];
export const EAST = ["С-З", "Вост"];
export const ANN_MIN = 20;
export const ANN_SHIFT = 10;
// часовой пояс по координатам станции (условно: по долготе, Поволжье южнее 54° – UTC+4)
export const tzOf = (lat, lon) => lon < 22 ? 2 : lon < 45.5 ? 3 : lon < 52 ? (lat < 54 ? 4 : 3) : lon < 66 ? 5 : lon < 76 ? 6 : lon < 100 ? 7 : lon < 113 ? 8 : lon < 127 ? 9 : 10;
const POLY_TZ = { "Окт": 3, "Моск": 3, "Ю-З": 3, "С-З": 5, "Вост": 8 };
// 14 городов с запада на восток: [город, полигон, пояс, t °C в макете, погода в макете]
export const INFO_CITIES = [["Калининград", "Окт", 2, -1, "облачно"], ["Мурманск", "Окт", 3, -14, "облачно"], ["Москва", "Моск", 3, -6, "снег"], ["Минск", "БЧ", 3, -4, "облачно"],
  ["Ростов-на-Дону", "Ю-З", 3, -5, "ясно"], ["Адлер", "Ю-З", 3, 0, "ясно"], ["Воркута", "С-З", 3, -19, "снег"], ["Екатеринбург", "С-З", 5, -22, "ясно"], ["Новый Уренгой", "С-З", 5, -20, "облачно"],
  ["Новосибирск", "С-З", 7, -19, "снег"], ["Красноярск", "Вост", 7, -24, "снег"], ["Иркутск", "Вост", 8, -26, "снег"], ["Благовещенск", "Вост", 9, -20, "снег"], ["Владивосток", "Вост", 10, -16, "снег"]];
const durTxt = m => { const h = Math.floor(m / 60), r = m % 60; return [h && `${h} ч`, r && `${r} мин`].filter(Boolean).join(" ") || "0 мин"; };
const trainNo = id => id.replace(/\D/g, "");
// шаблоны текста: stop – задержка на станции, arr – новое время прибытия, dep – новое время отправления, own – свой текст
export const ANN_TPL = [["stop", "Задержка на станции"], ["arr", "Новое время прибытия"], ["dep", "Новое время отправления"], ["own", "Свой текст"]];
export function annText(q, tpl, now) {
  const n = trainNo(q.id);
  if (tpl === "stop") return `Поезд ${n} ${q.route} задерживается на станции ${q.at}. Новое время сообщим до ${hm(now + 60)}.`;
  if (tpl === "dep") return `Поезд ${n} ${q.route} отправится со станции ${q.at} в ${q.newT}, задержка ${durTxt(q.delay)}.`;
  if (tpl === "arr") return `Поезд ${n} ${q.route} прибудет на станцию ${q.final} в ${q.progE} по местному времени, опоздание ${durTxt(q.delay)}.`;
  return "";
}
export const boardLine = (q, tpl) => `${trainNo(q.id)}   ${q.route.toUpperCase()}   ${tpl === "stop" ? "ЗАДЕРЖИВАЕТСЯ · ВРЕМЯ УТОЧНЯЕТСЯ" : tpl === "dep" ? `ОТПРАВЛЕНИЕ ${q.newT}` : tpl === "arr" ? `ПРИБЫТИЕ ${q.progE} · ОПОЗДАНИЕ ${durTxt(q.delay).toUpperCase()}` : "СМ. ОБЪЯВЛЕНИЕ"}`;
// SMS кириллицей: 70 знаков в одном сообщении, в длинном – части по 67
export const smsParts = len => len <= 70 ? 1 : Math.ceil(len / 67);

export function infoOf(d, ALL, stations, nsl, sample) {
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
