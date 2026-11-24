// Page programme : maquette 3D seule, qu'on fait tourner, avec coupe par étage, filtre de taille et soleil selon l'heure.
// Données : <script type="application/json" id="logements-data">. Prix : window.GLR_PRIX (servi par la base).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { construire, soleil, versSoleil, lumiere, heureTexte } from './maquette.js';

const zone = document.getElementById('imm3d');
const donnees = document.getElementById('logements-data');
if (zone && donnees) demarrer(JSON.parse(donnees.textContent));

function demarrer(L) {
  const bulle = document.getElementById('bulle');
  const lat = Number(zone.dataset.lat) || 48.86, lng = Number(zone.dataset.lng) || 2.35;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
  catch (e) { zone.innerHTML = '<p class="note">La maquette 3D ne s’affiche pas sur cet appareil.</p>'; return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  zone.prepend(renderer.domElement);

  const imm = construire(L);
  const scene = new THREE.Scene();
  scene.add(imm.racine);
  const haut = imm.hauteur, largeur = imm.largeur, profondeur = imm.profondeur;
  const d = Math.max(largeur * 1.1, haut) * 1.55 + 12;
  scene.fog = new THREE.Fog(0xF4F0E8, d * 1.6, d * 3.2);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 800);
  camera.position.set(d * 0.62, haut * 0.55 + d * 0.42, d * 0.78);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, haut * 0.42, 0);
  Object.assign(controls, { enableDamping: true, enablePan: false, minDistance: d * 0.35, maxDistance: d * 1.6, maxPolarAngle: Math.PI * 0.47, autoRotate: true, autoRotateSpeed: 0.6 });
  renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false; });

  const sol = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshStandardMaterial({ color: 0xF1ECE2, roughness: 1 }));
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
    // À l'ouverture, l'immeuble se construit étage par étage
    let k = 1; imm.couper(1);
    const monter = setInterval(() => { k++; imm.couper(k); if (k >= imm.F) { clearInterval(monter); maj(); } }, Math.max(90, 1500 / imm.F));
    coupe.addEventListener('input', () => clearInterval(monter), { once: true });
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
  renderer.domElement.addEventListener('pointermove', ev => { if (ev.pointerType === 'mouse') fiche(toucher(ev), ev); });
  renderer.domElement.addEventListener('pointerleave', () => fiche(null));
  let depart = null;
  renderer.domElement.addEventListener('pointerdown', ev => { depart = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointerup', ev => {
    if (!depart || Math.hypot(ev.clientX - depart[0], ev.clientY - depart[1]) > 6) return;
    const m = toucher(ev); fiche(m, ev);
    if (m) {
      document.querySelectorAll('tr.vise').forEach(z => z.classList.remove('vise'));
      const tr = document.getElementById('l-' + m.userData.l.i); if (tr) tr.classList.add('vise');
    }
  });

  const taille = () => {
    const w = zone.clientWidth, h = Math.round(Math.min(520, Math.max(340, w * 0.72)));
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', taille); taille();
  const boucle = () => { controls.update(); renderer.render(scene, camera); requestAnimationFrame(boucle); };
  boucle();
}
