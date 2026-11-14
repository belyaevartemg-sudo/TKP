// Отрисовка табло 5400×2500 из объекта смены. Геометрия зон и шрифты – из макета Figma (вариант В / Г).
import { POLYS, POLY_FULL, plural } from "./data.js";
import { layoutLabels, LABEL } from "./labels.js";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtDelay = m => `+${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const nm = t => t.id + (t.speed ? "(ск)" : "");
const RED_MIN = 240;
const isRed = (t, ns) => t.delay > RED_MIN || (ns && ns.train === t.id);

const mk = {
  a: s => `<img class="mk" src="assets/mk-a${s === 73 ? 73 : s === 64 ? 64 : s === 56 ? 56 : 60}.svg" width="${s}" height="${s}" alt="">`,
  g: s => `<img class="mk" src="assets/mk-g${s === 64 ? 64 : s === 56 ? 56 : 60}.svg" width="${s}" height="${s}" alt="">`,
  o: s => `<img class="mk" src="assets/mk-o60.svg" width="${s}" height="${s}" alt="">`,
  r: s => `<span class="mk mk-r" style="width:${s}px;height:${s}px;border-radius:${s * 0.14}px;font-size:${s * 0.78}px">!</span>`,
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

function z2(d, ns, st) {
  if (!ns) return `<section class="z z2" aria-label="Статус"><p class="row z2-ok">${mk.g(64)}<span>Нештатных ситуаций и отказов нет</span></p></section>`;
  return `<section class="z z2 z2-ns" aria-label="Нештатная ситуация">
    ${mk.r(160)}
    <p class="ns-title">НС · ${esc(ns.train)} · ${esc(st ? st.short : "")}</p>
    <p class="ns-sub">${esc(ns.kind)} · с ${esc(ns.since)}</p>
    <p class="ns-min">${ns.mins} мин</p><p class="ns-min-sub">с начала</p>
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

