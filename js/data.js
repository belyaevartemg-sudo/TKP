// Данные смены: пример из макета Figma (варианты В и Г) и генератор случайной смены.
// Из одного объекта смены табло считает всё само: счётчики Z3, колонки Z6, значки и подписи Z4.
import { rng } from "./labels.js";

export const POLYS = ["Окт", "Моск", "Ю-З", "С-З", "Вост"];
export const POLY_FULL = { "Окт": "Октябрьский", "Моск": "Московский", "Ю-З": "Юго-Западный",
  "С-З": "Северо-Западный", "Вост": "Восточный" };

// Смена из макета (Figma «Новые экраны», страница «01 ТКП», варианты В 34:2 и Г 34:383)
export const SAMPLE = {
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
    "Моск": { events: [], weather: [] },
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
export function plural(n, one, few, many) {
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
const TRANSIT = { "Окт": [40, 80], "Моск": [50, 95], "Ю-З": [90, 150], "С-З": [110, 170], "Вост": [70, 115] };

export function generate(seed, stations) {
  const r = rng(seed);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = a => a[Math.floor(r() * a.length)];
  // время смены 19:00–07:00, дата – произвольная в 2023–2026
  const now = 19 * 60 + int(10, 11 * 60 + 40);
  const d = new Date(Date.UTC(int(2023, 2026), int(0, 11), int(1, 28)));
  const date = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}, ${WD[d.getUTCDay()]}`;
  const transit = Object.fromEntries(POLYS.map(p => [p, int(...TRANSIT[p])]));

  // опоздания: сколько, где, сколько минут; станции не ближе 90 px друг к другу
  const total = r() < 0.08 ? int(0, 3) : int(5, 22);
  const used = new Set(), chosen = [];
  const free = () => stations.filter(s => !chosen.some(c => Math.hypot(c.x - s.x, c.y - s.y) < 90));
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
    const delay = speed ? int(3, 55) : q < 0.80 ? int(3, 59) : q < 0.94 ? int(60, 239) : int(241, 420);
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
  const plan = int(150, 240);
  const summary = { sent: int(Math.round(plan * 0.3), plan), plan, delayedDep: int(0, 6), control: [int(5, 14), int(0, 8)],
    kids: [int(90, 220), int(30, 70) * 100, int(80, 240)], transitDelta: `${pick(["+", "−"])}${int(1, 9)} %`,
    intl: int(5, 25), foreign: int(3, 15) };

  // НС (показывается в режиме «НС»): один из обычных опаздывающих поездов
  let ns = null;
  const regular = trains.filter(t => !t.speed && t.delay < 120);
  const base = regular.length ? pick(regular) : null;
  if (base) {
    const [kind, car] = pick(NS_KINDS);
    const carN = int(2, 14), pax = int(300, 980), inCar = int(30, 90), tr = int(1, 6);
    const mins = base.delay, start = now - mins;
    ns = { train: base.id, kind: car ? `${kind} · вагон ${carN}` : kind, since: hm(start), mins,
      facts: [[`Стоит на ${tr}-м пути`], ["Задержка ", `${mins} мин`, "amber"], ["Новое время – уточняется"],
              car ? [`${pax} ${plural(pax, "пассажир", "пассажира", "пассажиров")}, в вагоне ${carN} – `, String(inCar), "bold"]
                  : [`${pax} ${plural(pax, "пассажир", "пассажира", "пассажиров")} в поезде`]],
      log: [[hm(start + 3), "ведёт руководитель смены"], [hm(start + Math.max(4, mins - 11)), "уведомлены службы"],
            [hm(now + int(5, 20)), car ? `решение по вагону ${carN}` : "замена локомотива", "next"]] };
  }
  return { time: hm(now), date, shift: "смена 19:00–07:00", updated: hm(now), stale, transit, trains, summary, side, ns };
}
