// Maquette 3D d'un immeuble, fabriquée à partir des logements disponibles (étage, typologie, extérieur),
// et position du soleil. Partagée par la page programme (immeuble3d.js) et la carte (carte.js).
// Repère : x = est, y = haut, z = sud, en mètres. Ce n'est pas le vrai bâtiment.
import * as THREE from 'three';

export const COULEURS = { T1: 0xDCE7EC, T2: 0xA9C9D5, T3: 0x5E97AB, T4: 0x005875, 'T5+': 0x003B4F };
const ORD = ['T1', 'T2', 'T3', 'T4', 'T5+'];

let texFacade = null;
export function facade() {
  if (texFacade) return texFacade;
  const c = document.createElement('canvas'); c.width = 256; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#F3EEE4'; g.fillRect(0, 0, 256, 192);
  g.fillStyle = 'rgba(0,0,0,0.035)'; for (let i = 0; i < 400; i++) g.fillRect((i * 97) % 256, (i * 57) % 192, 2, 2);
  for (const x of [28, 140]) {
    const v = g.createLinearGradient(0, 40, 0, 170);
    v.addColorStop(0, '#A7BAC3'); v.addColorStop(0.55, '#5D7884'); v.addColorStop(1, '#3E5560');
    g.fillStyle = '#D9D1C2'; g.fillRect(x - 5, 34, 98, 142);
    g.fillStyle = v; g.fillRect(x, 40, 88, 132);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 6, 46, 10, 120);
    g.fillStyle = '#C9C0AE'; g.fillRect(x + 43, 40, 3, 132);
  }
  g.fillStyle = '#E2DACB'; g.fillRect(0, 186, 256, 6);
  texFacade = new THREE.CanvasTexture(c); texFacade.colorSpace = THREE.SRGBColorSpace; texFacade.anisotropy = 4;
  return texFacade;
}