function z5(d, ns) {
  if (ns) {
    const fact = f => f.length === 1 ? `<p>${esc(f[0])}</p>` :
      `<p>${esc(f[0])}<span class="${f[2] === "amber" ? "amb sb" : "sb"}">${esc(f[1])}</span></p>`;
    return `<section class="z z5 z5-ns" aria-label="Карточка НС">
      ${ns.facts.map(fact).join("")}
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
function z6(d, ns, byPoly, stOf) {
  return POLYS.map((p, i) => {
    const list = byPoly[p].sort((a, b) => (ns && b.id === ns.train) - (ns && a.id === ns.train) || b.delay - a.delay);
    const red = list.some(t => isRed(t, ns));
    const n = list.length;
    const status = !n ? `<p class="row st">${mk.g(56)}<span>по графику</span></p>`
      : `<p class="row st ${red ? "red" : "amb"}">${red ? mk.r(56) : mk.a(56)}<span>${plural(n, "опаздывает", "опаздывают", "опаздывают")} ${n}</span></p>`;
    const shown = n > ROWS_MAX ? list.slice(0, ROWS_MAX - 1) : list;
    const rows = !n ? `<p class="t-row mut">отклонений нет</p>` : shown.map(t => {
      const isNs = ns && ns.train === t.id;
      return `<p class="t-row"><b>${esc(nm(t))}</b><b class="${isNs || t.delay > RED_MIN ? "red" : "amb"}">${isNs ? "НС" : fmtDelay(t.delay)}</b><span class="${isNs ? "" : "sec"}">${esc(stOf(t).short)}</span></p>`;
    }).join("") + (n > ROWS_MAX ? `<p class="t-row sec">+${n - shown.length} ${plural(n - shown.length, "поезд", "поезда", "поездов")}</p>` : "");
    const tr = d.transit[p];
    return `<section class="z z6" style="left:${856 + i * 742}px" aria-label="Полигон ${POLY_FULL[p]}">
      <p class="z6-name">${p}</p>${status}
      <p class="z6-tr">${tr} ${plural(tr, "поезд", "поезда", "поездов")} в пути</p>
      <hr>${rows}</section>`;
  }).join("");
}

function side(d, polys, cls) {
  return `<section class="z ${cls}" aria-label="Полигоны">${polys.map(p => {
    const s = d.side[p] || { events: [], weather: [] };
    const ev = s.events.map(e => `<div class="ev">${mk.a(60)}<p>${esc(e.head[0])}<br>${esc(e.head[1])}</p></div><p>${esc(e.where)}</p>`).join("");
    const empty = !s.events.length && !s.weather.length ? `<p class="sec">без окон и предупреждений</p>` : "";
    const w = s.weather.map(x => `<div class="wx"><p>${esc(x.city)} ${x.t < 0 ? "−" : x.t > 0 ? "+" : ""}${Math.abs(x.t)} °C</p><p class="sec">${esc(x.sky)} · ${esc(x.local)} местн.</p></div>`).join("");
    return `<div class="card"><p class="name">${POLY_FULL[p]}</p>${ev}${empty}${w}</div>`;
  }).join("")}</section>`;
}

// --- карта ---
export function mapLayers(d, ns, stOf, opts) {
  const dots = d.trains.map(t => ({ id: t.id, x: stOf(t).x, y: stOf(t).y }));
  const fixed = [];
  let nsSvg = "", nsHtml = "";
  if (ns) {
    const t = d.trains.find(x => x.id === ns.train);
    if (t) {
      const { x, y } = stOf(t);
      fixed.push([x - 165, y - 165, x + 165, y + 165]);
      const below = y + 195 + 100 <= LABEL.H_MAP - 8;
      const lx = Math.min(Math.max(x - 195, 8), LABEL.W_MAP - 398), ly = below ? y + 195 : y - 195 - 100;
      fixed.push([lx, ly, lx + 390, ly + 100]);
      nsSvg = `<circle cx="${x}" cy="${y}" r="165" fill="none" stroke="#ff4040" stroke-opacity=".45" stroke-width="6"/>
        <circle cx="${x}" cy="${y}" r="115" fill="#ff4040" fill-opacity=".22" stroke="#ff4040" stroke-opacity=".85" stroke-width="10"/>
        <line x1="${x}" y1="${below ? y + 165 : y - 165}" x2="${x}" y2="${below ? ly : ly + 100}" stroke="#ff4040" stroke-width="6"/>`;
      nsHtml = `<div class="lbl lbl-ns" style="left:${lx}px;top:${ly}px"><span>${esc(nm(t))}</span><span class="red">НС</span></div>
        <span class="mk mk-r map-mk" style="left:${x - 51}px;top:${y - 51}px;width:102px;height:102px;border-radius:14px;font-size:70px">!</span>`;
    }
  }
  // в режиме НС подписаны только красные (жёлтые – только значки), иначе все
  const toLabel = d.trains.filter(t => !(ns && t.id === ns.train) && (!ns || t.delay > RED_MIN));
  const want = toLabel.map(t => ({ id: t.id, w: opts.labelWidth(t), prio: (t.delay > RED_MIN ? 1e6 : 0) + t.delay }));
  const res = layoutLabels({ dots, want, fixed, topLimit: ns ? 175 : 12, seed: opts.seed || 1, budgetMs: opts.budgetMs || 1500 });
  let lines = "", labels = "", marks = "";
  for (const t of d.trains) {
    if (ns && t.id === ns.train) continue;
    const { x, y } = stOf(t), red = t.delay > RED_MIN;
    marks += red ? `<span class="mk mk-r map-mk" style="left:${x - 36.4}px;top:${y - 36.4}px;width:72.8px;height:72.8px;border-radius:10.2px;font-size:49.4px">!</span>`
                 : `<img class="map-mk" src="assets/mk-a73.svg" width="72.8" height="72.8" alt="" style="left:${x - 36.4}px;top:${y - 36.6}px">`;
    const p = res.placed[t.id];
    if (!p) continue;
    const c = red ? "#ff4040" : "#f2b233";
    lines += `<line x1="${p.l[0]}" y1="${p.l[1]}" x2="${p.l[2]}" y2="${p.l[3]}" stroke="${c}" stroke-width="${red ? 6 : 4}"/>`;
    labels += `<div class="lbl" style="left:${p.r[0]}px;top:${p.r[1]}px;width:${p.r[2] - p.r[0]}px"><span>${esc(nm(t))}</span><span class="${red ? "red" : "amb"}">${fmtDelay(t.delay)}</span></div>`;
  }
  return { html: `<img class="map-base" src="assets/base_map.svg" width="2360" height="1410" alt="Карта сети: регионы закрашены по полигонам, линии – железные дороги">
    <svg class="map-svg" viewBox="0 0 2360 1410" aria-hidden="true">${nsSvg}${lines}</svg>${marks}${nsHtml}${labels}`,
    stats: { labeled: Object.keys(res.placed).length, dropped: res.dropped, ms: Math.round(res.ms), total: d.trains.length } };
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

export function renderBoard(el, d, { mode, stations, labelWidth, seed }) {
  const byName = Object.fromEntries(stations.map(s => [s.name, s]));
  const stOf = t => byName[t.station] || { x: -100, y: -100, short: t.station, poly: "Окт" };
  const ns = mode === "ns" && d.ns && d.trains.some(t => t.id === d.ns.train) ? d.ns : null;
  const byPoly = Object.fromEntries(POLYS.map(p => [p, []]));
  for (const t of d.trains) byPoly[stOf(t).poly].push(t);
  const map = mapLayers(d, ns, stOf, { labelWidth, seed });
  const nsSt = ns ? stOf(d.trains.find(t => t.id === ns.train)) : null;
  el.innerHTML = `${z1(d)}${z2(d, ns, nsSt)}${z3(d.trains)}
    <section class="z z4" aria-label="Карта опозданий">${map.html}</section>
    ${z5(d, ns)}${z6(d, ns, byPoly, stOf)}
    ${side(d, ["Окт", "Моск", "Ю-З"], "z7")}${side(d, ["С-З", "Вост"], "z8")}`;
  el.classList.toggle("is-ns", !!ns);
  fitZones(el);
  return map.stats;
}
