// Maquette 3D d'un programme, fabriquée à partir des logements disponibles (étage, typologie, extérieur).
// Ce n'est pas le vrai bâtiment : forme générique, place des logements sur l'étage approximative.
// Données : <script type="application/json" id="logements-data">. Prix : window.GLR_PRIX (servi par la base).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const zone = document.getElementById('imm3d');
const donnees = document.getElementById('logements-data');
if (zone && donnees) demarrer(JSON.parse(donnees.textContent));

function demarrer(L) {
  const bulle = document.getElementById('bulle');
  const coupe = document.getElementById('coupe');
  const COUL = { T1: 0xDCE7EC, T2: 0xA9C9D5, T3: 0x5E97AB, T4: 0x005875, 'T5+': 0x003B4F };
  const ORD = ['T1', 'T2', 'T3', 'T4', 'T5+'];

  // Étages et rangement des logements : deux rangées (rue et cour), par taille.
  const parEtage = {};
  let F = 0;
  for (const l of L) { (parEtage[l.e] = parEtage[l.e] || []).push(l); F = Math.max(F, l.e); }
  F += 1;
  let N = 2;
  for (const k in parEtage) {
    parEtage[k].sort((a, b) => ORD.indexOf(a.t) - ORD.indexOf(b.t) || a.s - b.s);
    N = Math.max(N, Math.ceil(parEtage[k].length / 2));
  }
  const W = 4.2, P = 5.2, H = 3; // largeur d'un logement, profondeur d'une rangée, hauteur d'étage (mètres)
  const largeur = N * W, profondeur = 2 * P;

  // Scène
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
  catch (e) { zone.innerHTML = '<p class="note">La maquette 3D ne s’affiche pas sur cet appareil.</p>'; return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  zone.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 600);
  const haut = F * H + 1;
  const d = Math.max(largeur * 1.1, haut) * 1.55 + 12;
  scene.fog = new THREE.Fog(0xF4F0E8, d * 1.6, d * 3.2);
  camera.position.set(d * 0.62, haut * 0.55 + d * 0.42, d * 0.78);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, haut * 0.42, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = d * 0.35;
  controls.maxDistance = d * 1.6;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false; });

  scene.add(new THREE.HemisphereLight(0xFFFBF2, 0xB9AE98, 1.25));
  const soleil = new THREE.DirectionalLight(0xFFF1DA, 2.4);
  soleil.position.set(largeur * 1.5 + 20, haut * 2 + 30, profondeur * 2 + 25);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(2048, 2048);
  const ext = Math.max(largeur, profondeur, haut) * 1.4 + 10;
  Object.assign(soleil.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 400 });
  soleil.shadow.bias = -0.0004;
  scene.add(soleil);

  // Sol : parvis clair, pelouse, arbres simples
  const sol = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshStandardMaterial({ color: 0xF1ECE2, roughness: 1 }));
  sol.rotation.x = -Math.PI / 2; sol.receiveShadow = true; scene.add(sol);
  const pelouse = new THREE.Mesh(new THREE.PlaneGeometry(largeur + 10, profondeur + 10), new THREE.MeshStandardMaterial({ color: 0xC9D2B4, roughness: 1 }));
  pelouse.rotation.x = -Math.PI / 2; pelouse.position.y = 0.02; pelouse.receiveShadow = true; scene.add(pelouse);
  const tronc = new THREE.MeshStandardMaterial({ color: 0x8A6A4F, roughness: 1 });
  const feuille = new THREE.MeshStandardMaterial({ color: 0x9DAF86, roughness: 0.9 });
  const arbres = [[-largeur / 2 - 4, profondeur / 2 + 3], [largeur / 2 + 4, profondeur / 2 + 2], [-largeur / 2 - 3, -profondeur / 2 - 3], [largeur / 2 + 3.5, -profondeur / 2 - 2.5], [0, profondeur / 2 + 6.5]];
  for (const [x, z] of arbres) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 2.2, 8), tronc); t.position.set(x, 1.1, z); t.castShadow = true; scene.add(t);
    const f = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), feuille); f.position.set(x, 3.2, z); f.castShadow = true; scene.add(f);
  }

  // Texture de façade : enduit clair, deux baies vitrées par logement, encadrement laiton discret
  const facade = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 192;
    const g = c.getContext('2d');
    g.fillStyle = '#F3EEE4'; g.fillRect(0, 0, 256, 192);
    g.fillStyle = 'rgba(0,0,0,0.04)'; for (let i = 0; i < 400; i++) g.fillRect(Math.random() * 256, Math.random() * 192, 2, 2);
    for (const x of [28, 140]) {
      const v = g.createLinearGradient(0, 40, 0, 170);
      v.addColorStop(0, '#9FB4BE'); v.addColorStop(0.55, '#5D7884'); v.addColorStop(1, '#3E5560');
      g.fillStyle = '#D9D1C2'; g.fillRect(x - 5, 34, 98, 142);
      g.fillStyle = v; g.fillRect(x, 40, 88, 132);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 6, 46, 10, 120);
      g.fillStyle = '#C9C0AE'; g.fillRect(x + 43, 40, 3, 132);
    }
    g.fillStyle = '#E2DACB'; g.fillRect(0, 186, 256, 6);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  })();
  const matMur = new THREE.MeshStandardMaterial({ color: 0xF3EEE4, roughness: 0.92 });
  const matFacade = new THREE.MeshStandardMaterial({ map: facade, roughness: 0.75 });
  const matDalle = new THREE.MeshStandardMaterial({ color: 0xE7E1D5, roughness: 0.85 });
  const matGardeCorps = new THREE.MeshStandardMaterial({ color: 0xB0894C, roughness: 0.45, metalness: 0.35 });
  const matVerre = new THREE.MeshStandardMaterial({ color: 0xC9DCE2, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.45 });
  const matVendu = new THREE.MeshStandardMaterial({ color: 0xE9E4DA, roughness: 0.95 });
  const matToit = new THREE.MeshStandardMaterial({ color: 0xD9D2C4, roughness: 0.95 });

  // Construction : un volume par emplacement ; les logements disponibles sont cliquables
  const etages = []; // groupes par étage
  const lots = [];
  for (let f = 0; f < F; f++) {
    const gr = new THREE.Group(); gr.position.y = f * H; scene.add(gr); etages.push(gr);
    const rang = parEtage[f] || [];
    // dalle
    const dalle = new THREE.Mesh(new THREE.BoxGeometry(largeur + 0.6, 0.3, profondeur + 0.6), matDalle);
    dalle.position.y = 0.15; dalle.castShadow = dalle.receiveShadow = true; gr.add(dalle);
    for (let r = 0; r < 2; r++) for (let k = 0; k < N; k++) {
      const l = rang[r * N + k];
      const x = -largeur / 2 + W * (k + 0.5), z = r === 0 ? P / 2 : -P / 2;
      const geo = new THREE.BoxGeometry(W - 0.06, H - 0.3, P - 0.06);
      // matériaux par face : +x, -x, +y, -y, +z, -z ; façade sur l'extérieur seulement
      const dehors = r === 0 ? 4 : 5;
      const mats = [matMur, matMur, matMur, matMur, matMur, matMur];
      mats[dehors] = matFacade;
      if (k === 0) mats[1] = matFacade;
      if (k === N - 1) mats[0] = matFacade;
      if (!l) { for (let i = 0; i < 6; i++) if (mats[i] === matMur) mats[i] = matVendu; }
      const plateau = l ? new THREE.MeshStandardMaterial({ color: COUL[l.t] || 0x5E97AB, roughness: 0.7 }) : matMur;
      const m = new THREE.Mesh(geo, mats.map((mt, i) => (i === 2 ? (l ? plateau : matMur) : mt)));
      m.position.set(x, 0.3 + (H - 0.3) / 2, z);
      m.castShadow = m.receiveShadow = true;
      gr.add(m);
      if (l) {
        m.userData = { l, plateau, mats: m.material.slice() };
        lots.push(m);
        // balcon, terrasse, loggia côté extérieur
        if (/balcon|terrasse|loggia/i.test(l.x) && f > 0) {
          const sens = r === 0 ? 1 : -1;
          const prof = /terrasse/i.test(l.x) ? 2.2 : 1.4;
          const b = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.18, prof), matDalle);
          b.position.set(x, 0.4, z + sens * (P / 2 + prof / 2)); b.castShadow = true; gr.add(b);
          const gc = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 1.0, 0.05), matVerre);
          gc.position.set(x, 1.0, z + sens * (P / 2 + prof)); gr.add(gc);
          const main = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.06, 0.08), matGardeCorps);
          main.position.set(x, 1.52, z + sens * (P / 2 + prof)); gr.add(main);
        }
        if (/jardin/i.test(l.x) && f === 0) {
          const sens = r === 0 ? 1 : -1;
          const j = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.06, 3), new THREE.MeshStandardMaterial({ color: 0xB4C49A, roughness: 1 }));
          j.position.set(x, 0.05 - f * H, z + sens * (P / 2 + 1.5)); j.receiveShadow = true; gr.add(j);
        }
      }
    }
  }
  // toit et acrotère laiton
  const toit = new THREE.Group(); toit.position.y = F * H; scene.add(toit);
  const dt = new THREE.Mesh(new THREE.BoxGeometry(largeur + 0.6, 0.35, profondeur + 0.6), matToit); dt.position.y = 0.18; dt.castShadow = true; toit.add(dt);
  const acro = new THREE.Mesh(new THREE.BoxGeometry(largeur + 0.7, 0.5, profondeur + 0.7), matGardeCorps); acro.position.y = 0.6; toit.add(acro);
  const acroIn = new THREE.Mesh(new THREE.BoxGeometry(largeur + 0.2, 0.52, profondeur + 0.2), matToit); acroIn.position.y = 0.62; toit.add(acroIn);

  // Couper l'immeuble à un étage : on voit les logements de cet étage par le dessus, colorés par taille
  let filtre = '';
  const appliquer = () => {
    const k = coupe ? Number(coupe.value) : F;
    etages.forEach((g, i) => { g.visible = i < k; });
    toit.visible = k >= F;
    for (const m of lots) {
      const { l, plateau, mats } = m.userData;
      const allume = !filtre || l.t === filtre;
      const coupeIci = l.e === k - 1 && k < F;
      // vu d'en haut à l'étage coupé, ou filtre actif : le logement prend la couleur de sa taille
      m.material = mats.map((mt, i) => (i === 2 ? (coupeIci ? plateau : mt) : (filtre && allume ? plateau : mt)));
      m.material = m.material.map(mt => {
        if (!filtre || allume) return mt;
        const c = mt.clone(); c.transparent = true; c.opacity = 0.25; return c;
      });
    }
  };
  if (coupe) {
    coupe.max = String(F); coupe.min = '1'; coupe.value = String(F);
    const sortie = document.getElementById('coupe-val');
    const maj = () => { if (sortie) sortie.textContent = Number(coupe.value) >= F ? 'Tout l’immeuble' : (Number(coupe.value) === 1 ? 'Rez-de-chaussée' : (Number(coupe.value) - 1) + (Number(coupe.value) === 2 ? 'er' : 'e') + ' étage'); appliquer(); };
    coupe.addEventListener('input', () => { controls.autoRotate = false; maj(); });
    maj();
  }
  document.querySelectorAll('.immeuble .filtres button').forEach(b => b.addEventListener('click', () => {
    filtre = b.getAttribute('data-t') || '';
    controls.autoRotate = false;
    appliquer();
  }));

  // Survol et toucher : fiche du logement
  const ray = new THREE.Raycaster(), souris = new THREE.Vector2();
  let vise = null;
  const fiche = (m, ev) => {
    if (vise && vise !== m) vise.scale.set(1, 1, 1);
    vise = m;
    if (!m) { bulle.hidden = true; return; }
    m.scale.set(1.03, 1.03, 1.03);
    const l = m.userData.l, pr = window.GLR_PRIX && window.GLR_PRIX[l.i];
    bulle.innerHTML = '<b>' + l.t + '</b> · ' + String(l.s).replace('.', ',') + ' m²<br>' +
      (l.e ? l.e + (l.e === 1 ? 'er' : 'e') + ' étage' : 'Rez-de-chaussée') + (l.x ? ' · ' + l.x : '') + '<br>' +
      (pr ? '<b>' + Math.round(pr).toLocaleString('fr-FR') + ' €</b>' : 'Prix sur demande');
    bulle.hidden = false;
    const r = zone.getBoundingClientRect();
    const X = ev.clientX - r.left, Y = ev.clientY - r.top;
    bulle.style.left = Math.max(6, Math.min(r.width - bulle.offsetWidth - 6, X - bulle.offsetWidth / 2)) + 'px';
    bulle.style.top = Math.max(6, Y - bulle.offsetHeight - 16) + 'px';
  };
  const toucher = ev => {
    const r = renderer.domElement.getBoundingClientRect();
    souris.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(souris, camera);
    const vis = lots.filter(m => m.parent.visible && (!filtre || m.userData.l.t === filtre));
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
      const tr = document.getElementById('l-' + m.userData.l.i);
      document.querySelectorAll('tr.vise').forEach(z => z.classList.remove('vise'));
      if (tr) tr.classList.add('vise');
    }
  });

  // Taille et rendu
  const taille = () => {
    const w = zone.clientWidth, h = Math.round(Math.min(520, Math.max(340, w * 0.72)));
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', taille); taille();
  const boucle = () => { controls.update(); renderer.render(scene, camera); requestAnimationFrame(boucle); };
  boucle();
  zone.classList.add('pret');
}