// Étiquette posée sur le dessus d'un logement : couleur de sa typologie, « T3 » et la surface (comme sur un plan)
function etiquetteLot(l) {
  const c = document.createElement('canvas'); c.width = 168; c.height = 208;
  const g = c.getContext('2d'), col = '#' + (COULEURS[l.t] || 0x5E97AB).toString(16).padStart(6, '0'), clair = l.t === 'T1' || l.t === 'T2';
  g.fillStyle = col; g.fillRect(0, 0, 168, 208);
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 6; g.strokeRect(3, 3, 162, 202);
  g.fillStyle = clair ? '#005875' : '#FFFFFF'; g.textAlign = 'center';
  g.font = '600 62px Archivo, Arial, sans-serif'; g.fillText(l.t, 84, 108);
  g.font = '400 34px Archivo, Arial, sans-serif'; g.fillText(Math.round(l.s) + ' m²', 84, 154);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// L : [{ i: id, t: 'T3', s: 64.2, e: 2, x: 'Balcon' }]
export function construire(L, { arbres = true } = {}) {
  const parEtage = {};
  let F = 0;
  for (const l of L) { (parEtage[l.e] = parEtage[l.e] || []).push(l); F = Math.max(F, l.e); }
  F = Math.max(F + 1, 3);
  let N = 2;
  for (const k in parEtage) {
    parEtage[k].sort((a, b) => ORD.indexOf(a.t) - ORD.indexOf(b.t) || a.s - b.s);
    N = Math.max(N, Math.ceil(parEtage[k].length / 2));
  }
  const W = 4.2, P = 5.2, H = 3;
  const largeur = N * W, profondeur = 2 * P;

  const matMur = new THREE.MeshStandardMaterial({ color: 0xF3EEE4, roughness: 0.92 });
  const matFacade = new THREE.MeshStandardMaterial({ map: facade(), roughness: 0.75 });
  const matDalle = new THREE.MeshStandardMaterial({ color: 0xE7E1D5, roughness: 0.85 });
  const matLaiton = new THREE.MeshStandardMaterial({ color: 0xB0894C, roughness: 0.45, metalness: 0.35 });
  const matVerre = new THREE.MeshStandardMaterial({ color: 0xC9DCE2, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.45 });
  const matVendu = new THREE.MeshStandardMaterial({ color: 0xE9E4DA, roughness: 0.95 });
  const matToit = new THREE.MeshStandardMaterial({ color: 0xD9D2C4, roughness: 0.95 });
  const matJardin = new THREE.MeshStandardMaterial({ color: 0xB4C49A, roughness: 1 });

  const racine = new THREE.Group();
  const etages = [], lots = [];
  for (let f = 0; f < F; f++) {
    const gr = new THREE.Group(); gr.position.y = f * H; racine.add(gr); etages.push(gr);
    const rang = parEtage[f] || [];
    const dalle = new THREE.Mesh(new THREE.BoxGeometry(largeur + 0.6, 0.3, profondeur + 0.6), matDalle);
    dalle.position.y = 0.15; dalle.castShadow = dalle.receiveShadow = true; gr.add(dalle);
    for (let r = 0; r < 2; r++) for (let k = 0; k < N; k++) {
      const l = rang[r * N + k];
      const x = -largeur / 2 + W * (k + 0.5), z = r === 0 ? P / 2 : -P / 2;
      const mats = [matMur, matMur, matMur, matMur, matMur, matMur];
      mats[r === 0 ? 4 : 5] = matFacade;
      if (k === 0) mats[1] = matFacade;
      if (k === N - 1) mats[0] = matFacade;
      if (!l) for (let i = 0; i < 6; i++) if (mats[i] === matMur) mats[i] = matVendu;
      const plateau = l ? new THREE.MeshStandardMaterial({ color: COULEURS[l.t] || 0x5E97AB, roughness: 0.7 }) : null;
      const dessusTexte = l ? new THREE.MeshStandardMaterial({ map: etiquetteLot(l), roughness: 0.7 }) : null;
      const m = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, H - 0.3, P - 0.06), mats.slice());
      m.position.set(x, 0.3 + (H - 0.3) / 2, z);
      m.castShadow = m.receiveShadow = true;
      gr.add(m);
      if (!l) continue;
      m.userData = { l, plateau, dessusTexte, mats: mats.slice() };
      lots.push(m);
      const sens = r === 0 ? 1 : -1;
      if (/balcon|terrasse|loggia/i.test(l.x) && f > 0) {
        const prof = /terrasse/i.test(l.x) ? 2.2 : 1.4;
        const b = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.18, prof), matDalle);
        b.position.set(x, 0.4, z + sens * (P / 2 + prof / 2)); b.castShadow = true; gr.add(b);
        const gc = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 1.0, 0.05), matVerre);
        gc.position.set(x, 1.0, z + sens * (P / 2 + prof)); gr.add(gc);
        const main = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.06, 0.08), matLaiton);
        main.position.set(x, 1.52, z + sens * (P / 2 + prof)); gr.add(main);
      }
      if (/jardin/i.test(l.x) && f === 0) {
        const j = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.06, 3), matJardin);
        j.position.set(x, 0.05, z + sens * (P / 2 + 1.5)); j.receiveShadow = true; gr.add(j);
      }
    }
  }
  const toit = new THREE.Group(); toit.position.y = F * H; racine.add(toit);
  const dt = new THREE.Mesh(new THREE.BoxGeometry(largeur + 0.6, 0.35, profondeur + 0.6), matToit); dt.position.y = 0.18; dt.castShadow = true; toit.add(dt);
  const acro = new THREE.Mesh(new THREE.BoxGeometry(largeur + 0.7, 0.5, profondeur + 0.7), matLaiton); acro.position.y = 0.6; acro.castShadow = true; toit.add(acro);
  const acroIn = new THREE.Mesh(new THREE.BoxGeometry(largeur + 0.2, 0.52, profondeur + 0.2), matToit); acroIn.position.y = 0.62; toit.add(acroIn);

  if (arbres) {
    const tronc = new THREE.MeshStandardMaterial({ color: 0x8A6A4F, roughness: 1 });
    const feuille = new THREE.MeshStandardMaterial({ color: 0x9DAF86, roughness: 0.9 });
    for (const [x, z] of [[-largeur / 2 - 6, profondeur / 2 - 1], [largeur / 2 + 6, profondeur / 2 - 2], [-largeur / 2 - 3, -profondeur / 2 - 3], [largeur / 2 + 3.5, -profondeur / 2 - 2.5]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 2.2, 8), tronc); t.position.set(x, 1.1, z); t.castShadow = true; racine.add(t);
      const f = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), feuille); f.position.set(x, 3.2, z); f.castShadow = true; racine.add(f);
    }
  }

  // Coupe à un étage et filtre de taille
  let coupe = F, filtre = '';
  const appliquer = () => {
    etages.forEach((g, i) => { g.visible = i < coupe; });
    toit.visible = coupe >= F;
    for (const m of lots) {
      const { l, plateau, dessusTexte, mats } = m.userData;
      const allume = !filtre || l.t === filtre;
      const dessus = l.e === coupe - 1 && coupe < F;
      m.material = mats.map((mt, i) => {
        let r = i === 2 ? (dessus ? dessusTexte : (filtre && allume ? plateau : mt)) : (filtre && allume ? plateau : mt);
        if (filtre && !allume) { r = r.clone(); r.transparent = true; r.opacity = 0.22; }
        return r;
      });
    }
  };
  return {
    racine, lots, F, largeur, profondeur, hauteur: F * H + 1.1,
    couper(k) { coupe = Math.max(1, Math.min(F, k)); appliquer(); },
    filtrer(t) { filtre = t || ''; appliquer(); },
  };
}

