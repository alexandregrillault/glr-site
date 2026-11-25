#!/usr/bin/env node
// Relevé d'une commune pour les pages ville : contour (geo.api.gouv.fr), lieux et espaces verts (OpenStreetMap).
// Usage : node neuf/releve.js 93001 93029 …   (codes INSEE ; ne refait pas une commune déjà relevée, sauf --refaire)
// Écrit neuf/donnees/{contours,lieux,parcs}/<insee>.json. Aucune donnée client : seulement des relevés publics.
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, 'donnees');
const SRC = '© contributeurs OpenStreetMap (ODbL)';
const MIROIRS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const dort = ms => new Promise(r => setTimeout(r, ms));
const r5 = n => Math.round(n * 1e5) / 1e5;

async function json(url, opts, essais = 4) {
  let err;
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok) return await r.json();
      err = 'HTTP ' + r.status;
    } catch (e) { err = e.message; }
    await dort(4000 * (i + 1));
  }
  throw new Error(err);
}

async function overpass(q) {
  let err;
  for (let t = 0; t < 6; t++) {
    const m = MIROIRS[t % MIROIRS.length];
    try {
      return await json(m, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept': 'application/json', 'user-agent': 'pages-ville-releve/1.0' } }, 1);
    } catch (e) { err = e.message; await dort(6000 * (t + 1)); }
  }
  throw new Error('Overpass ne répond pas (' + err + ')');
}

const centre = e => e.center ? [e.center.lat, e.center.lon] : [e.lat, e.lon];
function anneau(e) { // chemin OSM fermé → polygone [lon, lat]
  if (!e.geometry || e.geometry.length < 4) return null;
  const c = e.geometry.map(p => [r5(p.lon), r5(p.lat)]);
  const a = c[0], b = c[c.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) c.push(a);
  return c.length >= 4 ? c : null;
}

async function releve(insee, refaire) {
  const fc = path.join(D, 'contours', insee + '.json'), fl = path.join(D, 'lieux', insee + '.json'), fp = path.join(D, 'parcs', insee + '.json');
  if (!refaire && [fc, fl, fp].every(f => fs.existsSync(f))) return 'déjà fait';
  const c = await json('https://geo.api.gouv.fr/communes/' + insee + '?fields=nom,code,contour&format=json&geometry=contour');
  if (!c.contour) throw new Error('contour introuvable');
  const aire = `area["ref:INSEE"="${insee}"]["boundary"="administrative"]->.a;`;
  const lx = await overpass(`[out:json][timeout:90];${aire}(
    nwr(area.a)["amenity"="school"];
    nwr(area.a)["shop"~"^(supermarket|convenience|bakery|mall|department_store)$"];
    nwr(area.a)["railway"~"^(station|tram_stop|halt)$"];
    nwr(area.a)["station"="subway"];
  );out center tags;`);
  const lieux = [];
  for (const e of lx.elements) {
    const t = e.tags || {}, n = t.name;
    if (!n) continue;
    const g = t.amenity === 'school' ? 'ecole' : (t.railway || t.station) ? 'transport' : 'commerce';
    const [a, o] = centre(e);
    if (a == null || o == null) continue;
    lieux.push({ g, n, a: r5(a), o: r5(o) });
  }
  const px = await overpass(`[out:json][timeout:90];${aire}(
    way(area.a)["leisure"~"^(park|garden|nature_reserve)$"];
    way(area.a)["landuse"="cemetery"];
    way(area.a)["leisure"~"^(pitch|sports_centre|stadium)$"];
  );out geom tags;`);
  const features = [];
  for (const e of px.elements) {
    const t = e.tags || {}, ring = anneau(e);
    if (!ring) continue;
    const sport = /^(pitch|sports_centre|stadium)$/.test(t.leisure || '');
    features.push({ type: 'Feature', properties: { g: sport ? 'sport' : 'parc', n: t.name || '' }, geometry: { type: 'Polygon', coordinates: [ring] } });
  }
  fs.mkdirSync(path.dirname(fc), { recursive: true }); fs.mkdirSync(path.dirname(fl), { recursive: true }); fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fc, JSON.stringify({ type: 'Feature', properties: { nom: c.nom, code: c.code }, geometry: c.contour }));
  fs.writeFileSync(fl, JSON.stringify({ source: SRC, lieux }));
  fs.writeFileSync(fp, JSON.stringify({ type: 'FeatureCollection', source: SRC, features }));
  return `ok (${lieux.length} lieux, ${features.length} espaces)`;
}

(async () => {
  const args = process.argv.slice(2), refaire = args.includes('--refaire');
  const codes = args.filter(a => /^\d{5}$/.test(a));
  let i = 0;
  for (const code of codes) {
    i++;
    try { console.log(`[${i}/${codes.length}] ${code} ${await releve(code, refaire)}`); }
    catch (e) { console.log(`[${i}/${codes.length}] ${code} ÉCHEC ${e.message}`); }
    await dort(1500);
  }
})();
