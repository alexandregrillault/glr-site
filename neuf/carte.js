// Carte des programmes, dans le style des vidéos Quoi de neuf : Plan IGN épuré (sans aucun nom, seuls les grands axes),
// immeubles en relief, contour des communes en liseré blanc ombré. Un clic sur un programme zoome dessus et pose
// sa maquette 3D dans son quartier ; le soleil suit l'heure choisie.
// Données : <script type="application/json" id="carte-data"> ; maplibregl chargé avant ce module.
import * as THREE from 'three';
import { construire, soleil, versSoleil, lumiere, heureTexte } from './maquette.js';

const ml = window.maplibregl;
const conteneur = document.getElementById('carte');
const D = JSON.parse((document.getElementById('carte-data') || {}).textContent || 'null');

const STYLE_IGN = 'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json';
const AXES = ['autoroute', 'route principale', 'route regionale'];
const HAUTEUR_BATI = ['coalesce', ['get', 'hauteur'], ['get', 'HAUTEUR'], 10];
// Autour d'un programme choisi, les immeubles voisins sont abaissés pour que la maquette ressorte sans être cachée
const hauteurBati = facteur => facteur === 1 ? HAUTEUR_BATI : ['*', HAUTEUR_BATI, facteur];
const adoucir = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// Anime une valeur de a à b ; renvoie une fonction pour l'arrêter
function animer(ms, f, delai = 0) {
  let fini = false, t0 = null;
  const pas = t => { if (fini) return; if (t0 == null) t0 = t; const x = Math.min(1, Math.max(0, (t - t0 - delai) / ms)); f(adoucir(x)); if (x < 1) requestAnimationFrame(pas); };
  requestAnimationFrame(pas);
  return () => { fini = true; };
}

function epure(style) {
  const out = [];
  for (const l of style.layers) {
    const sl = l['source-layer'] || '', i = l.id.toLowerCase();
    if (l.type === 'symbol' || l.type === 'circle') continue;
    if (/^(toponyme|limite|oro|bati_surf|bati_ponc|bati_lin|routier_chemin|routier_surf|routier_liaison|parcellaire)/.test(sl)) continue;
    // Petites rues : seulement de près (quartier d'un programme), comme fond d'environnement
    if (sl.startsWith('routier_route') && !AXES.some(a => i.includes(a))) { out.push({ ...l, minzoom: Math.max(l.minzoom || 0, 15) }); continue; }
    out.push(l);
  }
  // Immeubles en relief, en tons clairs (comme les immeubles qui sortent du sol dans les vidéos)
  out.push({
    id: 'glr-bati', type: 'fill-extrusion', source: 'plan_ign', 'source-layer': 'bati_surf', minzoom: 12,
    paint: {
      'fill-extrusion-color': '#F2EDE3',
      'fill-extrusion-height': HAUTEUR_BATI,
      'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 12.3, 0, 13.3, 0.92],
      'fill-extrusion-vertical-gradient': true,
    },
  });
  return { ...style, layers: out };
}

