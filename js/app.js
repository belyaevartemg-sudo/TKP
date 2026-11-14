// Демо ТКП: смена из макета или случайная, режим «штатный / НС», свои данные в JSON.
import { SAMPLE, generate } from "./data.js";
import { renderBoard } from "./board.js";

const $ = s => document.querySelector(s);
const wrap = $("#wrap"), board = $("#board"), stat = $("#stat"), ta = $("#json"), err = $("#err");
const params = new URLSearchParams(location.search);
let state = { source: params.get("seed") ? "seed" : "sample", seed: +params.get("seed") || 0, mode: params.get("mode") === "ns" ? "ns" : "norm", data: null };
let stations = [];

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

function draw() {
  const st = renderBoard(board, state.data, { mode: state.mode, stations, labelWidth, seed: state.seed || 1 });
  const src = state.source === "sample" ? "смена из макета" : state.source === "seed" ? `случайная смена №${state.seed}` : "свои данные";
  const nsNote = state.mode === "ns" && !board.classList.contains("is-ns") ? " · в этой смене нет поезда для НС" : "";
  stat.innerHTML = `${src} · опаздывают <b>${st.total}</b> · подписано на карте <b>${st.labeled}</b>` +
    (st.dropped.length ? ` · без подписи (не уместились): <b>${st.dropped.join(", ")}</b>` : "") +
    ` · раскладка <b>${st.ms} мс</b>${nsNote}`;
  $("#ns").setAttribute("aria-pressed", state.mode === "ns");
  const q = new URLSearchParams();
  if (state.source === "seed") q.set("seed", state.seed);
  if (state.mode === "ns") q.set("mode", "ns");
  history.replaceState(null, "", q.toString() ? "?" + q : location.pathname);
  ta.value = JSON.stringify(state.data, null, 1);
  window.__last = st;
}

function load(source, seed) {
  state.source = source;
  if (source === "sample") state.data = structuredClone(SAMPLE);
  if (source === "seed") { state.seed = seed; state.data = generate(seed, stations); }
  draw();
}

$("#rand").onclick = () => load("seed", 1 + Math.floor(Math.random() * 99999));
$("#sample").onclick = () => load("sample");
$("#ns").onclick = () => { state.mode = state.mode === "ns" ? "norm" : "ns"; draw(); };
$("#full").onclick = () => togglePresent();
$("#apply").onclick = () => {
  try {
    const d = JSON.parse(ta.value);
    const known = new Set(stations.map(s => s.name));
    const bad = (d.trains || []).filter(t => !known.has(t.station)).map(t => `${t.id}: «${t.station}»`);
    if (bad.length) throw new Error("нет такой станции в каталоге: " + bad.join(", "));
    err.hidden = true; state.source = "own"; state.data = d; draw();
    wrap.scrollIntoView({ behavior: "smooth" });
  } catch (e) { err.hidden = false; err.textContent = "Не получилось: " + e.message; }
};
function togglePresent() {
  document.body.classList.toggle("present");
  if (document.body.classList.contains("present")) document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen();
  fit();
}
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) document.body.classList.remove("present"); fit(); });
document.addEventListener("keydown", e => {
  if (e.target.closest("textarea,input") || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "r" || k === "к") $("#rand").click();
  else if (k === "n" || k === "т") $("#ns").click();
  else if (k === "m" || k === "ь") $("#sample").click();
  else if (k === "f" || k === "а") togglePresent();
});

// для проверок: window.__show(seed, mode)
window.__show = (seed, mode = "norm") => { state.mode = mode; load(seed ? "seed" : "sample", seed); return window.__last; };

(async () => {
  stations = await (await fetch("data/stations.json")).json();
  $("#stations").textContent = stations.map(s => s.name).join(", ");
  await document.fonts.load("600 75px Inter"); await document.fonts.ready;
  fit();
  load(state.source, state.seed);
})();
