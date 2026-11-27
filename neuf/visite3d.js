// Visite 3D d'un programme : accès par formulaire (une fois), puis le fichier est demandé à la fonction plans-3d
// (lien temporaire de 5 minutes), téléchargé, et ouvert dans un cadre par un blob. Aucun plan n'est dans ce dépôt public.
(function () {
  var FN = 'https://hydqfbxdtpmbuooexekp.supabase.co/functions/v1/plans-3d';
  var CLE = 'glr3d_jeton';
  var racine = document.getElementById('compte'), zone = document.getElementById('visite3d');
  if (!racine || !zone) return;
  var cadre = zone.querySelector('iframe'), etat = zone.querySelector('.etat3d'), titre = zone.querySelector('h2');
  var prog = zone.getAttribute('data-p'), clesOk = (zone.getAttribute('data-lots') || '').split(',');
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
  function fermer() { libere(); lotOuvert = null; zone.hidden = true; message(''); }
  function ouvrir(lot) {
    var jeton = lireJeton();
    if (!jeton) { attente = lot; versFormulaire('Pour voir la 3D, créez votre accès : cela prend une minute.'); return; }
    libere(); lotOuvert = lot;
    zone.hidden = false; titre.textContent = lot === 'immeuble' ? 'Visite 3D de l’immeuble' : 'Visite 3D du logement';
    message('Chargement de la visite 3D… (un peu long sur mobile)');
    zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
    fetch(FN + '?p=' + encodeURIComponent(prog) + '&l=' + encodeURIComponent(lot) + '&t=' + encodeURIComponent(jeton), { headers: { accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) { ecrireJeton(''); fermer(); attente = lot; versFormulaire('Votre accès a expiré : recréez-le en une minute.'); return null; }
        if (r.status === 404) { message('Cette visite n’est pas encore disponible.'); return null; }
        if (r.status === 429) { message('Trop de demandes d’un coup : réessayez dans quelques minutes.'); return null; }
        if (!r.ok) throw new Error('http');
        return r.json();
      })
      .then(function (j) { if (!j || !j.url) return null; return fetch(j.url); })
      .then(function (r) { if (!r) return null; if (!r.ok) throw new Error('http'); return r.blob(); })
      .then(function (b) {
        if (!b || lotOuvert !== lot) return;
        libere(); lienBlob = URL.createObjectURL(new Blob([b], { type: 'text/html' }));
        cadre.src = lienBlob; message('');
      })
      .catch(function () { if (lotOuvert === lot) message('La visite n’a pas pu se charger. Réessayez, ou appelez-nous.'); });
  }
  // Le cadre dit quel logement on a touché (ou « retour à l'immeuble ») ; on n'écoute que notre cadre, et que des clés connues.
  window.addEventListener('message', function (ev) {
    if (ev.source !== cadre.contentWindow || !ev.data || typeof ev.data !== 'object') return;
    if (ev.data.glr3d === 'immeuble') ouvrir('immeuble');
    else if (ev.data.glr3d === 'lot' && typeof ev.data.lot === 'string' && clesOk.indexOf(ev.data.lot) > -1) ouvrir(ev.data.lot);
  });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-3d]');
    if (!b) return;
    ev.preventDefault(); ouvrir(b.getAttribute('data-3d'));
  });
  zone.querySelector('.ferme3d').addEventListener('click', fermer);
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
        document.getElementById('f3d-ok').hidden = false; f.hidden = true;
        if (attente) { var l = attente; attente = null; ouvrir(l); }
      })
      .catch(function (e) {
        go.disabled = false; go.textContent = 'Créer mon accès';
        err.textContent = e.message === '429' ? 'Trop d’envois d’un coup : réessayez dans quelques minutes.' : 'L’envoi n’a pas marché. Réessayez, ou appelez-nous.';
      });
  });
  if (lireJeton()) { var ok = document.getElementById('f3d-ok'); if (ok) ok.hidden = false; f.hidden = true; }
})();
