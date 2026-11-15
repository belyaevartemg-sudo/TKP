// Отрисовка табло 5400×2500 из объекта смены. Геометрия зон и шрифты – из макета Figma (вариант В / Г).
import { POLYS, POLY_FULL, plural } from "./data.js";
import { layoutLabels, LABEL } from "./labels.js";
import { placeStation } from "./geo.js";

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
export function mapLayers(d, nsl, stOf, opts) {
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
export function nsList(d, mode) {
  const all = (Array.isArray(d.ns) ? d.ns : d.ns ? [d.ns] : []).filter(n => d.trains.some(t => t.id === n.train));
  return mode === "multi" ? all : mode === "ns" ? all.slice(0, 1) : [];
}

export function renderBoard(el, d, { mode, stations, labelWidth, seed }) {
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
