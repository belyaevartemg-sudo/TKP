// Общая смена для окон ТКП и РМ: одна запись в localStorage и событие «storage» в остальных окнах.
// Окно, которое изменило смену, пишет её сюда; другие окна получают событие и перерисовываются, сами не записывая.
const KEY = "tkp-shift", me = Math.random().toString(36).slice(2);

export function publishShift(s) {
  try { localStorage.setItem(KEY, JSON.stringify({ rev: Date.now(), from: me, source: s.source, seed: s.seed, heavy: s.heavy, mode: s.mode, data: s.data, added: s.added || [] })); } catch {}
}
export function readShift() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return v && v.data && Array.isArray(v.data.trains) ? v : null; } catch { return null; }
}
export function onShift(cb) {
  addEventListener("storage", e => {
    if (e.key !== KEY || !e.newValue) return;
    try { const v = JSON.parse(e.newValue); if (v.from !== me && v.data) cb(v); } catch {}
  });
}
// тема тоже общая: переключили в одном окне – меняется во всех
export function onTheme(cb) { addEventListener("storage", e => { if (e.key === "tkp-theme" && e.newValue) cb(e.newValue); }); }
