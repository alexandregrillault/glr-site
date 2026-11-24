// Carte des programmes, dans le style des vidéos Quoi de neuf : Plan IGN épuré (sans aucun nom, seuls les grands axes),
// immeubles en relief, contour des communes en liseré blanc ombré. Un clic sur un programme zoome dessus et pose
// sa maquette 3D dans son quartier ; le soleil suit l'heure choisie.
// Données : <script type="application/json" id="carte-data"> ; maplibregl chargé avant ce module.
// La vue « quartier » en 3D (immeuble posé sur la carte, voisins, routes maquette) a été retirée du parcours le 24/11/2026
// (Alex : « trop compliqué ») : un repère ouvre directement la page du programme, sur l'immeuble vu du bas.
// Son code plus bas (focus, coucheImmeuble, proximite…) est en sommeil et n'est plus appelé ; la bibliothèque 3D n'est donc plus chargée ici.

const ml = window.maplibregl;
const conteneur = document.getElementById('carte');
const D = JSON.parse((document.getElementById('carte-data') || {}).textContent || 'null');

const STYLE_IGN = 'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json';
const AXES = ['autoroute', 'route principale', 'route regionale'];
// Plus d'immeubles en relief sur la carte (Alex, 24/11/2026 : « ça ne donne pas bien ») : seulement leur empreinte, à plat
const HAUTEUR_BATI = 0.05;
// Autour d'un programme choisi, les immeubles voisins sont abaissés pour que la maquette ressorte sans être cachée
const hauteurBati = facteur => facteur === 1 ? HAUTEUR_BATI : ['*', HAUTEUR_BATI, facteur];
const adoucir = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// Anime une valeur de a à b ; renvoie une fonction pour l'arrêter
let INSTANT = false; // vrai le temps d'un retour direct sur une ville : tout se pose sans animation
function animer(ms, f, delai = 0) {
  if (INSTANT) { ms = 1; delai = 0; }
  let fini = false, t0 = null;
  const pas = t => { if (fini) return; if (t0 == null) t0 = t; const x = Math.min(1, Math.max(0, (t - t0 - delai) / ms)); f(adoucir(x)); if (x < 1) requestAnimationFrame(pas); };
  requestAnimationFrame(pas);
  return () => { fini = true; };
}

