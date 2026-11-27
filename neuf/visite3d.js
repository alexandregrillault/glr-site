// Visite 3D et plans d'un programme : accès par formulaire (une fois), puis le fichier est demandé à la fonction plans-3d
// (lien temporaire de 5 minutes), téléchargé, et ouvert dans un cadre par un blob. Aucun plan n'est dans ce dépôt public.
// Deux endroits d'affichage : l'immeuble 3D en haut de fiche (sans formulaire), et un volet sous la ligne du logement touché
// dans le tableau (plan et/ou visite 3D du logement, un seul volet ouvert à la fois ; demande d'Alex du 28/11/2026).
(function () {
  var vq = ''; try { vq = new URL(document.currentScript.src).search; } catch (e) {} // ?v=empreinte, repris pour programme.js chargé en repli
  var FN = 'https://hydqfbxdtpmbuooexekp.supabase.co/functions/v1/plans-3d';
  var CLE = 'glr3d_jeton';
  var racine = document.getElementById('compte'), zone = document.getElementById('visite3d');
  if (!racine) return;
  var prog = racine.getAttribute('data-p');
  function liste(a) { return (racine.getAttribute(a) || '').split(',').filter(Boolean); }
  var clesOk = liste('data-lots'), clesPlan = liste('data-plans'); // logements avec visite 3D / avec plan du promoteur (drapeaux seulement)
  var mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  var attente = null; // ce que le client a demandé avant d'avoir son accès : {lot, mode}
  function jetonValide(j) { return /^[0-9a-f]{48}$/.test(j || ''); }
  // Un jeton qui n'a pas la bonne forme (48 caractères hexadécimaux) n'est jamais gardé : il est jeté, le formulaire redevient la porte d'entrée.
  function lireJeton() { try { var j = localStorage.getItem(CLE) || ''; if (j && !jetonValide(j)) { localStorage.removeItem(CLE); return ''; } return j; } catch (e) { return ''; } }
  function rouvrirFormulaire() { var f = document.getElementById('f3d'), ok = document.getElementById('f3d-ok'); if (f) f.hidden = false; if (ok) ok.hidden = true; }
  function ecrireJeton(j) { try { if (j) localStorage.setItem(CLE, j); else localStorage.removeItem(CLE); } catch (e) {} }
  function versFormulaire(t) {
    var f = document.getElementById('f3d');
    document.getElementById('compte').scrollIntoView({ behavior: 'smooth', block: 'start' });
    var e = document.getElementById('f3d-err'); if (e && t) e.textContent = t;
    if (f) { var p = f.querySelector('input'); if (p) setTimeout(function () { try { p.focus({ preventScroll: true }); } catch (x) {} }, 400); }
  }
  // La fonction répond 503 {"error":"reessayer"} quand le stockage refuse un instant : deux nouveaux essais à 1 seconde d'écart, sans rien afficher.
  function aller(url, opts, essai) {
    essai = essai || 0;
    return fetch(url, opts).then(function (r) {
      if ((r.status !== 503 && r.status !== 429) || essai >= 2) return r;
      return new Promise(function (ok) { setTimeout(ok, 1000 * (essai + 1)); }).then(function () { return aller(url, opts, essai + 1); });
    });
  }
  // Téléchargement du fichier lui-même (lien signé) : une erreur réseau, un 429 ou un 5xx sont retentés deux fois avant d'abandonner.
  function chercher(url, essai) {
    essai = essai || 0;
    var encore = function () { return new Promise(function (ok) { setTimeout(ok, 1000 * (essai + 1)); }).then(function () { return chercher(url, essai + 1); }); };
    return fetch(url).then(function (r) {
      if ((r.status === 429 || r.status >= 500) && essai < 2) return encore();
      return r;
    }, function (e) { if (essai < 2) return encore(); throw e; });
  }
  // Un « affichage » : un cadre, un message, des onglets, la boîte du plan. Un en haut (l'immeuble), un volet sous la ligne touchée.
  function vue(z) {
    var v = { z: z, cadre: z.querySelector('iframe'), etat: z.querySelector('.etat3d'), planbox: z.querySelector('.planbox'), onglets: z.querySelector('.onglets3d'), lienBlob: null, urlPlan: null, ouvert: null, lot: null, page: 1, nb: 1, req: 0 };
    v.img = v.planbox && v.planbox.querySelector('img'); v.lienPdf = v.planbox && v.planbox.querySelector('a.ouvrir-plan'); v.pager = v.planbox && v.planbox.querySelector('.pagesplan');
    v.libere = function () {
      if (v.lienBlob) { URL.revokeObjectURL(v.lienBlob); v.lienBlob = null; }
      if (v.urlPlan) { URL.revokeObjectURL(v.urlPlan); v.urlPlan = null; }
      v.cadre.removeAttribute('src');
      if (v.img) v.img.removeAttribute('src');
      if (v.lienPdf) { v.lienPdf.removeAttribute('href'); v.lienPdf.hidden = true; }
      if (v.planbox) v.planbox.hidden = true;
    };
    v.relance = null;
    v.message = function (t, relance) { // relance : fonction appelée par le bouton « Réessayer » (échecs qui peuvent passer : limite, réseau, serveur)
      v.etat.textContent = t || ''; v.etat.hidden = !t; v.relance = relance || null;
      if (relance) { var b = document.createElement('button'); b.type = 'button'; b.className = 'reessayer'; b.textContent = 'Réessayer'; v.etat.appendChild(document.createTextNode(' ')); v.etat.appendChild(b); }
    };
    // Onglets « Plan | Visite 3D » : seulement pour un logement qui a les deux
    v.onglet = function (lot, actif) {
      if (!v.onglets) return;
      var deux = clesOk.indexOf(lot) > -1 && clesPlan.indexOf(lot) > -1;
      v.onglets.hidden = !deux;
      v.onglets.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-onglet') === actif ? 'true' : 'false'); });
    };
    v.majPager = function () {
      if (!v.pager) return;
      v.pager.hidden = !(v.nb > 1);
      var sp = v.pager.querySelector('span'); if (sp) sp.textContent = 'Page ' + v.page + ' sur ' + v.nb;
      var bp = v.pager.querySelector('[data-page=prec]'), bs = v.pager.querySelector('[data-page=suiv]');
      if (bp) bp.disabled = v.page <= 1; if (bs) bs.disabled = v.page >= v.nb;
    };
    return v;
  }
  var haut = zone ? vue(zone) : null, bas = null, ligneOuverte = null;
  // Repli : si l'immeuble ne se charge pas (fonction indisponible, limite atteinte…), la maquette automatique prend sa place.
  var secoursFait = false;
  function secours() {
    var s = document.getElementById('secours3d'), z = document.querySelector('.vue3d');
    if (!s) return;
    if (z) z.hidden = true; s.hidden = false;
    if (secoursFait) return; secoursFait = true;
    var sc = document.createElement('script'); sc.src = '/neuf/programme.js' + vq; document.body.appendChild(sc);
  }
  // ---- Immeuble (en haut de fiche) : s'ouvre SANS formulaire ; le formulaire n'est demandé que pour un logement. ----
  function ouvrirImmeuble(sansDefiler) {
    if (!haut) return;
    var jeton = lireJeton();
    if (haut.ouvert === 'immeuble' && haut.cadre.getAttribute('src')) { if (!sansDefiler) haut.z.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    var vz = haut.z.closest('.vue3d'); if (vz) vz.hidden = false;
    haut.libere(); haut.ouvert = 'immeuble'; haut.z.classList.remove('charge');
    haut.message('Chargement de la visite 3D\u2026 (un peu long sur mobile)');
    if (!sansDefiler) haut.z.scrollIntoView({ behavior: 'smooth', block: 'start' });
    aller(FN + '?p=' + encodeURIComponent(prog) + (jeton ? '&t=' + encodeURIComponent(jeton) : ''), { headers: { accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401 && jeton) { ecrireJeton(''); rouvrirFormulaire(); haut.ouvert = null; ouvrirImmeuble(sansDefiler); return null; }
        if (!r.ok && r.status !== 401 && r.status !== 404 && r.status !== 503 && r.status !== 429) throw new Error('http');
        if (!r.ok) { haut.ouvert = null; secours(); return null; }
        return r.json();
      })
      .then(function (j) { if (!j || !j.url) return null; return chercher(j.url); })
      .then(function (r) { if (!r) return null; if (!r.ok) throw new Error('http'); return r.blob(); })
      .then(function (b) {
        if (!b || haut.ouvert !== 'immeuble') return;
        haut.libere(); haut.lienBlob = URL.createObjectURL(new Blob([b], { type: 'text/html;charset=utf-8' }));
        haut.cadre.src = haut.lienBlob; haut.z.classList.add('charge'); haut.message('');
      })
      .catch(function () { if (haut.ouvert === 'immeuble') { haut.ouvert = null; secours(); } });
  }
  // ---- Volet sous la ligne d'un logement ----
  function creerVolet(nbCol) {
    var tr = document.createElement('tr'); tr.className = 'volet';
    tr.innerHTML = '<td colspan="' + nbCol + '"><div class="immeuble3d volet3d"><div class="volet-barre"><div class="onglets3d" hidden><button type="button" data-onglet="plan" aria-pressed="false">Plan</button><button type="button" data-onglet="visite" aria-pressed="false">Plan 3D</button></div><button type="button" class="ferme3d">Fermer</button></div>'
      + '<p class="etat3d" hidden></p><iframe title="Plan 3D du logement" allow="fullscreen"></iframe>'
      + '<div class="planbox" hidden><div class="pagesplan" hidden><button type="button" data-page="prec">Page précédente</button><span></span><button type="button" data-page="suiv">Page suivante</button></div><img alt="Plan du logement"><a class="ouvrir-plan" target="_blank" rel="noopener" hidden>Ouvrir le plan</a></div></div></td>';
    return tr;
  }
  function fermer() {
    if (bas) { bas.libere(); bas.ouvert = null; bas.lot = null; bas.message(''); bas.req++; if (bas.tr.parentNode) bas.tr.parentNode.removeChild(bas.tr); }
    if (ligneOuverte) { ligneOuverte.classList.remove('ouverte'); ligneOuverte = null; }
  }
  function placer(lot) { // met le volet juste sous la ligne du logement ; renvoie l'affichage du volet, ou null si la ligne n'existe pas
    var ligne = document.getElementById('l-' + lot); if (!ligne) return null;
    var sec = ligne.closest('section.typo'); if (sec && sec.style.display === 'none') sec.style.display = '';
    if (!bas) { var tr = creerVolet(ligne.cells.length); bas = vue(tr.querySelector('.immeuble3d')); bas.tr = tr; }
    if (bas.tr.previousElementSibling !== ligne) {
      var avant = bas.ouvert; bas.libere(); bas.ouvert = null; bas.req++;
      if (ligneOuverte) ligneOuverte.classList.remove('ouverte');
      ligne.parentNode.insertBefore(bas.tr, ligne.nextSibling); void avant;
    }
    ligne.classList.add('ouverte'); ligneOuverte = ligne; bas.ligne = ligne;
    return bas;
  }
  function montrerLigne(ligne) { // la page ne saute que si la ligne n'est pas déjà bien visible ; la ligne reste au-dessus du volet
    var r = ligne.getBoundingClientRect();
    if (r.top < 70 || r.top > window.innerHeight * 0.5) { try { ligne.style.scrollMarginTop = '80px'; ligne.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
  }
  var MSG_OUVERTURE = 'Chargement\u2026';
  // mode : 'plan' (plan du promoteur) ou 'visite' (visite 3D du logement)
  function ouvrirLot(lot, mode, page) {
    var jeton = lireJeton();
    if (!jeton) { attente = { lot: lot, mode: mode }; versFormulaire(mode === 'plan' ? 'Pour voir le plan, créez votre accès : cela prend une minute.' : 'Pour voir ce logement, créez votre accès : cela prend une minute.'); return; }
    if (mode === 'plan' && clesPlan.indexOf(lot) < 0) mode = 'visite';
    if (mode === 'visite' && clesOk.indexOf(lot) < 0) mode = 'plan';
    var v = placer(lot); if (!v) return;
    if (!page) montrerLigne(v.ligne);
    if (mode === 'plan') chargerPlan(v, lot, page || 1, jeton); else chargerVisite(v, lot, jeton);
  }
  function expire(v, lot, mode) { ecrireJeton(''); rouvrirFormulaire(); attente = { lot: lot, mode: mode }; fermer(); versFormulaire('Votre accès a expiré : recréez-le en une minute.'); }
  function chargerVisite(v, lot, jeton) {
    var relance = function () { ouvrirLot(lot, 'visite'); };
    v.libere(); v.ouvert = lot; v.lot = lot; var req = ++v.req; v.z.classList.remove('charge'); v.onglet(lot, 'visite');
    v.message('Chargement du plan 3D\u2026');
    var actuel = function () { return v.ouvert === lot && req === v.req; };
    aller(FN + '?p=' + encodeURIComponent(prog) + '&l=' + encodeURIComponent(lot) + '&t=' + encodeURIComponent(jeton), { headers: { accept: 'application/json' } })
      .then(function (r) {
        if (!actuel()) return null;
        if (r.status === 401) { expire(v, lot, 'visite'); return null; }
        if (r.status === 404) { v.ouvert = null; v.message('Ce plan 3D n\u2019est pas encore disponible.'); return null; }
        if (r.status === 503) { v.ouvert = null; v.message('Le serveur est occupé.', relance); return null; }
        if (r.status === 429) { v.ouvert = null; v.message('Trop de demandes d\u2019un coup.', relance); return null; }
        if (!r.ok) throw new Error('http');
        return r.json();
      })
      .then(function (j) { if (!j || !j.url) return null; return chercher(j.url); })
      .then(function (r) { if (!r) return null; if (!r.ok) throw new Error('http'); return r.blob(); })
      .then(function (b) {
        if (!b || !actuel()) return;
        v.libere(); v.lienBlob = URL.createObjectURL(new Blob([b], { type: 'text/html;charset=utf-8' }));
        v.cadre.src = v.lienBlob; v.z.classList.add('charge'); v.message('');
      })
      .catch(function () { if (actuel()) { v.ouvert = null; v.message('Le plan 3D n\u2019a pas pu se charger.', relance); } });
  }
  // Plan du promoteur : la fonction répond soit par le fichier lui-même (image ou PDF), soit par du JSON {url, expire, pages}
  // avec un lien signé vers une image (&page=n pour les plans de plusieurs pages) : les deux sont acceptés.
  function chargerPlan(v, lot, n, jeton) {
    var relance = function () { ouvrirLot(lot, 'plan', n > 1 ? n : 0); };
    var cle = 'plan:' + lot, req = ++v.req;
    v.libere(); v.ouvert = cle; v.lot = lot; v.page = n; if (n === 1) v.nb = 1; v.onglet(lot, 'plan'); v.majPager();
    v.message('Chargement du plan\u2026');
    var actuel = function () { return v.ouvert === cle && req === v.req; };
    aller(FN + '?p=' + encodeURIComponent(prog) + '&l=' + encodeURIComponent(lot) + '&t=' + encodeURIComponent(jeton) + '&doc=plan' + (n > 1 ? '&page=' + n : ''))
      .then(function (r) {
        if (!actuel()) return null;
        if (r.status === 401) { expire(v, lot, 'plan'); return null; }
        if (r.status === 404) { v.ouvert = null; v.message('Ce plan n\u2019est pas disponible. Appelez-nous, nous vous l\u2019envoyons.'); return null; }
        if (r.status === 503) { v.ouvert = null; v.message('Le serveur est occupé.', relance); return null; }
        if (r.status === 429) { v.ouvert = null; v.message('Trop de demandes d\u2019un coup.', relance); return null; }
        if (!r.ok) throw new Error('http');
        if (/json/i.test(r.headers.get('content-type') || '')) { // mode « lien signé » : JSON puis image
          return r.json().then(function (j) {
            if (!j || !j.url) throw new Error('json');
            v.nb = Math.max(1, parseInt(j.pages, 10) || 1);
            return chercher(j.url).then(function (r2) { if (!r2.ok) throw new Error('http'); return r2.blob(); });
          });
        }
        v.nb = 1; return r.blob(); // mode « fichier direct »
      })
      .then(function (b) {
        if (!b || !actuel()) return;
        var t = String(b.type || '').toLowerCase();
        if (t.indexOf('image/') === 0) { v.urlPlan = URL.createObjectURL(b); v.img.src = v.urlPlan; v.planbox.hidden = false; v.message(''); v.majPager(); }
        else if (t.indexOf('pdf') > -1) {
          var pdf = new Blob([b], { type: 'application/pdf' });
          if (mobile) { // iPhone : un PDF ne s'affiche pas bien dans un cadre ; on l'ouvre dans une page à part, au toucher du client
            v.urlPlan = URL.createObjectURL(pdf); v.lienPdf.href = v.urlPlan; v.lienPdf.hidden = false; v.planbox.hidden = false; v.message(''); v.majPager();
          } else { v.lienBlob = URL.createObjectURL(pdf); v.cadre.src = v.lienBlob; v.message(''); v.majPager(); }
        } else { v.ouvert = null; v.message('Ce plan ne peut pas s\u2019afficher ici. Appelez-nous, nous vous l\u2019envoyons.'); }
      })
      .catch(function () { if (actuel()) { v.ouvert = null; v.message('Le plan n\u2019a pas pu se charger.', relance); } });
  }
  // L'immeuble (1,4 Mo) n'est chargé que lorsqu'il arrive à l'écran, ou au toucher du bouton : jamais à l'ouverture de la page.
  if (haut && 'IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { obs.disconnect(); if (!haut.ouvert) ouvrirImmeuble(true); } }, { rootMargin: '200px' });
    obs.observe(haut.z);
  }
  // Filtres de taille de la liste (la page n'utilise plus programme.js quand la visite 3D est là)
  var bs = document.querySelectorAll('.immeuble .filtres button');
  bs.forEach(function (b) { b.addEventListener('click', function () {
    var t = b.getAttribute('data-t') || '';
    bs.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    document.querySelectorAll('section.typo').forEach(function (sec) { sec.style.display = !t || sec.querySelector('h3').textContent.indexOf(t + ' ') === 0 ? '' : 'none'; });
  }); });
  // Survol (ou toucher sur téléphone) d'une ligne de la liste → l'immeuble repère le logement ; et dans l'autre sens, l'immeuble → la ligne.
  // On ne parle au cadre que lorsqu'il montre l'immeuble, et seulement pour un logement qui a sa visite (clé publique connue de la page).
  var ligneVisee = null;
  function surligner(cle) {
    if (ligneVisee) { ligneVisee.classList.remove('vise'); ligneVisee = null; }
    if (!cle) return;
    var tr = document.getElementById('l-' + cle); if (!tr) return;
    tr.classList.add('vise'); ligneVisee = tr;
    if (window.innerWidth >= 960) { try { tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {} }
  }
  function direAuCadre(cle) {
    try { if (haut && haut.ouvert === 'immeuble' && haut.cadre.contentWindow && haut.cadre.getAttribute('src')) haut.cadre.contentWindow.postMessage({ glr3d: 'survol', lot: cle }, location.origin); } catch (e) {}
  }
  if (haut) document.querySelectorAll('table.lots tr[id^="l-"]').forEach(function (tr) {
    var cle = tr.id.slice(2); if (clesOk.indexOf(cle) < 0) return;
    tr.addEventListener('mouseenter', function () { direAuCadre(cle); });
    tr.addEventListener('mouseleave', function () { direAuCadre(null); });
    tr.addEventListener('click', function (ev) { if (ev.target.closest && ev.target.closest('button,a')) return; direAuCadre(cle); }); // téléphone : un toucher sur la ligne
  });
  // Le cadre de l'immeuble dit quel logement on a touché ; le cadre d'un logement peut dire « retour à l'immeuble ».
  // On n'écoute que nos cadres, et que des clés connues.
  window.addEventListener('message', function (ev) {
    if (!ev.data || typeof ev.data !== 'object') return;
    var dHaut = haut && ev.source === haut.cadre.contentWindow, dBas = bas && ev.source === bas.cadre.contentWindow;
    if (!dHaut && !dBas) return;
    if (ev.data.glr3d === 'survol') { // l'immeuble nous dit quel logement est survolé : la ligne de la liste est surlignée
      if (!dHaut) return;
      var cle = ev.data.lot; if (cle !== null && !(typeof cle === 'string' && clesOk.indexOf(cle) > -1)) return;
      surligner(cle); return;
    }
    if (ev.data.glr3d === 'immeuble') { fermer(); ouvrirImmeuble(false); }
    else if (ev.data.glr3d === 'lot' && typeof ev.data.lot === 'string' && clesOk.indexOf(ev.data.lot) > -1) ouvrirLot(ev.data.lot, 'visite');
  });
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target : null; if (!t) return;
    var b = t.closest('[data-3d]');
    if (b) { ev.preventDefault(); var l3 = b.getAttribute('data-3d'); if (l3 === 'immeuble') ouvrirImmeuble(false); else ouvrirLot(l3, 'visite'); return; }
    b = t.closest('[data-plan]');
    if (b) { ev.preventDefault(); ouvrirLot(b.getAttribute('data-plan'), 'plan'); return; }
    b = t.closest('.reessayer');
    if (b && bas && bas.relance) { ev.preventDefault(); bas.relance(); return; }
    b = t.closest('[data-onglet]');
    if (b && bas && bas.lot) { ev.preventDefault(); ouvrirLot(bas.lot, b.getAttribute('data-onglet') === 'plan' ? 'plan' : 'visite', 0); return; }
    b = t.closest('[data-page]');
    if (b && bas && bas.lot && bas.ouvert && bas.ouvert.indexOf('plan:') === 0) { ev.preventDefault(); var np = bas.page + (b.getAttribute('data-page') === 'suiv' ? 1 : -1); if (np >= 1 && np <= bas.nb) ouvrirLot(bas.lot, 'plan', np); return; }
    if (t.closest('.ferme3d')) { ev.preventDefault(); var lg = ligneOuverte; fermer(); if (lg) { var r = lg.getBoundingClientRect(); if (r.top < 0) lg.scrollIntoView({ block: 'center' }); } }
  });
  // Formulaire d'accès
  var debut = Date.now(); // temps entre l'affichage du formulaire et l'envoi, envoyé à la fonction (un envoi instantané n'est pas un humain) ; aucun champ caché : Chrome les remplit
  var f = document.getElementById('f3d'); if (!f) return;
  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    try { envoyer(); } catch (e) { var er = document.getElementById('f3d-err'); if (er) er.textContent = 'L\u2019envoi n\u2019a pas marché. Réessayez, ou appelez-nous.'; }
  });
  function envoyer() {
    var err = document.getElementById('f3d-err'), go = f.querySelector('button[type=submit]');
    function v(n) { var e = f.elements[n]; return e && e.value ? String(e.value).trim() : ''; } // un champ absent ne fait jamais planter l'envoi
    var d = { action: 'inscrire', prenom: v('prenom'), telephone: v('telephone'), email: v('email'), accord: !!(f.elements.accord && f.elements.accord.checked), p: prog,
      programme: f.getAttribute('data-prog') || '', ville: f.getAttribute('data-ville') || '', societe: '', hp_glr: '', delai_ms: Date.now() - debut };
    if (!d.prenom) { err.textContent = 'Indiquez votre prénom.'; return; }
    if (d.telephone.replace(/\D/g, '').length < 9) { err.textContent = 'Indiquez un numéro de téléphone valide.'; return; }
    if (!/^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(d.email)) { err.textContent = d.email ? 'L’adresse e-mail ne semble pas valide.' : 'Indiquez votre e-mail.'; return; }
    if (!d.accord) { err.textContent = 'Cochez la case pour que votre conseiller puisse vous recontacter.'; return; }
    err.textContent = ''; go.disabled = true; go.textContent = 'Envoi…';
    fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      .then(function (r) { if (r.status === 429) throw new Error('429'); return r.json().then(function (j) { if (!r.ok || !j || !jetonValide(j.jeton)) throw new Error('x'); return j; }); })
      .then(function (j) {
        ecrireJeton(j.jeton); go.disabled = false; go.textContent = 'Créer mon accès';
        document.getElementById('f3d-err').textContent = '';
        document.getElementById('f3d-ok').hidden = false; f.hidden = true;
        var a = attente; attente = null; // le logement ou le plan demandé s'ouvre dans son volet ; sinon l'immeuble
        if (a) ouvrirLot(a.lot, a.mode); else if (haut) ouvrirImmeuble(false);
      })
      .catch(function (e) {
        go.disabled = false; go.textContent = 'Créer mon accès';
        err.textContent = e.message === '429' ? 'Trop d’envois d’un coup : réessayez dans quelques minutes.' : 'L’envoi n’a pas marché. Réessayez, ou appelez-nous.';
      });
  }
  if (lireJeton()) { var ok = document.getElementById('f3d-ok'); if (ok) ok.hidden = false; f.hidden = true; }
})();