async function demarrer() {
  const style = epure(await (await fetch(STYLE_IGN)).json());
  const villes = D.villes || [];
  const tous = villes.flatMap(v => v.p.map(p => [p.o, p.a]));
  const map = new ml.Map({
    container: conteneur, style, attributionControl: false, maxPitch: 70,
    bounds: bornes([[1.88, 48.62], [2.82, 49.08]]), fitBoundsOptions: { padding: 20 }, pitch: 0, // vue d'ensemble de l'Île-de-France, du dessus
    cooperativeGestures: false, dragRotate: true,
  });
  map.addControl(new ml.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');
  map.addControl(new ml.AttributionControl({ compact: true, customAttribution: 'Fond de carte : IGN · contours geo.api.gouv.fr' }));
  map.scrollZoom.disable();
  conteneur.addEventListener('wheel', () => {}, { passive: true });
  await new Promise(r => map.on('load', r));

  // Départements d'Île-de-France, comme l'ouverture des vidéos Quoi de neuf : chacun sa teinte, liseré blanc ombré de sa couleur
  const TEINTES = { '75': '#AFC0DE', '92': '#E3C3D6', '93': '#F2D3A4', '94': '#D3C2E6', '95': '#C9DCE4', '78': '#D3E2C1', '91': '#E9DDB4', '77': '#E7D3C3' };
  const BORDS = { '75': '#7F95C4', '92': '#C98FB2', '93': '#E0A85E', '94': '#A98BCB', '95': '#93B6C6', '78': '#9DBB82', '91': '#CDB565', '77': '#C9A88F' };
  const teinte = obj => ['match', ['get', 'd'], ...Object.entries(obj).flat(), '#DDDDDD'];
  try {
    const deps = await (await fetch('/neuf/donnees/departements-idf.json')).json();
    map.addSource('deps', { type: 'geojson', data: deps });
    map.addLayer({ id: 'dep-fond', type: 'fill', source: 'deps', paint: { 'fill-color': teinte(TEINTES), 'fill-opacity': 0.55 } });
    map.addLayer({ id: 'dep-ombre', type: 'line', source: 'deps', paint: { 'line-color': teinte(BORDS), 'line-width': 10, 'line-blur': 8, 'line-opacity': 0.75, 'line-offset': 5 } });
    map.addLayer({ id: 'dep-trait', type: 'line', source: 'deps', paint: { 'line-color': '#FFFFFF', 'line-width': 3, 'line-opacity': 1 } });
    const CENTRES = { '75': [2.35, 48.857], '92': [2.215, 48.83], '93': [2.49, 48.925], '94': [2.47, 48.775], '95': [2.15, 49.07], '78': [1.92, 48.80], '91': [2.25, 48.56], '77': [2.95, 48.62] };
    window.__numeros = Object.entries(CENTRES).map(([d, c]) => { const el = document.createElement('span'); el.className = 'num-dep'; el.textContent = d; return new ml.Marker({ element: el }).setLngLat(c).addTo(map); });
  } catch (e) { /* sans départements, la carte reste utilisable */ }
  const departements = visibles => {
    if (!map.getLayer('dep-fond')) return;
    animer(1200, x => {
      const k = visibles ? x : 1 - x;
      map.setPaintProperty('dep-fond', 'fill-opacity', 0.12 + 0.43 * k);
      map.setPaintProperty('dep-ombre', 'line-opacity', 0.2 + 0.55 * k);
      map.setPaintProperty('dep-trait', 'line-opacity', 0.5 + 0.5 * k);
    });
    (window.__numeros || []).forEach(m => { m.getElement().style.display = visibles ? '' : 'none'; });
  };

  // Contours des communes : liseré blanc, ombré de bleu à l'intérieur
  const contours = { type: 'FeatureCollection', features: villes.filter(v => v.c).map(v => ({ ...v.c, properties: { s: v.s } })) };
  map.addSource('communes', { type: 'geojson', data: contours });
  map.addLayer({ id: 'commune-fond', type: 'fill', source: 'communes', paint: { 'fill-color': '#005875', 'fill-opacity': ['case', ['==', ['get', 's'], ''], 0.08, 0.025] } });
  map.addLayer({ id: 'commune-ombre', type: 'line', source: 'communes', paint: { 'line-color': '#005875', 'line-width': 9, 'line-blur': 7, 'line-opacity': 0.35, 'line-offset': 4 } });
  map.addLayer({ id: 'commune-trait', type: 'line', source: 'communes', paint: { 'line-color': '#FFFFFF', 'line-width': 3.2 } });
  const choisirCommune = s => {
    map.setPaintProperty('commune-fond', 'fill-opacity', ['case', ['==', ['get', 's'], s || ''], 0.09, 0.02]);
    map.setPaintProperty('commune-ombre', 'line-opacity', ['case', ['==', ['get', 's'], s || ''], 0.55, 0.18]);
  };

  // Repères des programmes
  const marqueurs = [];
  for (const v of villes) for (const p of v.p) {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'repere' + (p.k ? ' picking' : ''); el.title = p.n; el.setAttribute('aria-label', p.n);
    el.addEventListener('click', ev => { ev.stopPropagation(); if (p.L) focus(v, p); else location.href = '/neuf/' + p.u; });
    el.style.display = 'none'; // les repères n'apparaissent qu'une fois la ville choisie
    marqueurs.push({ m: new ml.Marker({ element: el }).setLngLat([p.o, p.a]).addTo(map), p, v });
  }

  // Panneau d'un programme
  const panneau = document.getElementById('panneau');
  const heure = document.getElementById('carte-heure'), sortieH = document.getElementById('carte-heure-val');
  let couche = null, enCours = null, villeEnCours = null;

  let stopBati = null, stopTour = null;
  const bati = (de, a, ms, delai) => { if (stopBati) stopBati(); stopBati = animer(ms, x => map.setPaintProperty('glr-bati', 'fill-extrusion-height', hauteurBati(Math.max(0.001, de + (a - de) * x))), delai); };
  const arreterTour = () => { if (stopTour) { stopTour(); stopTour = null; } };
  ['mousedown', 'touchstart', 'wheel'].forEach(t => conteneur.addEventListener(t, arreterTour, { passive: true }));
  function quitter() {
    arreterTour();
    if (couche) { map.removeLayer(couche.id); couche = null; }
    enCours = null; if (panneau) panneau.hidden = true;
    marqueurs.forEach(x => { x.m.getElement().style.display = x.v.s === villeEnCours ? '' : 'none'; });
    map.setFilter('glr-bati', null);
  }

  function focus(v, p) {
    villeEnCours = v.s; quitter(); enCours = p;
    marqueurs.forEach(x => { x.m.getElement().style.display = x.p === p ? 'none' : ''; });
    choisirCommune(v.s);
    map.flyTo({ center: [p.o, p.a], zoom: 17.1, pitch: 52, bearing: -28, offset: [0, -30], duration: 2600, essential: true, curve: 1.5 });
    bati(1, 0.35, 1600, 600);
    couche = coucheImmeuble(map, p);
    map.addLayer(couche);
    // L'immeuble se construit étage par étage à l'arrivée, puis la caméra tourne lentement autour
    couche.batir(1800, 2000);
    const ici = couche;
    setTimeout(() => {
      if (couche !== ici) return;
      const b0 = map.getBearing();
      stopTour = animer(24000, x => map.setBearing(b0 + 70 * x));
    }, 4000);
    if (panneau) {
      panneau.querySelector('.titre').textContent = p.n;
      panneau.querySelector('.sous').textContent = [p.l ? 'Livraison ' + p.l : '', p.d || ''].filter(Boolean).join(' · ');
      panneau.querySelector('a.voir').href = '/neuf/' + p.u;
      panneau.hidden = false;
    }
    placerSoleil();
    // On enlève les bâtiments existants juste sous la maquette pour qu'elle ne s'y mélange pas
    map.once('idle', () => {
      const pt = map.project([p.o, p.a]);
      const sous = map.queryRenderedFeatures([[pt.x - 25, pt.y - 25], [pt.x + 25, pt.y + 25]], { layers: ['glr-bati'] }).map(f => f.id).filter(x => x != null);
      if (sous.length) map.setFilter('glr-bati', ['!', ['in', ['id'], ['literal', sous]]]);
    });
    try { history.replaceState(null, '', '?p=' + p.s); } catch (_) {}
  }

  function placerSoleil() {
    const h = heure ? Number(heure.value) : 14;
    const t = new Date(); t.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    const c = enCours ? [enCours.a, enCours.o] : [48.86, 2.35];
    const s = soleil(t, c[0], c[1]);
    if (sortieH) sortieH.textContent = heureTexte(h) + (s.hauteur < 0 ? ' · nuit' : '');
    const deg = 180 / Math.PI;
    map.setLight({ anchor: 'map', position: [1.5, (s.azimut * deg + 360) % 360, Math.max(10, 90 - s.hauteur * deg)], intensity: s.hauteur < 0 ? 0.12 : 0.3, color: s.hauteur < 0 ? '#9AA8C2' : (s.hauteur < 0.14 ? '#FFD9B5' : '#FFFFFF') });
    if (couche) couche.soleil(s);
  }
  if (heure) heure.addEventListener('input', placerSoleil);
  const retour = document.getElementById('carte-retour');
  if (retour) retour.addEventListener('click', () => { if (villeEnCours) montrerVille(villeEnCours); else quitter(); try { history.replaceState(null, '', location.pathname + (D.ville ? '' : '?ville=' + villeEnCours)); } catch (_) {} });

  // Accès depuis la recherche (page des villes) et depuis l'adresse ?p=
  // Étape 2 : une ville choisie → la caméra s'incline, la commune et ses immeubles en relief, ses programmes
  function montrerVille(s) {
    const v = villes.find(x => x.s === s); if (!v) return;
    if (!villeEnCours) departements(false);
    villeEnCours = s; quitter(); choisirCommune(s);
    const pts = v.c ? v.c.geometry.coordinates.flat(v.c.geometry.type === 'MultiPolygon' ? 2 : 1) : v.p.map(p => [p.o, p.a]);
    const cam = map.cameraForBounds(bornes(pts), { padding: 30 });
    map.flyTo({ center: cam.center, zoom: Math.max(14.1, cam.zoom + 0.7), pitch: 58, bearing: -18, duration: 2600, essential: true, curve: 1.6 });
    // La ville sort de terre pendant l'arrivée de la caméra, puis les programmes apparaissent un à un
    map.setPaintProperty('glr-bati', 'fill-extrusion-height', hauteurBati(0.001));
    bati(0.001, 1, 1900, 1100);
    animer(1400, x => map.setPaintProperty('commune-trait', 'line-width', 3.2 + 4 * Math.sin(Math.PI * x)), 900);
    let n = 0;
    marqueurs.forEach(x => {
      const el = x.m.getElement();
      if (x.v.s !== s) return;
      el.style.display = 'none';
      setTimeout(() => { if (villeEnCours === s && !enCours) { el.style.display = ''; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } }, 2700 + 90 * n++);
    });
  }
  // On montre toujours d'abord l'Île-de-France vue du dessus, puis on plonge vers la ville demandée
  // L'intro ne démarre que lorsque la carte est vraiment à l'écran (sinon le client ne verrait pas l'Île-de-France)
  const INTRO = 1800;
  let vueA = null; const attente = [];
  new IntersectionObserver((es, ob) => { if (es.some(e => e.isIntersecting)) { vueA = Date.now(); ob.disconnect(); attente.splice(0).forEach(f => f()); } }, { threshold: 0.6 }).observe(conteneur);
  const apresIntro = f => { const go = () => setTimeout(f, Math.max(0, INTRO - (Date.now() - vueA))); if (vueA) go(); else attente.push(go); };
  window.GLRCarte = { ville: s => apresIntro(() => montrerVille(s)) };
  // Un clic sur une commune la choisit aussi (page des villes)
  map.on('click', 'commune-fond', ev => {
    if (enCours) return;
    const s = ev.features[0] && ev.features[0].properties.s;
    if (s && s !== villeEnCours) { if (window.GLRChoixVille) window.GLRChoixVille(s); else montrerVille(s); }
  });
  map.on('mouseenter', 'commune-fond', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'commune-fond', () => { map.getCanvas().style.cursor = ''; });
  const voulu = new URLSearchParams(location.search).get('p');
  const prog = voulu && villes.map(v => [v, v.p.find(x => x.s === voulu && x.L)]).find(x => x[1]);
  if (prog) apresIntro(() => { montrerVille(prog[0].s); setTimeout(() => focus(prog[0], prog[1]), 4200); });
  else if (D.ville) apresIntro(() => montrerVille(D.ville));
  placerSoleil();
}

function bornes(pts) {
  const b = new ml.LngLatBounds(pts[0], pts[0]);
  pts.forEach(x => b.extend(x));
  return b;
}

// Couche 3D personnalisée : la maquette three.js posée à la position du programme, à l'échelle réelle (mètres)
function coucheImmeuble(map, p) {
  const origine = ml.MercatorCoordinate.fromLngLat([p.o, p.a], 0);
  const echelle = origine.meterInMercatorCoordinateUnits();
  const imm = construire(p.L, { arbres: true });
  const scene = new THREE.Scene();
  scene.add(imm.racine);
  const ombre = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.ShadowMaterial({ opacity: 0.28 }));
  ombre.rotation.x = -Math.PI / 2; ombre.position.y = 0.05; ombre.receiveShadow = true; scene.add(ombre);
  const ciel = new THREE.HemisphereLight(0xFFFBF2, 0xB9AE98, 1.2); scene.add(ciel);
  const astre = new THREE.DirectionalLight(0xFFF1DA, 2.2);
  astre.castShadow = true; astre.shadow.mapSize.set(2048, 2048);
  Object.assign(astre.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 500 });
  astre.shadow.bias = -0.0005;
  scene.add(astre); scene.add(astre.target);
  const camera = new THREE.Camera();
  let renderer = null;
  const transfo = new THREE.Matrix4().makeTranslation(origine.x, origine.y, origine.z)
    .scale(new THREE.Vector3(echelle, -echelle, echelle))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  // y de three.js vers le haut ; après la rotation, +z de la maquette pointe vers le sud de la carte

  return {
    id: 'glr-immeuble', type: 'custom', renderingMode: '3d',
    onAdd(m, gl) {
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    },
    render(gl, matrix) {
      camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(transfo);
      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },
    batir(ms, delai) {
      imm.couper(1);
      animer(ms, x => { imm.couper(1 + Math.round(x * (imm.F - 1))); map.triggerRepaint(); }, delai);
    },
    soleil(s) {
      const v = versSoleil(s), lu = lumiere(s);
      astre.position.copy(v.multiplyScalar(200)); astre.target.position.set(0, 0, 0);
      astre.intensity = lu.force; astre.color.setHex(lu.couleur); ciel.intensity = lu.ciel;
      map.triggerRepaint();
    },
  };
}

if (ml && conteneur && D) demarrer().catch(e => { console.error(e); conteneur.innerHTML = '<p class="note" style="padding:16px">La carte ne s’affiche pas sur cet appareil.</p>'; });
