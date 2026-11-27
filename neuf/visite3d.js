// Visite 3D d'un programme : accès par formulaire (une fois), puis le fichier est demandé à la fonction plans-3d
// (lien temporaire de 5 minutes), téléchargé, et ouvert dans un cadre par un blob. Aucun plan n'est dans ce dépôt public.
(function () {
  var FN = 'https://hydqfbxdtpmbuooexekp.supabase.co/functions/v1/plans-3d';
  var CLE = 'glr3d_jeton';
  var racine = document.getElementById('compte'), zone = document.getElementById('visite3d');
  if (!racine || !zone) return;
  var cadre = zone.querySelector('iframe'), etat = zone.querySelector('.etat3d');
  var prog = zone.getAttribute('data-p'), clesOk = (zone.getAttribute('data-lots') || '').split(',');
  // Immeuble : appel sans le paramètre l ; logement : l = clé du lot (contrat de la fonction plans-3d, vérifié par CRM le 27/11/2026).
  var lienBlob = null, lotOuvert = null, attente = null;
  function lireJeton() { try { return localStorage.getItem(CLE) || ''; } catch (e) { return ''; } }
  function ecrireJeton(j) { try { if (j) localStorage.setItem(CLE, j); else localStorage.removeItem(CLE); } catch (e) {} }
  function libere() { if (lienBlob) { URL.revokeObjectURL(lienBlob); lienBlob = null; } cadre.removeAttribute('src'); }
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
    var sc = document.createElement('script'); sc.src = '/neuf/programme.js'; document.body.appendChild(sc);
  }
  // L'immeuble s'ouvre SANS formulaire (et sans jeton s'il n'y en a pas) ; le formulaire n'est demandé que pour un logement.
  function ouvrir(lot, sansDefiler) {
    var jeton = lireJeton(), immeuble = lot === 'immeuble';
    if (!immeuble && !jeton) { attente = lot; versFormulaire('Pour voir ce logement, créez votre accès : cela prend une minute.'); return; }
    if (immeuble && lotOuvert === 'immeuble' && cadre.getAttribute('src')) { if (!sansDefiler) zone.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    var vz = zone.closest('.vue3d'); if (vz) vz.hidden = false; // le cadre peut avoir été masqué par le repli : un logement demandé doit toujours se voir
    libere(); lotOuvert = lot; zone.classList.remove('charge');
    message('Chargement de la visite 3D\u2026 (un peu long sur mobile)');
    if (!sansDefiler) zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var adresse = FN + '?p=' + encodeURIComponent(prog) + (immeuble ? '' : '&l=' + encodeURIComponent(lot)) + (jeton ? '&t=' + encodeURIComponent(jeton) : '');
    fetch(adresse, { headers: { accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) {
          if (jeton) { ecrireJeton(''); lotOuvert = null; if (immeuble) { ouvrir('immeuble', sansDefiler); return null; } attente = lot; message(''); versFormulaire('Votre accès a expiré : recréez-le en une minute.'); return null; }
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
  // L'immeuble (1,4 Mo) n'est chargé que lorsqu'il arrive à l'écran, ou au toucher du bouton : jamais à l'ouverture de la page.
  if ('IntersectionObserver' in window) {
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
  // Le cadre dit quel logement on a touché (ou « retour à l'immeuble ») ; on n'écoute que notre cadre, et que des clés connues.
  window.addEventListener('message', function (ev) {
    if (ev.source !== cadre.contentWindow || !ev.data || typeof ev.data !== 'object') return;
    if (ev.data.glr3d === 'immeuble') { lotOuvert = null; ouvrir('immeuble', true); }
    else if (ev.data.glr3d === 'lot' && typeof ev.data.lot === 'string' && clesOk.indexOf(ev.data.lot) > -1) ouvrir(ev.data.lot);
  });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-3d]');
    if (!b) return;
    ev.preventDefault(); ouvrir(b.getAttribute('data-3d'));
  });
  // Formulaire d'accès
  var f = document.getElementById('f3d'); if (!f) return;
  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var err = document.getElementById('f3d-err'), go = f.querySelector('button[type=submit]');
    function v(n) { return (f.elements[n].value || '').trim(); }
    var d = { action: 'inscrire', prenom: v('prenom'), telephone: v('telephone'), email: v('email'), accord: f.elements.accord.checked, p: prog,
      programme: f.getAttribute('data-prog') || '', ville: f.getAttribute('data-ville') || '', societe: v('societe') };
    if (!d.prenom) { err.textContent = 'Indiquez votre prénom.'; return; }
    if (d.telephone.replace(/\D/g, '').length < 9) { err.textContent = 'Indiquez un numéro de téléphone valide.'; return; }
    if (!/^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(d.email)) { err.textContent = d.email ? 'L’adresse e-mail ne semble pas valide.' : 'Indiquez votre e-mail.'; return; }
    if (!d.accord) { err.textContent = 'Cochez la case pour que votre conseiller puisse vous recontacter.'; return; }
    err.textContent = ''; go.disabled = true; go.textContent = 'Envoi…';
    fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      .then(function (r) { if (r.status === 429) throw new Error('429'); return r.json().then(function (j) { if (!r.ok || !j || !j.jeton) throw new Error('x'); return j; }); })
      .then(function (j) {
        ecrireJeton(j.jeton); go.disabled = false; go.textContent = 'Créer mon accès';
        document.getElementById('f3d-err').textContent = '';
        document.getElementById('f3d-ok').hidden = false; f.hidden = true;
        var l = attente || 'immeuble'; attente = null; ouvrir(l); // le logement demandé s'ouvre ; sinon l'immeuble
      })
      .catch(function (e) {
        go.disabled = false; go.textContent = 'Créer mon accès';
        err.textContent = e.message === '429' ? 'Trop d’envois d’un coup : réessayez dans quelques minutes.' : 'L’envoi n’a pas marché. Réessayez, ou appelez-nous.';
      });
  });
  if (lireJeton()) { var ok = document.getElementById('f3d-ok'); if (ok) ok.hidden = false; f.hidden = true; }
})();