function epure(style) {
  const out = [];
  for (const l of style.layers) {
    const sl = l['source-layer'] || '', i = l.id.toLowerCase();
    // Pour se repérer : noms des communes et quartiers dès la vue d'une ville, noms des rues en s'approchant. Aucun autre texte.
    if (l.type === 'symbol' && (sl === 'toponyme_localite_ponc' || sl === 'toponyme_routier_odonyme_lin')) { out.push({ ...l, minzoom: Math.max(l.minzoom || 0, 12.2) }); continue; }
    if (l.type === 'symbol' || l.type === 'circle') continue;
    if (/^(toponyme|limite|oro|bati_surf|bati_ponc|bati_lin|routier_chemin|routier_surf|routier_liaison|parcellaire)/.test(sl)) continue;
    // Petites rues : seulement de près (quartier d'un programme), comme fond d'environnement
    if (sl.startsWith('routier_route') && !AXES.some(a => i.includes(a))) { out.push({ ...l, minzoom: Math.max(l.minzoom || 0, 12.2) }); continue; }
    // Vue d'ensemble : seulement les départements, ni routes ni voies ferrées (elles arrivent en zoomant)
    if (sl.startsWith('routier') || sl.startsWith('ferre')) { out.push({ ...l, minzoom: Math.max(l.minzoom || 0, 10.5) }); continue; }
    out.push(l);
  }
  // Immeubles en relief, en tons clairs (comme les immeubles qui sortent du sol dans les vidéos)
  out.push({
    id: 'glr-bati', type: 'fill-extrusion', source: 'plan_ign', 'source-layer': 'bati_surf', minzoom: 12,
    paint: {
      'fill-extrusion-color': '#F2EDE3',
      'fill-extrusion-height': HAUTEUR_BATI,
      'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 12.3, 0, 13.3, 0.92],
      'fill-extrusion-vertical-gradient': false,
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
  conteneur.__carte = map; // accès pour les contrôles automatiques
  window.addEventListener('pageshow', () => { conteneur.style.opacity = '1'; marqueurs.forEach(x => { x.m.getElement().style.opacity = ''; }); });
  map.addControl(new ml.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');
  map.addControl(new ml.AttributionControl({ compact: true, customAttribution: 'Fond de carte : IGN · contours geo.api.gouv.fr · lieux © OpenStreetMap' }));
  { const at = conteneur.querySelector('.maplibregl-ctrl-attrib'); if (at) { at.classList.remove('maplibregl-compact-show'); at.removeAttribute('open'); } }
  map.scrollZoom.disable();
  conteneur.addEventListener('wheel', () => {}, { passive: true });
  // Dès que le style est prêt (sans attendre toutes les tuiles du fond) : les départements s'affichent tout de suite
  await new Promise(r => (map.isStyleLoaded() ? r() : map.once('style.load', r)));

  // ——— Sol « épuré » (choisi par Alex le 24/11/2026) : fond clair uni, rues blanches, grands axes laiton pâle,
  // eau et parcs aux couleurs de la charte. Appliqué quand une ville est choisie ; le Plan IGN d'origine est gardé pour comparer.
  // Couleurs franches : c'est le voile posé hors de la ville qui les pâlit, donc la ville ressort par contraste
  const SOL = { fond: '#EDE3CE', eau: '#8FC3D6', vert: '#B5D29A', rue: '#FFFFFF', axe: '#E2B45C', rail: '#7F8B96', texte: '#4A545E' };
  const origine = new Map();
  // en sol épuré, la teinte rose/orange du département ne colore plus la ville
  const teinteDep = () => { if (map.getLayer('dep-fond')) map.setPaintProperty('dep-fond', 'fill-opacity', solActif ? 0 : 0.12); };
  const solEpure = true; let solActif = false; // sol épuré choisi par Alex le 24/11/2026 pour la vue de la ville
  function sol(epure) {
    solActif = epure;
    for (const l of map.getStyle().layers) {
      if (l.id === 'glr-bati' || l.id.startsWith('mq-') || (l.source !== 'plan_ign' && l.type !== 'background')) continue;
      const sl = l['source-layer'] || '', id = l.id.toLowerCase();
      const poser = (prop, val) => {
        const k = l.id + '|' + prop;
        if (!origine.has(k)) origine.set(k, map.getPaintProperty(l.id, prop));
        map.setPaintProperty(l.id, prop, epure ? val : origine.get(k));
      };
      if (l.type === 'background') poser('background-color', SOL.fond);
      else if (l.type === 'fill') {
        poser('fill-pattern', undefined);
        poser('fill-outline-color', 'rgba(0,0,0,0)');
        // parcs, squares, terrains de sport et bois en vert franc : c'est eux, avec la Seine, qui colorent la ville
        poser('fill-color', sl.startsWith('hydro') ? SOL.eau : (sl.startsWith('ocs_vegetation') || id.includes('vert') || id.includes('sport')) ? SOL.vert : SOL.fond);
      } else if (l.type === 'line') {
        poser('line-pattern', undefined);
        if (sl.startsWith('routier')) {
          const axe = AXES.some(a => id.includes(a));
          poser('line-color', axe ? SOL.axe : SOL.rue);
          if (axe) { // grands axes : même couleur, trait deux fois plus fin
            const k = l.id + '|line-width'; if (!origine.has(k)) origine.set(k, map.getPaintProperty(l.id, 'line-width'));
            const w = origine.get(k), fin = v => Math.max(0.6, v * 0.45);
            map.setPaintProperty(l.id, 'line-width', !epure ? w : typeof w === 'number' ? fin(w) : (w && w.stops) ? { ...w, stops: w.stops.map(([z, v]) => [z, typeof v === 'number' ? fin(v) : v]) } : w);
          }
        }
        else if (sl.startsWith('ferre')) poser('line-color', SOL.rail);
        else if (sl.startsWith('hydro')) poser('line-color', SOL.eau);
        else poser('line-opacity', 0);
      } else if (l.type === 'symbol') { poser('text-color', SOL.texte); poser('text-halo-color', SOL.fond); }
    }
    map.setPaintProperty('glr-bati', 'fill-extrusion-color', epure ? '#E7E0D3' : '#F2EDE3');
  }

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
  // Focus sur la ville choisie : tout le reste s'estompe sous un voile crème, et la commune « sort » de la carte
  // par un socle en relief le long de sa limite (comme la commune qui sort de terre dans les vidéos).
  const vide = { type: 'FeatureCollection', features: [] };
  map.addSource('voile', { type: 'geojson', data: vide });
  map.addLayer({ id: 'voile', type: 'fill', source: 'voile', paint: { 'fill-color': '#F4F0E8', 'fill-opacity': 0 } });
  // Ombre portée sous la ville (elle paraît soulevée) et immeubles de la seule commune choisie
  map.addSource('ville-contour', { type: 'geojson', data: vide });
  map.addLayer({ id: 'ville-ombre', type: 'line', source: 'ville-contour', paint: { 'line-color': '#161A1E', 'line-width': 12, 'line-blur': 10, 'line-opacity': 0, 'line-translate': [0, 6], 'line-translate-anchor': 'viewport' } }, 'voile');
  // Parcs, bois et terrains de sport (relevé OpenStreetMap par ville) : dessinés sous les rues, visibles dès la vue de la ville
  map.addSource('parcs', { type: 'geojson', data: vide });
  { const premiereRue = (map.getStyle().layers.find(l => l.type === 'line' && (l['source-layer'] || '').startsWith('routier')) || {}).id;
    map.addLayer({ id: 'parcs', type: 'fill', source: 'parcs', paint: { 'fill-color': ['match', ['get', 'g'], 'sport', '#C9DFAE', '#A9CE8C'], 'fill-opacity': 0.95 } }, premiereRue); }
  // Limite de la ville choisie : trait bleu du logo sur liseré blanc, bien net
  map.addLayer({ id: 'ville-halo', type: 'line', source: 'ville-contour', layout: { 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': 7, 'line-opacity': 0 } });
  map.addLayer({ id: 'ville-trait', type: 'line', source: 'ville-contour', layout: { 'line-join': 'round' }, paint: { 'line-color': '#005875', 'line-width': 3, 'line-opacity': 0 } });
  map.addSource('bati-ville', { type: 'geojson', data: vide });
  map.addLayer({ id: 'bati-ville', type: 'fill-extrusion', source: 'bati-ville', paint: { 'fill-extrusion-color': '#F2EDE3', 'fill-extrusion-height': 0, 'fill-extrusion-opacity': 0.95, 'fill-extrusion-vertical-gradient': true } });
  const anneaux = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(pl => pl[0]);
  const dedans = (pt, a) => { let d = false; for (let i = 0, j = a.length - 1; i < a.length; j = i++) { const [xi, yi] = a[i], [xj, yj] = a[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) d = !d; } return d; };
  let villeFocus = null, facteurVille = 1, lieuxVille = [];
  const hautVille = f => { facteurVille = f; map.setPaintProperty('bati-ville', 'fill-extrusion-height', hauteurBati(Math.max(0.001, f))); };
  // Ne garde que les immeubles dont un point est dans la commune (les tuiles IGN n'ont pas d'identifiant : on recopie leur dessin)
  function remplirBati() {
    if (!villeFocus) return 0;
    const trous = anneaux(villeFocus.c.geometry), out = [];
    for (const f of map.querySourceFeatures('plan_ign', { sourceLayer: 'bati_surf' })) {
      const g = f.geometry, pt = g.type === 'Polygon' ? g.coordinates[0][0] : g.type === 'MultiPolygon' ? g.coordinates[0][0][0] : null;
      if (pt && trous.some(a => dedans(pt, a))) out.push({ type: 'Feature', properties: { hauteur: f.properties.hauteur || 10 }, geometry: g });
    }
    map.getSource('bati-ville').setData({ type: 'FeatureCollection', features: out });
    return out.length;
  }
  let minuterie = null;
  function focusVille(v) {
    villeFocus = v && v.c ? v : null;
    lieuxVille.forEach(m => m.remove()); lieuxVille = [];
    map.getSource('parcs').setData(vide);
    if (!villeFocus) {
      map.getSource('voile').setData(vide); map.getSource('ville-contour').setData(vide);
      map.setPaintProperty('voile', 'fill-opacity', 0); map.setPaintProperty('ville-ombre', 'line-opacity', 0); map.setPaintProperty('ville-halo', 'line-opacity', 0); map.setPaintProperty('ville-trait', 'line-opacity', 0);
      return;
    }
    const trous = anneaux(v.c.geometry);
    map.getSource('voile').setData({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-10, 40], [15, 40], [15, 55], [-10, 55], [-10, 40]], ...trous.map(a => a.slice().reverse())] } });
    map.getSource('ville-contour').setData(v.c);
    // Les villes voisines restent visibles, estompées ; la ville choisie ressort (voile léger autour + ombre portée)
    animer(1400, x => { map.setPaintProperty('voile', 'fill-opacity', 0.72 * x); map.setPaintProperty('ville-halo', 'line-opacity', x); map.setPaintProperty('ville-trait', 'line-opacity', x); map.setPaintProperty('ville-ombre', 'line-opacity', 0.3 * x); map.setPaintProperty('ville-ombre', 'line-translate', [0, 2 + 4 * x]); }, 300);
    lieuxDeVille(v, INSTANT);
    fetch('/neuf/donnees/parcs/' + v.i + '.json').then(x => x.ok ? x.json() : null).then(g => { if (g && villeFocus === v) map.getSource('parcs').setData(g); }).catch(() => {});
  }
  // Transports, commerces et écoles de la ville (relevé OpenStreetMap rangé dans neuf/donnees/lieux/) :
  // transports et commerces dès la vue de la ville, écoles en s'approchant (elles sont très nombreuses)
  async function lieuxDeVille(v, vite) {
    let L = [];
    try { L = (await (await fetch('/neuf/donnees/lieux/' + v.i + '.json')).json()).lieux || []; } catch (e) { return; }
    if (villeFocus !== v) return;
    const trous = anneaux(v.c.geometry), vus = new Set();
    L.filter(e => trous.some(a => dedans([e.o, e.a], a))).forEach((e, i) => {
      const cle = e.g + e.n; if (vus.has(cle)) return; vus.add(cle);
      const el = document.createElement('div'); el.className = 'lieu petit ' + e.g; el.innerHTML = ICONES[e.g] + (e.g === 'transport' ? '<span class="nom"></span>' : ''); el.title = e.n;
      if (e.g === 'transport') el.querySelector('.nom').textContent = e.n;
      el.style.animationDelay = ((vite ? 100 : 2300) + (i % 40) * 25) + 'ms';
      lieuxVille.push(new ml.Marker({ element: el }).setLngLat([e.o, e.a]).addTo(map));
    });
    montrerEcoles();
  }
  const montrerEcoles = () => { const z = map.getZoom(); lieuxVille.forEach(m => { const el = m.getElement(), seuil = el.classList.contains('transport') ? 0 : el.classList.contains('commerce') ? 13.8 : 14.6; el.style.display = enCours || z < seuil ? 'none' : ''; }); };
  map.on('zoom', montrerEcoles);
  const choisirCommune = s => {
    map.setPaintProperty('commune-fond', 'fill-opacity', ['case', ['==', ['get', 's'], s || ''], 0, 0.02]);
    map.setPaintProperty('commune-ombre', 'line-opacity', s ? 0 : 0.18);
    map.setPaintProperty('commune-trait', 'line-opacity', s ? 0 : 1);
  };

  // Repères des programmes
  const marqueurs = [];
  for (const v of villes) for (const p of v.p) {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'repere' + (p.k ? ' picking' : '');
    // Au survol : nom du programme et date de livraison (ou « grille sur demande » pour un picking)
    { const info = document.createElement('span'); info.className = 'info-prog'; const b = document.createElement('b'); b.textContent = p.n; info.appendChild(b);
      info.appendChild(document.createTextNode(p.k ? 'Grille sur demande' : (p.l ? 'Livraison ' + p.l : 'Livraison à préciser'))); el.appendChild(info);
      el.setAttribute('aria-label', p.n + (p.l ? ', livraison ' + p.l : '')); }
    el.addEventListener('click', ev => {
      ev.stopPropagation();
      if (p.k) { location.href = '/neuf/' + p.u; return; }
      // Zoom progressif : la caméra descend vers le programme et s'incline, la carte s'efface, puis la page de l'immeuble
      // reprend le mouvement jusqu'à la vue du bas (voir immeuble3d.js, « arrivee »)
      marqueurs.forEach(x => { if (x.p !== p) x.m.getElement().style.opacity = '0.25'; });
      // on reste vu du dessus, bien à plat : la page de l'immeuble repart exactement de là pour descendre vers la rue
      map.flyTo({ center: [p.o, p.a], zoom: 18.3, pitch: 0, bearing: 0, duration: 1900, essential: true, curve: 1.1, easing: t => 1 - Math.pow(1 - t, 3) });
      // la carte reste affichée jusqu'au bout : c'est le fondu entre les deux pages (view transition) qui fait le raccord
      { const l = document.createElement('link'); l.rel = 'prefetch'; l.href = '/neuf/' + p.u; document.head.appendChild(l); }
      try { sessionStorage.setItem('glr-arrivee', '1'); } catch (_) {}
      setTimeout(() => { location.href = '/neuf/' + p.u + '#immeuble'; }, 1750);
    });
    el.style.display = 'none'; // les repères n'apparaissent qu'une fois la ville choisie
    marqueurs.push({ m: new ml.Marker({ element: el }).setLngLat([p.o, p.a]).addTo(map), p, v });
  }

  // Panneau d'un programme
  const panneau = document.getElementById('panneau');
  const heure = document.getElementById('carte-heure'), sortieH = document.getElementById('carte-heure-val');
  let couche = null, enCours = null, villeEnCours = null;

  let stopBati = null, stopTour = null, etiquette = null;
  // ——— Routes « maquette » pour la vue d'un programme : trottoirs clairs, chaussée d'asphalte à sa vraie largeur,
  // ligne axiale en pointillés sur les voies principales, allées piétonnes en beige. Largeurs en mètres selon la classe IGN.
  const LARG = ['match', ['get', 'symbo'], 'AUTOROU_LIBRE', 16, 'AUTOROU_PEAGE', 16, 'PRINCIPALE_1', 14, 'PRINCIPALE_2', 12, 'PRINCIPALE_3', 11, 'REGIONALE_1', 11, 'REGIONALE_2', 10, 'REGIONALE_3', 9, 'LOCALE_1', 8.5, 'LOCALE_2', 7.5, 'LOCALE_3', 7, 'NON_CLASSEE', 6, 4.5];
  const enPx = (m, plus = 0) => ['interpolate', ['exponential', 2], ['zoom'], 15, ['+', ['*', m, 0.637], plus], 20, ['+', ['*', m, 20.38], plus * 8]];
  const GRANDE = ['in', ['get', 'symbo'], ['literal', ['AUTOROU_LIBRE', 'AUTOROU_PEAGE', 'PRINCIPALE_1', 'PRINCIPALE_2', 'PRINCIPALE_3', 'REGIONALE_1', 'REGIONALE_2', 'REGIONALE_3', 'LOCALE_1']]];
  const avantNoms = (map.getStyle().layers.find(l => l.type === 'symbol') || {}).id;
  const rond = { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' };
  map.addLayer({ id: 'mq-allee', type: 'line', source: 'plan_ign', 'source-layer': 'routier_chemin', minzoom: 15.5, layout: rond, paint: { 'line-color': '#E3D9C4', 'line-width': enPx(2.6) } }, avantNoms);
  map.addLayer({ id: 'mq-trottoir', type: 'line', source: 'plan_ign', 'source-layer': 'routier_route', minzoom: 15.5, layout: rond, paint: { 'line-color': '#F6F2E9', 'line-width': enPx(['+', ['*', LARG, 0.8], 3.4]) } }, avantNoms);
  map.addLayer({ id: 'mq-bordure', type: 'line', source: 'plan_ign', 'source-layer': 'routier_route', minzoom: 15.5, layout: rond, paint: { 'line-color': '#B9B4AB', 'line-width': enPx(['*', LARG, 0.8], 0.9) } }, avantNoms);
  map.addLayer({ id: 'mq-chaussee', type: 'line', source: 'plan_ign', 'source-layer': 'routier_route', minzoom: 15.5, layout: rond, paint: { 'line-color': '#C9C5BE', 'line-width': enPx(['*', LARG, 0.8]) } }, avantNoms);
  map.addLayer({ id: 'mq-axe', type: 'line', source: 'plan_ign', 'source-layer': 'routier_route', minzoom: 16.2, filter: GRANDE, layout: { 'line-cap': 'butt', visibility: 'none' }, paint: { 'line-color': '#FFFFFF', 'line-width': enPx(0.22), 'line-dasharray': [9, 9] } }, avantNoms);
  const MQ = ['mq-allee', 'mq-trottoir', 'mq-bordure', 'mq-chaussee', 'mq-axe'];
  const ruesIgn = map.getStyle().layers.filter(l => l.source === 'plan_ign' && l.type === 'line' && /^routier/.test(l['source-layer'] || '') && !MQ.includes(l.id)).map(l => l.id);
  const routesMaquette = oui => { MQ.forEach(id => map.setLayoutProperty(id, 'visibility', oui ? 'visible' : 'none')); ruesIgn.forEach(id => map.setLayoutProperty(id, 'visibility', oui ? 'none' : 'visible')); };
  const bati = (de, a, ms, delai) => { if (stopBati) stopBati(); stopBati = animer(ms, x => { const f = Math.max(0.001, de + (a - de) * x); map.setPaintProperty('glr-bati', 'fill-extrusion-height', hauteurBati(f)); if (map.getLayer('bati-ville')) hautVille(f); }, delai); };
  const arreterTour = () => { if (stopTour) { stopTour(); stopTour = null; } };
  ['mousedown', 'touchstart', 'wheel'].forEach(t => conteneur.addEventListener(t, arreterTour, { passive: true }));
  function quitter() {
    arreterTour(); effacerProximite(); if (stopBati) { stopBati(); stopBati = null; }
    if (etiquette) { etiquette.remove(); etiquette = null; }
    if (couche) routesMaquette(false);
    map.setPaintProperty('glr-bati', 'fill-extrusion-color', '#E7E0D3');
    if (couche) { map.removeLayer(couche.id); couche = null; map.setMaxBounds(null); map.setMinZoom(null); map.setMaxZoom(null); }
    enCours = null; if (panneau) panneau.hidden = true;
    marqueurs.forEach(x => { x.m.getElement().style.display = x.v.s === villeEnCours ? '' : 'none'; });
    map.setFilter('glr-bati', null);
  }

  function focus(v, p) {
    villeEnCours = v.s; quitter(); enCours = p; montrerEcoles();
    marqueurs.forEach(x => { x.m.getElement().style.display = x.p === p ? 'none' : ''; });
    choisirCommune(v.s);
    map.flyTo({ center: [p.o, p.a], zoom: 17.5, pitch: 56, bearing: -28, offset: [0, 20], duration: 2600, essential: true, curve: 1.5 });
    // Le programme en vedette : tout le quartier est aplati, seul l'immeuble du programme reste en relief, son nom au-dessus
    bati(1, 0.001, 1600, 600); // sol aplati : les voisins ne sont plus que leur empreinte au sol
    map.setPaintProperty('glr-bati', 'fill-extrusion-color', '#F3EEE4');
    { const el = document.createElement('div'); el.className = 'etiquette-prog'; el.textContent = p.n;
      const hautM = (Math.max(3, 1 + Math.max(...p.L.map(l => l.e))) * 3 + 1);
      etiquette = new ml.Marker({ element: el, anchor: 'bottom', offset: [0, -Math.round(hautM / 0.277 * 0.83 + 40)] }).setLngLat([p.o, p.a]).addTo(map); }
    couche = coucheImmeuble(map, p);
    map.addLayer(couche);
    setTimeout(() => { if (enCours === p) routesMaquette(true); }, 1500);
    { const ici = couche; let essais = 0, parcs = null;
      fetch('/neuf/donnees/parcs/' + v.i + '.json').then(x => x.ok ? x.json() : null).then(g => { parcs = g; }).catch(() => {});
      const poser = () => {
        if (couche !== ici) return;
        const f = map.querySourceFeatures('plan_ign', { sourceLayer: 'bati_surf' });
        if ((!f.length || !map.areTilesLoaded()) && essais++ < 25) return setTimeout(poser, 350);
        ici.decor(f, parcs);
      };
      map.once('moveend', () => {
        if (couche !== ici) return;
        // Vue bridée autour du programme : on tourne et on zoome un peu, on ne part pas se promener (fluidité)
        const dx = 260 / (111320 * Math.cos(p.a * Math.PI / 180)), dy = 260 / 111200;
        map.setMaxBounds([[p.o - dx, p.a - dy], [p.o + dx, p.a + dy]]); map.setMinZoom(16.7); map.setMaxZoom(18.6);
        poser();
      }); }
    // Autour du programme : métro, gares, écoles et grands commerces des environs
    proximite(p, v);
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

  // ——— Lieux utiles autour d'un programme (OpenStreetMap, via Overpass) ———
  const ICONES = {
    transport: '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 11h12M9 21l-2 0 2-4M15 21h2l-2-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/></svg>',
    ecole: '<svg viewBox="0 0 24 24"><path d="M2 9l10-5 10 5-10 5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M6 11v5c3 2 9 2 12 0v-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    commerce: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 8a3 3 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  };
  const LIBELLES = { transport: 'Transports', ecole: 'Écoles', commerce: 'Commerces' };
  let lieux = [], demandeLieux = 0;
  function effacerProximite() { lieux.forEach(m => m.remove()); lieux = []; const l = document.getElementById('proches'); if (l) l.innerHTML = ''; demandeLieux++; }
  const propre = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function proximite(p, v) {
    // Lieux relevés une fois par ville (OpenStreetMap) et rangés dans neuf/donnees/lieux/<insee>.json : réponse immédiate
    const ici = ++demandeLieux, R = 600;
    let els = [];
    try { els = (await (await fetch('/neuf/donnees/lieux/' + v.i + '.json')).json()).lieux || []; } catch (e) { return; }
    if (ici !== demandeLieux) return;
    const dist = (a, o) => Math.round(Math.hypot((o - p.o) * 73200, (a - p.a) * 111200) / 10) * 10;
    const vus = new Set(), trouves = [];
    for (const e of els) {
      const d = dist(e.a, e.o); if (d > R) continue;
      const cle = e.g + e.n; if (vus.has(cle)) continue; vus.add(cle);
      trouves.push({ genre: e.g, nom: e.n, a: e.a, o: e.o, d });
    }
    trouves.sort((x, y) => x.d - y.d);
    const garder = ['transport', 'ecole', 'commerce'].flatMap(g => trouves.filter(x => x.genre === g).slice(0, g === 'transport' ? 4 : 5));
    garder.forEach((x, i) => {
      const el = document.createElement('div'); el.className = 'lieu ' + x.genre; el.innerHTML = ICONES[x.genre]; el.title = x.nom;
      el.style.animationDelay = (300 + i * 110) + 'ms';
      lieux.push(new ml.Marker({ element: el }).setLngLat([x.o, x.a]).addTo(map));
    });
    const liste = document.getElementById('proches');
    if (liste) liste.innerHTML = ['transport', 'ecole', 'commerce'].map(g => {
      const xs = garder.filter(x => x.genre === g); if (!xs.length) return '';
      return '<li><span class="lieu-mini ' + g + '">' + ICONES[g] + '</span><b>' + LIBELLES[g] + '</b> ' + xs.map(x => propre(x.nom) + ' <small>' + (x.d < 1000 ? x.d + ' m' : (x.d / 1000).toFixed(1).replace('.', ',') + ' km') + '</small>').join(' · ') + '</li>';
    }).join('') || '<li>Aucun lieu trouvé dans les environs immédiats.</li>';
  }

  function placerSoleil() {
    if (!enCours) return; // vue quartier en sommeil
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
    if (boutonIdf) boutonIdf.hidden = false;
    { const v0 = villes.find(x => x.s === s); if (v0 && fil) fil.textContent = v0.v + ' — touchez un programme'; }
    villeEnCours = s; quitter(); choisirCommune(s);
    if (solEpure !== solActif) sol(solEpure);
    setTimeout(() => { if (villeEnCours === s) teinteDep(); }, 1350);
    const pts = v.c ? v.c.geometry.coordinates.flat(v.c.geometry.type === 'MultiPolygon' ? 2 : 1) : v.p.map(p => [p.o, p.a]);
    const cam = map.cameraForBounds(bornes(pts), { padding: 30 });
    map.getSource('communes-dep').setData({ type: 'FeatureCollection', features: [] }); depEnCours = null;
    // Vue précise directement : immeubles en place, la ville sort de la carte, le reste s'estompe
    // La vue change : du trois-quarts du département à une vue d'au-dessus, bien à plat, sur la ville entière
    if (INSTANT) map.jumpTo({ center: cam.center, zoom: cam.zoom, pitch: 0, bearing: 0 });
    else map.flyTo({ center: cam.center, zoom: cam.zoom, pitch: 0, bearing: 0, duration: 2200, essential: true, curve: 1.4 });
    map.scrollZoom.enable(); // sur une ville : molette pour zoomer, glisser pour se promener
    map.setPaintProperty('glr-bati', 'fill-extrusion-height', hauteurBati(1));
    focusVille(v);
    // Les programmes naissent de leur point exact : une onde au sol, puis le repère
    marqueurs.forEach(x => {
      const el = x.m.getElement();
      if (x.v.s !== s) return;
      el.style.display = 'none';
      setTimeout(() => { if (villeEnCours === s && !enCours) { el.style.display = ''; el.classList.remove('nait'); void el.offsetWidth; el.classList.add('nait'); } }, INSTANT ? 0 : 2300);
    });
  }
  // On montre toujours d'abord l'Île-de-France vue du dessus, puis on plonge vers la ville demandée
  // L'intro ne démarre que lorsque la carte est vraiment à l'écran (sinon le client ne verrait pas l'Île-de-France)
  const INTRO = 1800;
  let vueA = null; const attente = [];
  new IntersectionObserver((es, ob) => { if (es.some(e => e.isIntersecting)) { vueA = Date.now(); ob.disconnect(); attente.splice(0).forEach(f => f()); } }, { threshold: 0.6 }).observe(conteneur);
  const apresIntro = f => { const go = () => setTimeout(f, Math.max(0, INTRO - (Date.now() - vueA))); if (vueA) go(); else attente.push(go); };
  // Retour depuis un immeuble (lien …&vue=ville) : on retrouve directement la ville, sans repasser par l'Île-de-France
  let direct = !!window.GLRDirect || new URLSearchParams(location.search).get('vue') === 'ville';
  const versVille = s => { if (direct) { direct = false; INSTANT = true; try { montrerVille(s); } finally { INSTANT = false; } } else apresIntro(() => montrerVille(s)); };
  window.GLRCarte = { ville: versVille };
  // Un clic sur une commune la choisit aussi (page des villes)
  // Étape 1 : un département touché → on zoome dessus et ses communes apparaissent ; une commune touchée → sa ville
  const NOMS_DEP = { '75': 'Paris', '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis', '94': 'Val-de-Marne', '95': 'Val-d’Oise', '78': 'Yvelines', '91': 'Essonne', '77': 'Seine-et-Marne' };
  const fil = document.getElementById('fil-carte'), boutonIdf = document.getElementById('carte-idf');
  const net = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ecrireFil = (dep, nom) => { if (!fil) return; fil.innerHTML = dep ? '<b>' + dep + ' · ' + NOMS_DEP[dep] + '</b>' + (nom ? ' › ' + net(nom) : ' — touchez une commune') : 'Touchez un département.'; };
  let depEnCours = null;
  map.addSource('communes-dep', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'code' });
  map.addLayer({ id: 'cdep-fond', type: 'fill', source: 'communes-dep', paint: {
    'fill-color': ['case', ['get', 'page'], '#005875', '#FFFFFF'],
    'fill-opacity': ['case', ['boolean', ['feature-state', 'survol'], false], 0.35, ['get', 'page'], 0.22, 0.05] } }, 'commune-fond');
  map.addLayer({ id: 'cdep-trait', type: 'line', source: 'communes-dep', paint: { 'line-color': '#FFFFFF', 'line-width': 1.8, 'line-opacity': 1 } }, 'commune-fond');
  async function choisirDep(d) {
    if (enCours || villeEnCours) return;
    map.getSource('communes-dep').setData({ type: 'FeatureCollection', features: [] });
    depEnCours = d; ecrireFil(d);
    if (boutonIdf) boutonIdf.hidden = false;
    const f = (map.getSource('deps')._data.features || []).find(x => x.properties.d === d);
    if (f) { const pts = f.geometry.coordinates.flat(f.geometry.type === 'MultiPolygon' ? 2 : 1); map.fitBounds(bornes(pts), { padding: 24, pitch: 25, bearing: 0, duration: 1600 }); }
    map.setPaintProperty('dep-fond', 'fill-opacity', ['case', ['==', ['get', 'd'], d], 0.18, 0.5]);
    try {
      const g = await (await fetch('https://geo.api.gouv.fr/departements/' + d + '/communes?fields=nom,code&format=geojson&geometry=contour')).json();
      const avecPage = new Set(villes.map(v => v.i));
      g.features.forEach(x => { x.properties.page = avecPage.has(x.properties.code); });
      if (depEnCours === d) map.getSource('communes-dep').setData(g);
    } catch (e) { ecrireFil(d, 'communes indisponibles pour le moment'); }
  }
  function revenirIdf() {
    depEnCours = null; villeEnCours = null; quitter(); map.scrollZoom.disable();
    if (solActif) sol(false);
    map.getSource('communes-dep').setData({ type: 'FeatureCollection', features: [] });
    marqueurs.forEach(x => { x.m.getElement().style.display = 'none'; });
    map.setPaintProperty('dep-fond', 'fill-opacity', 0.55); map.setPaintProperty('dep-ombre', 'line-opacity', 0.75); map.setPaintProperty('dep-trait', 'line-opacity', 1);
    (window.__numeros || []).forEach(m => { m.getElement().style.display = ''; });
    choisirCommune(null); focusVille(null); map.setPaintProperty('glr-bati', 'fill-extrusion-height', hauteurBati(1));
    map.fitBounds(bornes([[1.88, 48.62], [2.82, 49.08]]), { padding: 20, pitch: 0, bearing: 0, duration: 1600 });
    if (boutonIdf) boutonIdf.hidden = true; ecrireFil(null);
    try { history.replaceState(null, '', location.pathname); } catch (_) {}
  }
  if (boutonIdf) boutonIdf.addEventListener('click', revenirIdf);
  map.on('click', 'dep-fond', ev => {
    if (villeEnCours) return;
    const d = ev.features[0].properties.d;
    if (d !== depEnCours && !map.queryRenderedFeatures(ev.point, { layers: ['cdep-fond'] }).length) choisirDep(d);
  });
  let survol = null;
  map.on('mousemove', 'cdep-fond', ev => {
    const x = ev.features[0]; if (!x) return;
    if (survol != null) map.setFeatureState({ source: 'communes-dep', id: survol }, { survol: false });
    survol = x.id; map.setFeatureState({ source: 'communes-dep', id: survol }, { survol: true });
    map.getCanvas().style.cursor = 'pointer';
    ecrireFil(depEnCours, x.properties.nom + (x.properties.page ? ' — programmes à voir' : ''));
  });
  map.on('mouseleave', 'cdep-fond', () => { if (survol != null) map.setFeatureState({ source: 'communes-dep', id: survol }, { survol: false }); survol = null; map.getCanvas().style.cursor = ''; if (depEnCours) ecrireFil(depEnCours); });
  map.on('click', 'cdep-fond', ev => {
    const x = ev.features[0]; if (!x || villeEnCours) return;
    const v = villes.find(y => y.i === x.properties.code);
    if (v) { map.getSource('communes-dep').setData({ type: 'FeatureCollection', features: [] }); if (window.GLRChoixVille) window.GLRChoixVille(v.s); else montrerVille(v.s); }
    else if (window.GLRSansPage) window.GLRSansPage(x.properties.nom);
    else ecrireFil(depEnCours, x.properties.nom + ' n’a pas encore sa page : appelez-nous, nous vous envoyons ses programmes.');
  });
  map.on('mouseenter', 'dep-fond', () => { if (!depEnCours) map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'dep-fond', () => { map.getCanvas().style.cursor = ''; });
  const voulu = new URLSearchParams(location.search).get('p');
  const prog = voulu && villes.map(v => [v, v.p.find(x => x.s === voulu && !x.k)]).find(x => x[1]);
  if (prog) { location.replace('/neuf/' + prog[1].u + '#immeuble'); return; }
  else if (D.ville) versVille(D.ville);
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
    // Décor du quartier, en vraie maquette : immeubles voisins avec fenêtres (sauf les plus proches, laissés à plat
    // pour dégager le programme) et arbres dans les parcs. Rayon limité : la vue du programme est bridée.
    decor(batiments, parcs) {
      if (this._decor) { scene.remove(this._decor); this._decor = null; }
      const gr = new THREE.Group(), kx = 111320 * Math.cos(p.a * Math.PI / 180), ky = 111200;
      const xy = c => [(c[0] - p.o) * kx, (c[1] - p.a) * ky];
      const PROCHE = 55, LOIN = 330, geos = [], vus = new Set();
      for (const f of batiments) {
        const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
        for (const pl of polys) {
          const a = pl[0].map(xy); if (a.length < 4) continue;
          const cx = a.reduce((t, q) => t + q[0], 0) / a.length, cy = a.reduce((t, q) => t + q[1], 0) / a.length, d = Math.hypot(cx, cy);
          const dmin = Math.min(...a.map(q => Math.hypot(q[0], q[1])));
          if (dmin < PROCHE || d > LOIN) continue;
          const cle = Math.round(cx) + '|' + Math.round(cy) + '|' + a.length; if (vus.has(cle)) continue; vus.add(cle);
          // Ni lamelles ni cabanons : on écarte les formes trop fines (morceaux découpés par les tuiles) ou trop petites
          let aire = 0, perim = 0;
          for (let i = 0; i < a.length - 1; i++) { aire += a[i][0] * a[i + 1][1] - a[i + 1][0] * a[i][1]; perim += Math.hypot(a[i + 1][0] - a[i][0], a[i + 1][1] - a[i][1]); }
          aire = Math.abs(aire) / 2;
          if (aire < 60 || 2 * aire / perim < 3.2) continue;
          const sh = new THREE.Shape(a.map(q => new THREE.Vector2(q[0], q[1])));
          const h = Math.max(3, Math.round((f.properties.hauteur || 9) / 3) * 3);
          const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false });
          g.rotateX(-Math.PI / 2); g.userData.v = Math.abs(Math.round(cx * 7 + cy * 13)) % 4; geos.push(g);
        }
      }
      if (geos.length) {
        // Quatre familles d'immeubles (enduit clair, pierre, brique, béton) : façades et toits différents, tirés selon la position
        const FAM = [['#F3EEE4', '#5D7884', 0xE4DDCF, 2], ['#E9DFCB', '#56707B', 0xCFC6B4, 3], ['#D9B79C', '#4E6670', 0xB9A48F, 2], ['#E6E6E2', '#6A8590', 0xD9D9D4, 4]];
        const mats = [];
        FAM.forEach(([mur, vitre, toit, nb]) => {
          const c = document.createElement('canvas'); c.width = 256; c.height = 192; const x = c.getContext('2d');
          x.fillStyle = mur; x.fillRect(0, 0, 256, 192);
          const l = 256 / nb;
          for (let i = 0; i < nb; i++) { x.fillStyle = 'rgba(0,0,0,.10)'; x.fillRect(i * l + l * .16, 44, l * .68, 118); x.fillStyle = vitre; x.fillRect(i * l + l * .2, 48, l * .6, 110); x.fillStyle = 'rgba(255,255,255,.22)'; x.fillRect(i * l + l * .24, 52, l * .1, 102); }
          x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(0, 186, 256, 6);
          const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1 / (nb * 2.1), 1 / 3);
          mats.push(new THREE.MeshStandardMaterial({ color: toit, roughness: 0.95 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82 }));
        });
        const m = new THREE.Mesh(mergeGeometries(geos, true), mats);
        const src = geos.map(g => g.groups); let dec = 0; m.geometry.clearGroups();
        geos.forEach((g, i) => { src[i].forEach(q => m.geometry.addGroup(dec + q.start, q.count, g.userData.v * 2 + q.materialIndex)); dec += (g.index ? g.index.count : g.attributes.position.count); });
        m.receiveShadow = true; gr.add(m);
      }
      // Arbres : semés dans les parcs (pas sur les terrains de sport), dans le rayon
      const pts = [], dans = (pt, a) => { let d = false; for (let i = 0, j = a.length - 1; i < a.length; j = i++) { const [xi, yi] = a[i], [xj, yj] = a[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) d = !d; } return d; };
      for (const f of (parcs && parcs.features) || []) {
        if (f.properties.g === 'sport') continue;
        const a = f.geometry.coordinates[0].map(xy), xs = a.map(q => q[0]), ys = a.map(q => q[1]);
        const x0 = Math.max(-LOIN, Math.min(...xs)), x1 = Math.min(LOIN, Math.max(...xs)), y0 = Math.max(-LOIN, Math.min(...ys)), y1 = Math.min(LOIN, Math.max(...ys));
        for (let x = x0; x < x1; x += 15) for (let y = y0; y < y1; y += 15) {
          const g = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453, j = g - Math.floor(g);
          const q = [x + (j - 0.5) * 7, y + ((j * 7) % 1 - 0.5) * 7];
          if (pts.length < 350 && Math.hypot(q[0], q[1]) > 18 && dans(q, a)) pts.push([q[0], q[1], 0.8 + j * 0.6]);
        }
      }
      if (pts.length) {
        // Un arbre sur deux environ est un sapin (cône sombre), l'autre un feuillu (boule vert tendre)
        const sapins = pts.filter((q, i) => (i * 7 + Math.round(q[0])) % 5 < 2), feuillus = pts.filter(q => !sapins.includes(q));
        const M = new THREE.Matrix4(), bois = new THREE.MeshStandardMaterial({ color: 0x8A6A4F, roughness: 1 });
        const semer = (liste, geoTronc, geoHaut, matHaut, yT, yH) => {
          if (!liste.length) return;
          const t = new THREE.InstancedMesh(geoTronc, bois, liste.length), f = new THREE.InstancedMesh(geoHaut, matHaut, liste.length);
          liste.forEach(([x, y, k], i) => { M.makeScale(k, k, k).setPosition(x, yT * k, -y); t.setMatrixAt(i, M); M.makeScale(k, k, k).setPosition(x, yH * k, -y); f.setMatrixAt(i, M); });
          gr.add(t); gr.add(f);
        };
        semer(feuillus, new THREE.CylinderGeometry(0.22, 0.3, 2.6, 6), new THREE.IcosahedronGeometry(2.3, 1), new THREE.MeshStandardMaterial({ color: 0x8DB56E, roughness: 0.9, flatShading: true }), 1.3, 4.3);
        semer(sapins, new THREE.CylinderGeometry(0.18, 0.24, 1.6, 6), new THREE.ConeGeometry(1.9, 6.5, 8), new THREE.MeshStandardMaterial({ color: 0x4F7F5A, roughness: 0.95, flatShading: true }), 0.8, 4.6);
      }
      scene.add(gr); this._decor = gr; map.triggerRepaint();
      return [geos.length, pts.length];
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
