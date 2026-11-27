// Visite 3D d'un programme : accès par formulaire (une fois), puis le fichier est demandé à la fonction plans-3d
// (lien temporaire de 5 minutes), téléchargé, et ouvert dans un cadre par un blob. Aucun plan n'est dans ce dépôt public.
(function () {
  var vq = ''; try { vq = new URL(document.currentScript.src).search; } catch (e) {} // ?v=empreinte, repris pour programme.js chargé en repli
  var FN = 'https://hydqfbxdtpmbuooexekp.supabase.co/functions/v1/plans-3d';
  var CLE = 'glr3d_jeton';
  var racine = document.getElementById('compte'), zone = document.getElementById('visite3d');
  if (!racine || !zone) return;
  var cadre = zone.querySelector('iframe'), etat = zone.querySelector('.etat3d');
  var est3d = zone.getAttribute('data-mode') !== 'plan'; // 'plan' : fiche sans visite 3D, seulement le plan du promoteur
  var clesPlan = (zone.getAttribute('data-plans') || '').split(','), planbox = zone.querySelector('.planbox'), img = planbox && planbox.querySelector('img'), lienPdf = planbox && planbox.querySelector('a.ouvrir-plan'), onglets = zone.querySelector('.onglets3d');
  var urlPlan = null;
  var mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  var prog = zone.getAttribute('data-p'), clesOk = (zone.getAttribute('data-lots') || '').split(',');
  // Immeuble : appel sans le paramètre l ; logement : l = clé du lot (contrat de la fonction plans-3d, vérifié par CRM le 27/11/2026).
  var lienBlob = null, lotOuvert = null, attente = null;
  function jetonValide(j) { return /^[0-9a-f]{48}$/.test(j || ''); }
  // Un jeton qui n'a pas la bonne forme (48 caractères hexadécimaux) n'est jamais gardé : il est jeté, le formulaire redevient la porte d'entrée.
  function lireJeton() { try { var j = localStorage.getItem(CLE) || ''; if (j && !jetonValide(j)) { localStorage.removeItem(CLE); return ''; } return j; } catch (e) { return ''; } }
  function rouvrirFormulaire() { var f = document.getElementById('f3d'), ok = document.getElementById('f3d-ok'); if (f) f.hidden = false; if (ok) ok.hidden = true; }
  function ecrireJeton(j) { try { if (j) localStorage.setItem(CLE, j); else localStorage.removeItem(CLE); } catch (e) {} }
  function libere() {
    if (lienBlob) { URL.revokeObjectURL(lienBlob); lienBlob = null; }
    if (urlPlan) { URL.revokeObjectURL(urlPlan); urlPlan = null; }
    cadre.removeAttribute('src');
    if (img) img.removeAttribute('src');
    if (lienPdf) { lienPdf.removeAttribute('href'); lienPdf.hidden = true; }
    if (planbox) planbox.hidden = true;
  }
  // Onglets « Visite 3D | Plan du promoteur » : seulement pour un logement qui a les deux
  function onglet(lot, actif) {
    if (!onglets) return;
    var deux = lot !== 'immeuble' && est3d && clesOk.indexOf(lot) > -1 && clesPlan.indexOf(lot) > -1;
    onglets.hidden = !deux; onglets.setAttribute('data-lot', lot || '');
    onglets.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-onglet') === actif ? 'true' : 'false'); });
  }
  function message(t) { etat.textContent = t || ''; etat.hidden = !t; }
  function versFormulaire(t) {
    var f = document.getElementById('f3d');
    document.getElementById('compte').scrollIntoView({ behavior: 'smooth', block: 'start' });
    var e = document.getElementById('f3d-err'); if (e && t) e.textContent = t;
    if (f) { var p = f.querySelector('input'); if (p) setTimeout(function () { try { p.focus({ preventScroll: true }); } catch (x) {} }, 400); }
  }
  // Repli : si l'immeuble ne se charge pas (fonction indisponible, limite atteinte…), la maquette automatique prend sa place.
  var secoursFait = false;
  function secours() {
    var v = document.getElementById('secours3d'), z = document.querySelector('.vue3d');
    if (!v) return;
    if (z) z.hidden = true; v.hidden = false;
    if (secoursFait) return; secoursFait = true;
    var sc = document.createElement('script'); sc.src = '/neuf/programme.js' + vq; document.body.appendChild(sc);
  }
  // L'immeuble s'ouvre SANS formulaire (et sans jeton s'il n'y en a pas) ; le formulaire n'est demandé que pour un logement.
  function ouvrir(lot, sansDefiler) {
    var jeton = lireJeton(), immeuble = lot === 'immeuble';
    if (!immeuble && !jeton) { attente = lot; versFormulaire('Pour voir ce logement, créez votre accès : cela prend une minute.'); return; }
    if (immeuble && lotOuvert === 'immeuble' && cadre.getAttribute('src')) { if (!sansDefiler) zone.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    var vz = zone.closest('.vue3d'); if (vz) vz.hidden = false; // le cadre peut avoir été masqué par le repli : un logement demandé doit toujours se voir
    libere(); lotOuvert = lot; zone.classList.remove('charge'); onglet(lot, 'visite');
    message('Chargement de la visite 3D\u2026 (un peu long sur mobile)');
    if (!sansDefiler) zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var adresse = FN + '?p=' + encodeURIComponent(prog) + (immeuble ? '' : '&l=' + encodeURIComponent(lot)) + (jeton ? '&t=' + encodeURIComponent(jeton) : '');
    fetch(adresse, { headers: { accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) {
          if (jeton) { ecrireJeton(''); rouvrirFormulaire(); lotOuvert = null; if (immeuble) { ouvrir('immeuble', sansDefiler); return null; } attente = lot; message(''); versFormulaire('Votre accès a expiré : recréez-le en une minute.'); return null; }
          lotOuvert = null; if (immeuble) { secours(); return null; } message('Pour voir cette visite, créez votre accès : cela prend une minute.'); return null;
        }
        if (r.status === 404) { lotOuvert = null; if (immeuble) { secours(); return null; } message('Cette visite n\u2019est pas encore disponible.'); return null; }
        if (r.status === 429) { lotOuvert = null; if (immeuble) { secours(); return null; } message('Trop de demandes d\u2019un coup : réessayez dans quelques minutes.'); return null; }
        if (!r.ok) throw new Error('http');
        return r.json();
      })
      .then(function (j) { if (!j || !j.url) return null; return fetch(j.url); })
      .then(function (r) { if (!r) return null; if (!r.ok) throw new Error('http'); return r.blob(); })
      .then(function (b) {
        if (!b || lotOuvert !== lot) return;
        libere(); lienBlob = URL.createObjectURL(new Blob([b], { type: 'text/html' }));
        cadre.src = lienBlob; zone.classList.add('charge'); message('');
      })
      .catch(function () { if (lotOuvert === lot) { lotOuvert = null; if (immeuble) { secours(); return; } message('La visite n\u2019a pas pu se charger. Réessayez, ou appelez-nous.'); } });
  }
  // Plan du promoteur d'un logement : seulement avec un accès. La fonction répond soit par le fichier lui-même (image ou PDF),
  // soit par du JSON {url, expire, pages} avec un lien signé vers une image (&page=n pour les plans de plusieurs pages) : les deux sont acceptés.
  var pagePlan = 1, nbPages = 1, lotPlan = null, numReq = 0;
  var pager = planbox && planbox.querySelector('.pagesplan');
  function majPager() {
    if (!pager) return;
    pager.hidden = !(nbPages > 1);
    var sp = pager.querySelector('span'); if (sp) sp.textContent = 'Page ' + pagePlan + ' sur ' + nbPages;
    var bp = pager.querySelector('[data-page=prec]'), bs2 = pager.querySelector('[data-page=suiv]');
    if (bp) bp.disabled = pagePlan <= 1; if (bs2) bs2.disabled = pagePlan >= nbPages;
  }
  function montrerImage(b) { urlPlan = URL.createObjectURL(b); img.src = urlPlan; planbox.hidden = false; message(''); majPager(); }
  function ouvrirPlan(lot, sansDefiler, page) {
    var jeton = lireJeton(), cle = 'plan:' + lot, n = page || 1, req = ++numReq;
    if (!jeton) { attente = cle; versFormulaire('Pour voir le plan, créez votre accès : cela prend une minute.'); return; }
    var vz = zone.closest('.vue3d'); if (vz) vz.hidden = false; zone.hidden = false;
    libere(); lotOuvert = cle; lotPlan = lot; pagePlan = n; if (n === 1) nbPages = 1; zone.classList.add('charge'); onglet(lot, 'plan'); majPager();
    message('Chargement du plan\u2026');
    if (!sansDefiler) zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var actuel = function () { return lotOuvert === cle && req === numReq; };
    fetch(FN + '?p=' + encodeURIComponent(prog) + '&l=' + encodeURIComponent(lot) + '&t=' + encodeURIComponent(jeton) + '&doc=plan' + (n > 1 ? '&page=' + n : ''))
      .then(function (r) {
        if (r.status === 401) { ecrireJeton(''); rouvrirFormulaire(); lotOuvert = null; attente = cle; message(''); versFormulaire('Votre accès a expiré : recréez-le en une minute.'); return null; }
        if (r.status === 404) { lotOuvert = null; message('Ce plan n\u2019est pas disponible. Appelez-nous, nous vous l\u2019envoyons.'); return null; }
        if (r.status === 429) { lotOuvert = null; message('Trop de demandes d\u2019un coup : réessayez dans quelques minutes.'); return null; }
        if (!r.ok) throw new Error('http');
        if (/json/i.test(r.headers.get('content-type') || '')) {
          // Mode « lien signé » : JSON puis image
          return r.json().then(function (j) {
            if (!j || !j.url) throw new Error('json');
            nbPages = Math.max(1, parseInt(j.pages, 10) || 1);
            return fetch(j.url).then(function (r2) { if (!r2.ok) throw new Error('http'); return r2.blob(); });
          });
        }
        nbPages = 1; return r.blob(); // mode « fichier direct »
      })
      .then(function (b) {
        if (!b || !actuel()) return;
        var t = String(b.type || '').toLowerCase();
        if (t.indexOf('image/') === 0) montrerImage(b);
        else if (t.indexOf('pdf') > -1) {
          var pdf = new Blob([b], { type: 'application/pdf' });
          if (mobile) {
            // iPhone : un PDF ne s'affiche pas bien dans un cadre ; on l'ouvre dans une page à part, au toucher du client
            urlPlan = URL.createObjectURL(pdf); lienPdf.href = urlPlan; lienPdf.hidden = false; planbox.hidden = false; message(''); majPager();
          } else { lienBlob = URL.createObjectURL(pdf); cadre.src = lienBlob; message(''); majPager(); }
        } else { lotOuvert = null; message('Ce plan ne peut pas s\u2019afficher ici. Appelez-nous, nous vous l\u2019envoyons.'); }
      })
      .catch(function () { if (actuel()) { lotOuvert = null; message('Le plan n\u2019a pas pu se charger. Réessayez, ou appelez-nous.'); } });
  }
  // L'immeuble (1,4 Mo) n'est chargé que lorsqu'il arrive à l'écran, ou au toucher du bouton : jamais à l'ouverture de la page.
  if (est3d && 'IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { obs.disconnect(); if (!lotOuvert) ouvrir('immeuble', true); } }, { rootMargin: '200px' });
    obs.observe(zone);
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
    try { if (lotOuvert === 'immeuble' && cadre.contentWindow && cadre.getAttribute('src')) cadre.contentWindow.postMessage({ glr3d: 'survol', lot: cle }, location.origin); } catch (e) {}
  }
  if (est3d) document.querySelectorAll('table.lots tr[id^="l-"]').forEach(function (tr) {
    var cle = tr.id.slice(2); if (clesOk.indexOf(cle) < 0) return;
    tr.addEventListener('mouseenter', function () { direAuCadre(cle); });
    tr.addEventListener('mouseleave', function () { direAuCadre(null); });
    tr.addEventListener('click', function (ev) { if (ev.target.closest && ev.target.closest('button,a')) return; direAuCadre(cle); }); // téléphone : un toucher sur la ligne
  });
  // Le cadre dit quel logement on a touché (ou « retour à l'immeuble ») ; on n'écoute que notre cadre, et que des clés connues.
  window.addEventListener('message', function (ev) {
    if (ev.source !== cadre.contentWindow || !ev.data || typeof ev.data !== 'object') return;
    if (ev.data.glr3d === 'survol') { // l'immeuble nous dit quel logement est survolé : la ligne de la liste est surlignée
      var cle = ev.data.lot; if (cle !== null && !(typeof cle === 'string' && clesOk.indexOf(cle) > -1)) return;
      surligner(cle); return;
    }
    if (ev.data.glr3d === 'immeuble') { lotOuvert = null; ouvrir('immeuble', true); }
    else if (ev.data.glr3d === 'lot' && typeof ev.data.lot === 'string' && clesOk.indexOf(ev.data.lot) > -1) ouvrir(ev.data.lot);
  });
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target : null; if (!t) return;
    var b = t.closest('[data-3d]');
    if (b) { ev.preventDefault(); ouvrir(b.getAttribute('data-3d')); return; }
    b = t.closest('[data-plan]');
    if (b) { ev.preventDefault(); ouvrirPlan(b.getAttribute('data-plan')); return; }
    b = t.closest('[data-onglet]');
    if (b && onglets) { ev.preventDefault(); var lot = onglets.getAttribute('data-lot'); if (b.getAttribute('data-onglet') === 'plan') ouvrirPlan(lot, true); else ouvrir(lot, true); return; }
    b = t.closest('[data-page]');
    if (b && lotPlan) { ev.preventDefault(); var np = pagePlan + (b.getAttribute('data-page') === 'suiv' ? 1 : -1); if (np >= 1 && np <= nbPages) ouvrirPlan(lotPlan, true, np); return; }
    if (t.closest('.ferme3d')) { libere(); lotOuvert = null; message(''); if (!est3d) zone.hidden = true; }
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
        var l = attente || (est3d ? 'immeuble' : null); attente = null; // le logement ou le plan demandé s'ouvre ; sinon l'immeuble
        if (l) { if (l.indexOf('plan:') === 0) ouvrirPlan(l.slice(5)); else ouvrir(l); }
      })
      .catch(function (e) {
        go.disabled = false; go.textContent = 'Créer mon accès';
        err.textContent = e.message === '429' ? 'Trop d’envois d’un coup : réessayez dans quelques minutes.' : 'L’envoi n’a pas marché. Réessayez, ou appelez-nous.';
      });
  }
  if (lireJeton()) { var ok = document.getElementById('f3d-ok'); if (ok) ok.hidden = false; f.hidden = true; }
})();