// Position du soleil (formules astronomiques simplifiées, précision d'environ un degré).
// Renvoie la hauteur au-dessus de l'horizon et l'azimut compté depuis le nord vers l'est, en radians.
export function soleil(date, lat, lng) {
  const rad = Math.PI / 180, e = rad * 23.4397;
  const d = date.getTime() / 86400000 - 10957.5;
  const M = rad * (357.5291 + 0.98560028 * d);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const Ls = M + C + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(Ls) * Math.sin(e));
  const ra = Math.atan2(Math.sin(Ls) * Math.cos(e), Math.cos(Ls));
  const H = rad * (280.16 + 360.9856235 * d) + rad * lng - ra;
  const phi = rad * lat;
  const hauteur = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { hauteur, azimut: az + Math.PI };
}

// Vecteur vers le soleil dans le repère de la maquette (x est, y haut, z sud).
export function versSoleil(s) {
  const c = Math.cos(Math.max(s.hauteur, 0.02));
  return new THREE.Vector3(Math.sin(s.azimut) * c, Math.sin(Math.max(s.hauteur, 0.02)), -Math.cos(s.azimut) * c);
}

// Couleur et force de la lumière selon la hauteur du soleil (aube et soir plus chauds, nuit sombre).
export function lumiere(s) {
  const h = s.hauteur / (Math.PI / 180);
  if (h <= -4) return { force: 0.15, couleur: 0x8C9BB5, ciel: 0.55 };
  if (h < 8) return { force: 0.6 + (h + 4) * 0.08, couleur: 0xFFC58A, ciel: 0.8 };
  return { force: Math.min(2.6, 1.6 + h * 0.025), couleur: 0xFFF1DA, ciel: 1.2 };
}

// Libellé du curseur d'heure
export function heureTexte(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return hh + ' h' + (mm ? String(mm).padStart(2, '0') : '');
}

