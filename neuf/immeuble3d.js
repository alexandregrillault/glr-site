// Page programme : maquette 3D seule, qu'on fait tourner, avec coupe par étage, filtre de taille et soleil selon l'heure.
// Données : <script type="application/json" id="logements-data">. Prix : window.GLR_PRIX (servi par la base).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { construire, decorRue, COULEURS, soleil, versSoleil, lumiere, heureTexte } from './maquette.js';

const zone = document.getElementById('imm3d');
const donnees = document.getElementById('logements-data');
if (zone && donnees) demarrer(JSON.parse(donnees.textContent));

function demarrer(L) {
  const bulle = document.getElementById('bulle');
  const lat = Number(zone.dataset.lat) || 48.86, lng = Number(zone.dataset.lng) || 2.35;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
  catch (e) { window.dispatchEvent(new Event('glr-3d-ko')); return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  zone.prepend(renderer.domElement);

  const imm = construire(L, { arbres: false });
  imm.animer(true);
  const scene = new THREE.Scene();
  scene.add(imm.racine);
  const haut = imm.hauteur, largeur = imm.largeur, profondeur = imm.profondeur;
  const d = Math.max(largeur * 1.1, haut) * 1.55 + 12;
  const RAYON = d * 1.3; // la caméra ne s'éloigne jamais plus : le décor commence au-delà
  scene.add(decorRue(imm, RAYON));
  scene.fog = new THREE.Fog(0xF4F0E8, d * 3.4, d * 7);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 800);
  // Vue du bas : on regarde la façade depuis la rue, légèrement de côté, comme un passant
  // Vue d'ensemble : l'immeuble sur son terrain, de trois-quarts et d'un peu haut, comme un plan de masse en relief
  camera.position.set(d * 0.42, haut * 0.8 + d * 0.38, d * 0.95);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, haut * 0.5, 0);
  // Souris : glisser = tourner et changer l'angle, molette = zoom, clic droit (ou deux doigts) = se déplacer dans la rue
  Object.assign(controls, { enableDamping: true, enablePan: true, screenSpacePanning: false, enableZoom: true, zoomSpeed: 0.9, minDistance: d * 0.3, maxDistance: RAYON, maxPolarAngle: Math.PI * 0.5 - 0.02, autoRotate: false });
  // on se promène autour de l'immeuble, mais la cible reste près de lui : la caméra ne peut pas atteindre le décor
  const borner = () => { const t = controls.target, m = d * 0.22; t.x = Math.max(-m, Math.min(m, t.x)); t.z = Math.max(-m, Math.min(m, t.z)); t.y = Math.max(1, Math.min(haut, t.y)); };
  renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false; });
  // Arrivée : la caméra finit le zoom commencé sur la carte, du dessus jusqu'à la vue du bas
  const bas = camera.position.clone();
  let arrivee = null;
  try { if (sessionStorage.getItem('glr-arrivee')) { sessionStorage.removeItem('glr-arrivee'); arrivee = -1; } } catch (_) {} // -1 : le chrono démarre à la première image vraiment affichée
  // Départ : exactement la vue de la carte en fin de zoom (du dessus, nord en haut, même échelle : ~0,16 m par pixel)
  if (arrivee) { camera.position.set(0, haut * 0.5 + 0.158 * Math.max(320, zone.clientWidth * 0.6) / 0.573, 0.02); controls.enabled = false; }
  const adoucir = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const haut0 = camera.position.clone();

  const sol = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshStandardMaterial({ color: 0xEDE3CE, roughness: 1 })); // même teinte que le sol de la carte
  sol.rotation.x = -Math.PI / 2; sol.receiveShadow = true; scene.add(sol);
  const pelouse = new THREE.Mesh(new THREE.PlaneGeometry(largeur + 10, profondeur + 10), new THREE.MeshStandardMaterial({ color: 0xC9D2B4, roughness: 1 }));
  pelouse.rotation.x = -Math.PI / 2; pelouse.position.y = 0.02; pelouse.receiveShadow = true; scene.add(pelouse);
  const nord = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 3), new THREE.MeshStandardMaterial({ color: 0xB0894C }));
  nord.rotation.x = -Math.PI / 2; nord.position.set(largeur / 2 + 7, 0.1, -profondeur / 2 - 6); scene.add(nord);

  const ciel = new THREE.HemisphereLight(0xFFFBF2, 0xB9AE98, 1.2); scene.add(ciel);
  const astre = new THREE.DirectionalLight(0xFFF1DA, 2.4);
  astre.castShadow = true; astre.shadow.mapSize.set(2048, 2048);
  const ext = Math.max(largeur, profondeur, haut) * 1.6 + 12;
  Object.assign(astre.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 600 });
  astre.shadow.bias = -0.0004;
  scene.add(astre); scene.add(astre.target);

  const heure = document.getElementById('heure'), sortieH = document.getElementById('heure-val');
  const placerSoleil = () => {
    const h = heure ? Number(heure.value) : 14;
    const t = new Date(); t.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    const s = soleil(t, lat, lng), v = versSoleil(s), lu = lumiere(s);
    astre.position.copy(v.multiplyScalar(d * 1.2)); astre.target.position.set(0, 0, 0);
    astre.intensity = lu.force; astre.color.setHex(lu.couleur); ciel.intensity = lu.ciel;
    if (sortieH) sortieH.textContent = heureTexte(h) + (s.hauteur < 0 ? ' · nuit' : '');
  };
  if (heure) heure.addEventListener('input', () => { controls.autoRotate = false; placerSoleil(); });
  placerSoleil();

  const coupe = document.getElementById('coupe'), sortieC = document.getElementById('coupe-val');
  if (coupe) {
    coupe.max = String(imm.F); coupe.min = '1'; coupe.value = String(imm.F);
    const maj = () => {
      const k = Number(coupe.value);
      if (sortieC) sortieC.textContent = k >= imm.F ? 'Tout l’immeuble' : (k === 1 ? 'Rez-de-chaussée' : (k - 1) + (k === 2 ? 'er' : 'e') + ' étage');
      imm.couper(k);
    };
    coupe.addEventListener('input', () => { controls.autoRotate = false; maj(); });
    maj();
  }
  let filtre = '';
  document.querySelectorAll('.immeuble .filtres button').forEach(b => b.addEventListener('click', () => {
    filtre = b.getAttribute('data-t') || ''; controls.autoRotate = false; imm.filtrer(filtre);
  }));

  const ray = new THREE.Raycaster(), souris = new THREE.Vector2();
  let vise = null;
  const fiche = (m, ev) => {
    if (vise && vise !== m) vise.scale.set(1, 1, 1);
    vise = m;
    if (!m) return; // la fiche reste affichée sous la maquette
    m.scale.set(1.03, 1.03, 1.03);
    const l = m.userData.l, pr = window.GLR_PRIX && window.GLR_PRIX[l.i], pr2 = window.GLR_PRIX_R && window.GLR_PRIX_R[l.i];
    bulle.innerHTML = '<b>' + l.t + '</b> · ' + String(l.s).replace('.', ',') + '\u00a0m² · ' +
      (l.e ? l.e + (l.e === 1 ? 'er' : 'e') + ' étage' : 'Rez-de-chaussée') + (l.x ? ' · ' + l.x : '') + ' · ' +
      (pr || pr2 ? [pr ? '<b>' + Math.round(pr).toLocaleString('fr-FR') + '\u00a0€</b>' : '', pr2 ? '<b>' + Math.round(pr2).toLocaleString('fr-FR') + '\u00a0€</b> en TVA\u00a05,5\u00a0%*' : ''].filter(Boolean).join(' · ') : 'Prix sur demande');
  };
  const toucher = ev => {
    const r = renderer.domElement.getBoundingClientRect();
    souris.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(souris, camera);
    const vis = imm.lots.filter(m => m.parent.visible && (!filtre || m.userData.l.t === filtre));
    const h = ray.intersectObjects(vis, false)[0];
    return h ? h.object : null;
  };
  renderer.domElement.addEventListener('pointermove', ev => { if (ev.pointerType === 'mouse') { const m = toucher(ev); fiche(m, ev); sortir(m); } });
  renderer.domElement.addEventListener('pointerleave', () => { fiche(null); sortant = null; });
  let depart = null, choisi = null;
  renderer.domElement.addEventListener('pointerdown', ev => { depart = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointerup', ev => {
    if (!depart || Math.hypot(ev.clientX - depart[0], ev.clientY - depart[1]) > 6) return;
    const m = toucher(ev); fiche(m, ev);
    // La fenêtre touchée prend la couleur de sa taille (T2, T3…) et le reste : on voit quelle typologie est où
    if (choisi && choisi !== m) { choisi.material = choisi.userData.mats; }
    if (m) { const col = COULEURS[m.userData.l.t] || 0x5E97AB; m.material = m.userData.mats.map(mt => { const c = mt.clone(); c.color.setHex(col); if (c.emissive) { c.emissive.setHex(col); c.emissiveIntensity = 0.25; } return c; }); }
    choisi = m || choisi;
    if (m) {
      document.querySelectorAll('tr.vise').forEach(z => z.classList.remove('vise'));
      const tr = document.getElementById('l-' + m.userData.l.i); if (tr) tr.classList.add('vise');
    }
  });

  const taille = () => {
    const w = zone.clientWidth || 600, h = Math.round(Math.min(480, Math.max(260, w * 0.68)));
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', taille); taille();
  // Logement qui ressort de l'immeuble : survol d'une ligne de la liste ou d'une fenêtre
  const parId = {}; imm.lots.forEach(m => { parId[m.userData.l.i] = m; m.userData.z0 = m.position.z; m.userData.sorti = 0; });
  let sortant = null;
  const sortir = m => {
    if (sortant === m) return; sortant = m;
    if (!m) return;
  };
  // Depuis la liste seulement, et après un court arrêt sur la ligne : si le logement est sur la façade opposée,
  // la caméra fait le tour une fois, en douceur. Jamais pendant qu'on manipule la vue à la souris.
  let tour = null, attenteTour = null, enMain = false;
  renderer.domElement.addEventListener('pointerdown', () => { enMain = true; tour = null; vu = true; if (geste) geste.remove(); clearTimeout(attenteTour); if (!arrivee) controls.enabled = true; });
  window.addEventListener('pointerup', () => { enMain = false; });
  const faireFace = m => {
    clearTimeout(attenteTour);
    attenteTour = setTimeout(() => {
      if (arrivee || enMain || tour || sortant !== m) return;
      const devant = m.userData.z0 > 0, cz = camera.position.z - controls.target.z;
      if ((cz > 0) === devant && Math.abs(cz) > 4) return;       // déjà du bon côté
      const dx = camera.position.x - controls.target.x, r = Math.hypot(dx, cz), a0 = Math.atan2(cz, dx);
      let a1 = Math.atan2((devant ? 1 : -1) * Math.abs(Math.sin(1.15)) , Math.cos(1.15) * (dx >= 0 ? 1 : -1));
      let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      tour = { t0: performance.now(), dur: 1100, a0, da, r0: r, r1: r, y0: camera.position.y, y1: camera.position.y }; controls.enabled = false;
    }, 280);
  };
  document.querySelectorAll('table.lots tr[id^="l-"]').forEach(tr => {
    const m = parId[tr.id.slice(2)]; if (!m) return;
    const entrer = () => { sortir(m); fiche(m); faireFace(m); document.querySelectorAll('tr.vise').forEach(z => z.classList.remove('vise')); tr.classList.add('vise'); };
    tr.addEventListener('mouseenter', entrer); tr.addEventListener('click', entrer); tr.addEventListener('focusin', entrer);
    tr.addEventListener('mouseleave', () => { clearTimeout(attenteTour); if (sortant === m) sortant = null; tr.classList.remove('vise'); });
  });
  // ——— Changer d'angle : le geste est montré une fois, et quatre boutons mènent aux vues utiles ———
  let vu = false, etageVu = null;
  const geste = document.getElementById('geste');
  const allerA = (az, r1, y1, dur, extra = {}) => {
    controls.target.x = 0; controls.target.z = 0;
    const dx = camera.position.x - controls.target.x, dz = camera.position.z - controls.target.z, a0 = Math.atan2(dz, dx);
    let da = az == null ? 0 : az - a0; if (az != null && !extra.tourComplet) { while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; }
    if (extra.tourComplet) da = 2 * Math.PI;
    tour = { t0: performance.now(), dur, a0, da, r0: Math.hypot(dx, dz), r1: r1 == null ? Math.hypot(dx, dz) : r1, y0: camera.position.y, y1: y1 == null ? camera.position.y : y1, ty0: controls.target.y, ty1: extra.cibleY == null ? haut * 0.5 : extra.cibleY, ...extra };
    controls.enabled = false;
  };
  const RUE = [Math.atan2(1.02, 0.38), Math.hypot(d * 0.38, d * 1.02), haut * 0.16 + 1.7];
  // Étages (liste à gauche du cadre) : l'immeuble est découvert jusqu'à l'étage choisi, vu de haut, logements étiquetés
  const ENSEMBLE = [Math.atan2(0.95, 0.42), Math.hypot(d * 0.42, d * 0.95), haut * 0.8 + d * 0.38];
  window.addEventListener('glr-etage', ev => {
    const e = ev.detail.e; vu = true; if (geste) geste.remove(); etageVu = e; imm.lots.forEach(m => m.scale.set(1, 1, 1));
    if (e == null) { imm.couper(imm.F); if (ev.detail.camera && !arrivee) allerA(ENSEMBLE[0], ENSEMBLE[1], ENSEMBLE[2], 1100); return; }
    imm.couper(e + 1, true);
    // on reste de trois-quarts : la caméra se cale simplement sur l'étage découvert, un peu plus près
    if (ev.detail.camera && !arrivee) allerA(ENSEMBLE[0], d * 0.78, e * 3 + 3 + d * 0.62, 1100, { cibleY: e * 3 + 1 });
  });
  const VUES = {
    ensemble: () => allerA(ENSEMBLE[0], ENSEMBLE[1], ENSEMBLE[2], 1200),
    rue: () => allerA(RUE[0], RUE[1], RUE[2], 1300),
    arriere: () => allerA(RUE[0] + Math.PI, RUE[1], RUE[2], 1500),
    dessus: () => allerA(null, 1.5, haut + d * 1.5, 1300),
    tour: () => allerA(0, null, null, 9000, { tourComplet: true, lineaire: true }),
  };
  document.querySelectorAll('.vues button').forEach(b => b.addEventListener('click', () => { vu = true; if (geste) geste.remove(); if (!arrivee) VUES[b.dataset.vue](); }));
  // À l'arrivée : l'immeuble pivote un peu puis revient, et la pastille « Glissez pour tourner » s'affiche jusqu'au premier geste
  function montrerGeste() {
    if (vu) return;
    if (geste) geste.classList.add('visible');
    const dx = camera.position.x - controls.target.x, dz = camera.position.z - controls.target.z, a = Math.atan2(dz, dx);
    allerA(a - 0.5, null, null, 1200, { suite: () => { if (!vu) allerA(a, null, null, 1300); } });
  }
  if (!arrivee) setTimeout(() => { if (!arrivee) montrerGeste(); }, 900);
  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.addEventListener('pointerdown', () => { renderer.domElement.style.cursor = 'grabbing'; });
  window.addEventListener('pointerup', () => { renderer.domElement.style.cursor = 'grab'; });
  let images = 0;
  const boucle = () => {
    const t = performance.now();
    if (arrivee) {
      // descente en arc : du dessus de l'immeuble jusqu'à la rue, sans à-coup
      if (arrivee < 0) { if (++images > 3) arrivee = t; }          // on laisse passer les premières images (chargement, ombres)
      const x = arrivee < 0 ? 0 : Math.min(1, Math.max(0, (t - arrivee - 350) / 3200));
      const k = x * x * x * (x * (x * 6 - 15) + 10);                // départ et arrivée très doux, vitesse continue
      // la caméra descend d'abord presque à la verticale, puis glisse vers la rue : une seule courbe, sans palier
      const hk = Math.pow(k, 0.85), zk = Math.pow(k, 1.6);
      camera.position.set(haut0.x + (bas.x - haut0.x) * zk, haut0.y + (bas.y - haut0.y) * hk, haut0.z + (bas.z - haut0.z) * zk);
      camera.up.set(0, 1, 0); camera.lookAt(controls.target);
      if (x >= 1) { arrivee = null; controls.enabled = true; montrerGeste(); }
    }
    if (tour) {
      const x = Math.min(1, (t - tour.t0) / tour.dur), k = tour.lineaire ? x : adoucir(x), a = tour.a0 + tour.da * k, r = tour.r0 + (tour.r1 - tour.r0) * k, y = tour.y0 + (tour.y1 - tour.y0) * k;
      if (tour.ty1 != null) controls.target.y = tour.ty0 + (tour.ty1 - tour.ty0) * k;
      camera.position.set(controls.target.x + r * Math.cos(a), y, controls.target.z + r * Math.sin(a)); camera.lookAt(controls.target);
      if (x >= 1) { const suite = tour.suite; tour = null; controls.enabled = true; if (suite) suite(); }
    }
    for (const m of imm.lots) {
      // étage découvert : le logement visé grossit un peu sur place (son étiquette reste lisible) ; immeuble entier : il ressort de la façade
      if (etageVu != null) { const k = m === sortant ? 1.09 : 1; if (m.scale.x !== k) m.scale.set(k, 1, k); }
      const cible = m === sortant && etageVu == null ? 1 : 0; if (m.userData.sorti === cible) continue;
      m.userData.sorti += Math.sign(cible - m.userData.sorti) * Math.min(Math.abs(cible - m.userData.sorti), 0.12);
      const k = adoucir(m.userData.sorti);
      m.position.z = m.userData.z0 + Math.sign(m.userData.z0) * 1.6 * k;
      if (cible && m.userData.teinte !== 1) { const col = COULEURS[m.userData.l.t] || 0x5E97AB; m.userData.avant = m.material; m.material = m.userData.mats.map(mt => { const c = mt.clone(); c.color.setHex(col); return c; }); m.userData.teinte = 1; }
      if (!cible && m.userData.sorti === 0 && m.userData.teinte === 1) { m.material = m.userData.avant || m.userData.mats; m.userData.teinte = 0; }
    }
    imm.tick();
    if (!arrivee && !tour) { borner(); controls.update(); }
    renderer.render(scene, camera); requestAnimationFrame(boucle);
  };
  boucle();
}
