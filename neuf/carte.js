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

function epure(style) {
  const out = [];
  for (const l of style.layers) {
    const sl = l['source-layer'] || '', i = l.id.toLowerCase();
    if (l.type === 'symbol' || l.type === 'circle') continue;
    if (/^(toponyme|limite|oro|bati_surf|bati_ponc|bati_lin|routier_chemin|routier_surf|routier_liaison|parcellaire)/.test(sl)) continue;
    if (sl.startsWith('routier_route') && !AXES.some(a => i.includes(a))) continue;
    out.push(l);
  }
  // Immeubles en relief, en tons clairs (comme les immeubles qui sortent du sol dans les vidéos)
  out.push({
    id: 'glr-bati', type: 'fill-extrusion', source: 'plan_ign', 'source-layer': 'bati_surf', minzoom: 14,
    paint: {
      'fill-extrusion-color': '#F2EDE3',
      'fill-extrusion-height': ['coalesce', ['get', 'hauteur'], ['get', 'HAUTEUR'], 10],
      'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.92],
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
    bounds: bornes(tous.length ? tous : [[2.2, 48.8], [2.5, 48.95]]), fitBoundsOptions: { padding: 40 },
    cooperativeGestures: false, dragRotate: true,
  });
  map.addControl(new ml.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');
  map.addControl(new ml.AttributionControl({ compact: true, customAttribution: 'Fond de carte : IGN · contours geo.api.gouv.fr' }));
  map.scrollZoom.disable();
  conteneur.addEventListener('wheel', () => {}, { passive: true });
  await new Promise(r => map.on('load', r));

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
    el.addEventListener('click', ev => { ev.stopPropagation(); if (p.L) focus(v, p); else location.href = '/neuf/' + p.u + (p.u.includes('/') ? '' : ''); });
    marqueurs.push({ m: new ml.Marker({ element: el }).setLngLat([p.o, p.a]).addTo(map), p, v });
  }

  // Panneau d'un programme
  const panneau = document.getElementById('panneau');
  const heure = document.getElementById('carte-heure'), sortieH = document.getElementById('carte-heure-val');
  let couche = null, enCours = null;

  function quitter() {
    if (couche) { map.removeLayer(couche.id); couche = null; }
    enCours = null; if (panneau) panneau.hidden = true;
    marqueurs.forEach(x => { x.m.getElement().style.display = ''; });
    map.setFilter('glr-bati', null);
  }

  function focus(v, p) {
    quitter(); enCours = p;
    marqueurs.forEach(x => { x.m.getElement().style.display = x.p === p ? 'none' : ''; });
    choisirCommune(v.s);
    map.flyTo({ center: [p.o, p.a], zoom: 18.1, pitch: 60, bearing: -28, offset: [0, -40], duration: 2200, essential: true });
    couche = coucheImmeuble(map, p);
    map.addLayer(couche);
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
  if (retour) retour.addEventListener('click', () => { quitter(); map.fitBounds(bornes(tous), { padding: 40, pitch: 0, bearing: 0, duration: 1400 }); try { history.replaceState(null, '', location.pathname); } catch (_) {} });

  // Accès depuis la recherche (page des villes) et depuis l'adresse ?p=
  window.GLRCarte = {
    ville(s) {
      const v = villes.find(x => x.s === s); if (!v) return;
      quitter(); choisirCommune(s);
      const pts = v.c ? v.c.geometry.coordinates.flat(2).reduce((a, x, i, arr) => (i % 2 ? a : a.concat([[x, arr[i + 1]]])), []) : v.p.map(p => [p.o, p.a]);
      map.fitBounds(bornes(pts), { padding: 30, pitch: 35, bearing: -12, duration: 1600 });
    },
  };
  if (D.ville) choisirCommune(D.ville);
  const voulu = new URLSearchParams(location.search).get('p');
  if (voulu) for (const v of villes) { const p = v.p.find(x => x.s === voulu && x.L); if (p) { focus(v, p); break; } }
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
    soleil(s) {
      const v = versSoleil(s), lu = lumiere(s);
      astre.position.copy(v.multiplyScalar(200)); astre.target.position.set(0, 0, 0);
      astre.intensity = lu.force; astre.color.setHex(lu.couleur); ciel.intensity = lu.ciel;
      map.triggerRepaint();
    },
  };
}

if (ml && conteneur && D) demarrer().catch(e => { console.error(e); conteneur.innerHTML = '<p class="note" style="padding:16px">La carte ne s’affiche pas sur cet appareil.</p>'; });