// Décor autour de l'immeuble pour la vue du bas : une rue devant (chaussée, trottoirs, ligne axiale), quelques immeubles
// voisins de familles différentes sur les côtés et à l'arrière, sapins et feuillus. Décor générique : ce n'est pas le vrai quartier.
export function decorRue(imm, rayon = 60) {
  const g = new THREE.Group(), L = imm.largeur, P = imm.profondeur;
  const plat = (w, d, coul, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: coul, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; g.add(m); return m; };
  const zRue = P / 2 + 11;
  plat(260, 11.4, 0xF3EFE6, 0, 0.03, zRue);       // trottoirs
  plat(260, 7, 0xC4C0B9, 0, 0.05, zRue);          // chaussée
  const tirets = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 0.18), new THREE.MeshBasicMaterial({ color: 0xFFFFFF }), 32), M = new THREE.Matrix4();
  for (let i = 0; i < 32; i++) { M.makeRotationX(-Math.PI / 2).setPosition(-124 + i * 8, 0.07, zRue); tirets.setMatrixAt(i, M); }
  g.add(tirets);
  // Voisins : posés en couronne, au-delà du rayon où la caméra peut circuler (sinon elle traverserait les murs).
  // [angle en degrés (90 = devant, côté rue), largeur, profondeur, étages, famille]
  const FAM = [0xFFFFFF, 0xEADFCB, 0xD9B79C, 0xE3E3DF], TOIT = [0xDDD6C8, 0xCFC6B4, 0xB9A48F, 0xD6D6D1];
  const tex = facade().clone(); tex.needsUpdate = true; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const voisins = [[40, 30, 14, 5, 1], [75, 34, 14, 4, 3], [110, 30, 14, 6, 0], [145, 32, 14, 4, 2], [195, 34, 15, 6, 1], [232, 38, 15, 5, 3], [270, 44, 15, 7, 2], [308, 38, 15, 4, 0], [345, 34, 15, 5, 2]];
  for (const [deg, w, d, n, f] of voisins) {
    const a = deg * Math.PI / 180, r = rayon + 20 + d / 2;
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(Math.round(w / 4.2), n);
    const tc = tex.clone(); tc.needsUpdate = true; tc.repeat.set(Math.round(d / 4.2), n);
    const fa = new THREE.MeshStandardMaterial({ map: t, color: FAM[f], roughness: 0.82 }), co = new THREE.MeshStandardMaterial({ map: tc, color: FAM[f], roughness: 0.82 }), to = new THREE.MeshStandardMaterial({ color: TOIT[f], roughness: 0.95 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, n * 3, d), [co, co, to, to, fa, fa]);
    m.position.set(r * Math.cos(a), n * 1.5, r * Math.sin(a)); m.rotation.y = Math.PI / 2 - a; m.castShadow = m.receiveShadow = true; g.add(m);
  }
  // Arbres : sapins et feuillus alternés ; quelques-uns au pied de l'immeuble (côtés et arrière, jamais devant les fenêtres),
  // les autres entre les voisins, hors du passage de la caméra
  const bois = new THREE.MeshStandardMaterial({ color: 0x8A6A4F, roughness: 1 }), vert = new THREE.MeshStandardMaterial({ color: 0x8DB56E, roughness: 0.9, flatShading: true }), sapin = new THREE.MeshStandardMaterial({ color: 0x4F7F5A, roughness: 0.95, flatShading: true });
  const places = [[-(L / 2 + 8), -1], [L / 2 + 9, 1]]; // seulement sur les pignons : aucune façade n'est masquée
  [22, 57, 92, 128, 170, 213, 251, 289, 327].forEach(deg => { const a = deg * Math.PI / 180, r = rayon + 16; places.push([r * Math.cos(a), r * Math.sin(a)]); });
  places.forEach(([x, z], i) => {
    const k = 0.9 + ((i * 37) % 10) / 20;
    if (i % 2) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.6, 6), bois); t.position.set(x, 0.8 * k, z); const c = new THREE.Mesh(new THREE.ConeGeometry(1.9 * k, 6.5 * k, 8), sapin); c.position.set(x, 4.6 * k, z); c.castShadow = true; g.add(t, c); }
    else { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.6, 6), bois); t.position.set(x, 1.3 * k, z); const c = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3 * k, 1), vert); c.position.set(x, 4.3 * k, z); c.castShadow = true; g.add(t, c); }
  });
  return g;
}
