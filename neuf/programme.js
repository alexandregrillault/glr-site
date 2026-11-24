// Page programme : plan de masse avec les logements étage par étage, onglet maquette 3D (chargée à la demande),
// liste des logements. Les trois se répondent : un logement choisi dans l'un est mis en avant dans les autres.
// Données : <script type="application/json" id="logements-data"> ; prix : window.GLR_PRIX (servis par la base).
(function () {
  var src = document.getElementById('logements-data'), svg = document.getElementById('plan');
  if (!src || !svg) return;
  var L = JSON.parse(src.textContent), NS = 'http://www.w3.org/2000/svg';
  var COUL = { T1: '#DCE7EC', T2: '#A9C9D5', T3: '#5E97AB', T4: '#005875', 'T5+': '#003B4F' }, CLAIR = { T1: 1, T2: 1 }, ORD = ['T1', 'T2', 'T3', 'T4', 'T5+'];
  var fiche = document.getElementById('bulle');

  // Même rangement que la maquette 3D : par étage, deux rangées (rue en bas du plan, jardin en haut), triées par taille
  var parEtage = {}, F = 0, N = 2;
  L.forEach(function (l) { (parEtage[l.e] = parEtage[l.e] || []).push(l); if (l.e > F) F = l.e; });
  F = Math.max(F + 1, 3);
  Object.keys(parEtage).forEach(function (k) {
    parEtage[k].sort(function (a, b) { return ORD.indexOf(a.t) - ORD.indexOf(b.t) || a.s - b.s; });
    N = Math.max(N, Math.ceil(parEtage[k].length / 2));
  });
  var W = 4.2, P = 5.2, larg = N * W, prof = 2 * P;
  var MX = Math.max(9, 14 - N), MH = 12, MB = 16, VW = larg + 2 * MX, VH = prof + MH + MB;
  svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
  var el = function (nom, att, parent, texte) { var e = document.createElementNS(NS, nom); for (var k in att) e.setAttribute(k, att[k]); if (texte != null) e.textContent = texte; (parent || svg).appendChild(e); return e; };
  var x0 = MX, y0 = MH; // coin haut-gauche de l'immeuble

  // ——— Le terrain : parcelle, jardin, rue, arbres, entrée, nord, échelle ———
  el('rect', { x: 0, y: 0, width: VW, height: VH, fill: '#EDE3CE' });
  el('rect', { x: 3, y: 3, width: VW - 6, height: VH - MB + 4, rx: 1.5, fill: '#DDE7CC', stroke: '#C5D3AE', 'stroke-width': 0.25 });
  el('rect', { x: 0, y: VH - 9.5, width: VW, height: 9.5, fill: '#F3EFE6' });
  el('rect', { x: 0, y: VH - 7.6, width: VW, height: 5.6, fill: '#CFCBC4' });
  el('line', { x1: 0, y1: VH - 4.8, x2: VW, y2: VH - 4.8, stroke: '#FFFFFF', 'stroke-width': 0.18, 'stroke-dasharray': '2 2' });
  el('text', { x: 4, y: VH - 0.7, 'font-size': 1.5, fill: '#616B75', 'letter-spacing': 0.15 }, null, 'RUE');
  el('rect', { x: x0 + larg / 2 - 1.6, y: y0 + prof, width: 3.2, height: VH - 9.5 - (y0 + prof), fill: '#F3EFE6' }); // allée d'entrée
  [[5.5, 7], [VW - 6, 8], [7, y0 + prof - 1], [VW - 7.5, y0 + prof + 1], [x0 + larg * 0.3, 5.5], [x0 + larg * 0.72, 6]].forEach(function (a, i) {
    el('circle', { cx: a[0], cy: a[1], r: i % 2 ? 1.5 : 2.1, fill: i % 2 ? '#4F7F5A' : '#8DB56E', opacity: 0.9 });
  });
  el('text', { x: x0 + larg / 2, y: 10.4, 'font-size': 1.45, fill: '#6F8A57', 'text-anchor': 'middle', 'letter-spacing': 0.12 }, null, 'JARDIN');
  // nord et échelle
  var gN = el('g', { transform: 'translate(' + (VW - 5) + ',5)' });
  el('polygon', { points: '0,-2.6 1.3,1.6 0,0.8 -1.3,1.6', fill: '#B0894C' }, gN);
  el('text', { x: 0, y: 3.6, 'font-size': 1.5, fill: '#8A6A2F', 'text-anchor': 'middle', 'font-weight': 600 }, gN, 'N');
  el('line', { x1: 4, y1: 5, x2: 14, y2: 5, stroke: '#616B75', 'stroke-width': 0.3 });
  el('text', { x: 9, y: 4, 'font-size': 1.4, fill: '#616B75', 'text-anchor': 'middle' }, null, '10 m');
  // l'immeuble
  el('rect', { x: x0 - 0.5, y: y0 - 0.5 + 0.9, width: larg + 1, height: prof + 1, rx: 0.6, fill: 'rgba(22,26,30,.14)' }); // ombre
  el('rect', { x: x0 - 0.5, y: y0 - 0.5, width: larg + 1, height: prof + 1, rx: 0.6, fill: '#FBF8F1', stroke: '#B0894C', 'stroke-width': 0.45 });
  el('text', { x: x0 + larg / 2, y: y0 + prof + 2.6, 'font-size': 1.3, fill: '#8A6A2F', 'text-anchor': 'middle', 'letter-spacing': 0.1 }, null, 'ENTRÉE');
  var gCases = el('g', {});

  // ——— Les logements de l'étage choisi ———
  var cases = {}, etageCourant = null, filtre = '', choisi = null;
  var nomEtage = function (e) { return e === 0 ? 'Rez-de-chaussée' : e + (e === 1 ? 'er' : 'e') + ' étage'; };
  var texteFiche = function (l) {
    var p = window.GLR_PRIX && window.GLR_PRIX[l.i], r = window.GLR_PRIX_R && window.GLR_PRIX_R[l.i];
    var eu = function (n) { return Math.round(n).toLocaleString('fr-FR') + ' €'; };
    return '<b>' + l.t + '</b> · ' + String(l.s).replace('.', ',') + ' m² · ' + nomEtage(l.e) + (l.x ? ' · ' + l.x : '') + ' · ' +
      (p || r ? [p ? '<b>' + eu(p) + '</b>' : '', r ? '<b>' + eu(r) + '</b> en TVA 5,5 %*' : ''].filter(Boolean).join(' · ') : 'Prix sur demande');
  };
  function choisir(l, depuisListe) {
    choisi = l;
    if (l && l.e !== etageCourant) montrerEtage(l.e);
    Object.keys(cases).forEach(function (k) { cases[k].classList.toggle('choisie', !!l && k === l.i); });
    document.querySelectorAll('tr.vise').forEach(function (z) { z.classList.remove('vise'); });
    if (!l) return;
    var tr = document.getElementById('l-' + l.i); if (tr) tr.classList.add('vise');
    if (fiche) fiche.innerHTML = texteFiche(l);
    if (!depuisListe && tr && window.innerWidth >= 960) tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function montrerEtage(e) {
    etageCourant = e; cases = {};
    while (gCases.firstChild) gCases.removeChild(gCases.firstChild);
    var rang = parEtage[e] || [];
    for (var r = 0; r < 2; r++) for (var k = 0; k < N; k++) {
      var l = rang[r * N + k], x = x0 + k * W, y = r === 0 ? y0 + P : y0; // rangée 0 = côté rue, en bas
      if (!l) { el('rect', { x: x + 0.2, y: y + 0.2, width: W - 0.4, height: P - 0.4, rx: 0.3, fill: '#EFEAE0', stroke: '#D8D2C5', 'stroke-width': 0.12 }, gCases); continue; }
      var g = el('g', { class: 'case', tabindex: 0, role: 'button', 'aria-label': l.t + ', ' + l.s + ' m², ' + nomEtage(l.e) }, gCases);
      el('rect', { x: x + 0.2, y: y + 0.2, width: W - 0.4, height: P - 0.4, rx: 0.3, fill: COUL[l.t] || '#5E97AB', stroke: '#FFFFFF', 'stroke-width': 0.2 }, g);
      var enc = CLAIR[l.t] ? '#005875' : '#FFFFFF';
      el('text', { x: x + W / 2, y: y + P / 2 - 0.2, 'font-size': 1.55, 'font-weight': 600, fill: enc, 'text-anchor': 'middle' }, g, l.t);
      el('text', { x: x + W / 2, y: y + P / 2 + 1.5, 'font-size': 1.05, fill: enc, 'text-anchor': 'middle', opacity: 0.9 }, g, String(Math.round(l.s)) + ' m²');
      if (/balcon|terrasse|loggia|jardin/i.test(l.x)) el('rect', { x: x + 0.7, y: r === 0 ? y + P - 0.15 : y - 0.55, width: W - 1.4, height: 0.7, rx: 0.2, fill: /jardin/i.test(l.x) ? '#B4C49A' : '#D8D2C5', stroke: '#B0894C', 'stroke-width': 0.1 }, g);
      cases[l.i] = g;
      (function (l, g) {
        g.addEventListener('mouseenter', function () { choisir(l); });
        g.addEventListener('click', function () { choisir(l); });
        g.addEventListener('focus', function () { choisir(l); });
      })(l, g);
    }
    appliquerFiltre();
    document.querySelectorAll('.etages button').forEach(function (b) { b.setAttribute('aria-pressed', Number(b.dataset.e) === e ? 'true' : 'false'); });
    var t = document.getElementById('etage-titre'); if (t) t.textContent = nomEtage(e) + ' · ' + (rang.length ? rang.length + (rang.length > 1 ? ' logements disponibles' : ' logement disponible') : 'aucun logement disponible');
    if (choisi && cases[choisi.i]) cases[choisi.i].classList.add('choisie');
  }
  function appliquerFiltre() { Object.keys(cases).forEach(function (k) { var l = L.filter(function (x) { return x.i === k; })[0]; cases[k].classList.toggle('eteinte', !!filtre && l.t !== filtre); }); }

  // Sélecteur d'étages (du haut vers le bas, comme l'immeuble)
  var zoneEt = document.getElementById('etages');
  if (zoneEt) for (var e = F - 1; e >= 0; e--) {
    var b = document.createElement('button'); b.type = 'button'; b.dataset.e = e;
    var n = (parEtage[e] || []).length;
    b.innerHTML = (e === 0 ? 'RDC' : e + (e === 1 ? 'er' : 'e')) + '<small>' + n + '</small>';
    if (!n) b.classList.add('vide');
    b.addEventListener('click', (function (e) { return function () { choisi = null; montrerEtage(e); }; })(e));
    zoneEt.appendChild(b);
  }
  var depart = 0, max = -1; for (var k in parEtage) if (parEtage[k].length > max) { max = parEtage[k].length; depart = Number(k); }
  montrerEtage(depart);

  // Filtres de taille : plan, liste (et maquette, qui écoute les mêmes boutons)
  var bs = document.querySelectorAll('.immeuble .filtres button');
  bs.forEach(function (b) { b.addEventListener('click', function () {
    filtre = b.getAttribute('data-t') || '';
    bs.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    document.querySelectorAll('section.typo').forEach(function (s) { s.style.display = !filtre || s.querySelector('h3').textContent.indexOf(filtre + ' ') === 0 ? '' : 'none'; });
    appliquerFiltre();
    document.querySelectorAll('.etages button').forEach(function (x) { var n = (parEtage[x.dataset.e] || []).filter(function (l) { return !filtre || l.t === filtre; }).length; x.querySelector('small').textContent = n; x.classList.toggle('vide', !n); });
  }); });

  // La liste répond : une ligne survolée ou touchée montre le logement sur le plan
  document.querySelectorAll('table.lots tr[id^="l-"]').forEach(function (tr) {
    var l = L.filter(function (x) { return x.i === tr.id.slice(2); })[0]; if (!l) return;
    tr.addEventListener('mouseenter', function () { choisir(l, true); });
    tr.addEventListener('click', function () { choisir(l, true); });
  });

  // Onglets : plan de masse / maquette 3D. La 3D n'est chargée que si on l'ouvre.
  var charge = false;
  document.querySelectorAll('.onglets button').forEach(function (b) { b.addEventListener('click', function () {
    var o = b.dataset.onglet;
    document.querySelectorAll('.onglets button').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
    document.getElementById('vue-plan').hidden = o !== 'plan';
    document.getElementById('vue-3d').hidden = o !== '3d';
    if (o === '3d' && !charge) { charge = true; import('/neuf/immeuble3d.js').catch(function () { document.getElementById('imm3d').innerHTML = '<p class="note" style="padding:16px">La maquette 3D ne s’affiche pas sur cet appareil.</p>'; }); }
    if (o === '3d') window.dispatchEvent(new Event('resize'));
  }); });
})();
