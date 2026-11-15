// Демо ТКП: смена из макета или случайная, режим «штатный / НС», добавление своих поездов, свои данные в JSON.
import { SAMPLE, generate, plural, POLY_FULL } from "./data.js";
import { renderBoard } from "./board.js";
import { loadGeo, placeStation } from "./geo.js";
import { publishShift, readShift, onShift, onTheme } from "./shift.js";

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
