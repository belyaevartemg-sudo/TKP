// Любая станция на карту: широта/долгота -> пиксели карты Z4 (коническая проекция Ламберта, та же рамка,
// что у подложки) и полигон по контурам пяти полигонов (data/geo.json, собран geo/stations.py).
let G = null, ctx = null, paths = null;

export async function loadGeo(url = "data/geo.json") {
  // data/data.js (сборка) кладёт данные в window.TKP_DATA – так страница работает и с file:///
  G = window.TKP_DATA?.geo || await (await fetch(url)).json();
  ctx = document.createElement("canvas").getContext("2d");
  paths = Object.entries(G.polys).map(([p, d]) => [p, new Path2D(d)]);
}

const rad = Math.PI / 180;
export function project(lat, lon) {
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
export function polyAt(x, y) {
  let p = inPoly(x, y);
  for (let r = 6; !p && r < 120; r += 6)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]])
      if ((p = inPoly(x + r * dx, y + r * dy))) break;
  return p;
}

export function placeStation(s) {
  const { x, y } = project(s.lat, s.lon);
  return { ...s, x: Math.round(x), y: Math.round(y), poly: s.poly || polyAt(x, y) };
}
