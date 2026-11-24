#!/usr/bin/env node
// Fabrique les pages ville /neuf/<slug>/ à partir de neuf/donnees/<slug>.json (format v1).
// Usage : node neuf/fabriquer.js   (depuis la racine du dépôt ou d'ailleurs)
'use strict';
const fs = require('fs');
const path = require('path');

const ICI = __dirname;
const SITE = 'https://www.glrimmobilier.com';
// Où mène le bouton « Recevoir les plans et les prix » tant que l'espace client n'existe pas.
// Interrupteurs en attendant l'arbitrage d'Alex : false = le chiffre n'apparaît nulle part sur les pages.
const AFFICHER = { prixAPartirDe: true, prixM2: true };
const CONTACT = { tel: '+33614550273', telAffiche: '06 14 55 02 73', mail: 'agl@glrimmobilier.com' };

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = n => n == null ? '' : Number(n).toLocaleString('fr-FR').replace(/ /g, ' ');
const euros = n => n == null ? '' : nb(Math.round(n)) + ' €';
const pluriel = (n, un, plus) => n + ' ' + (n > 1 ? plus : un);
const dateFr = iso => { const [a, m, j] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); };

function verifier(d, fichier) {
  const manque = ['version', 'slug', 'ville', 'cp', 'dept', 'maj', 'chiffres', 'programmes'].filter(k => d[k] == null);
  if (manque.length) throw new Error(fichier + ' : champs manquants ' + manque.join(', '));
  if (d.version !== 1) throw new Error(fichier + ' : version ' + d.version + ' inconnue');
  if (!/^[a-z0-9-]+$/.test(d.slug)) throw new Error(fichier + ' : slug invalide');
  const interdits = ['prix_lot', 'lots', 'commission', 'commission_pct', 'extranet', 'lat', 'lng'];
  const vus = JSON.stringify(d).match(new RegExp('"(' + interdits.join('|') + ')"', 'g'));
  if (vus) throw new Error(fichier + ' : champs interdits sur une page publique ' + [...new Set(vus)].join(', '));
}

const CSS = `
:root{color-scheme:light;--bleu:#005875;--laiton:#B0894C;--laiton-texte:#8A6A2F;--fond:#F4F0E8;--carte:#FBF8F1;--texte:#161A1E;--discret:#616B75;--trait:#D8D2C5;--teinte:#DCE7EC;
  --display:"Bodoni Moda","Didot","Times New Roman",serif;--body:"Archivo","Helvetica Neue",Arial,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--fond);color:var(--texte);font-family:var(--body);font-size:16px;line-height:1.6}
a{color:var(--bleu)}
.test{background:#FFF3CD;color:#5C4400;text-align:center;font-size:.85rem;padding:6px 16px;border-bottom:1px solid #E8D48A}
header{padding:18px 16px;border-bottom:1px solid var(--trait);display:flex;align-items:center;justify-content:space-between;gap:12px}
header img{display:block;height:48px;width:auto}
header .tel{font-size:.9rem;font-weight:600;text-decoration:none;white-space:nowrap}
main{max-width:1040px;margin:0 auto;padding:28px 16px 56px}
.fil{font-size:.82rem;color:var(--discret);margin:0 0 14px}
.fil a{color:var(--discret)}
h1{font-family:var(--display);font-weight:400;font-size:clamp(1.9rem,6vw,2.8rem);line-height:1.12;margin:0 0 .5rem}
.chapo{color:var(--discret);margin:0 0 1.4rem;max-width:720px}
.filet{width:56px;height:2px;background:var(--laiton);margin:0 0 1.2rem;border:0}
h2{font-family:var(--display);font-weight:500;font-size:1.45rem;margin:2.2rem 0 .9rem}
.chiffres{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:0 0 1rem}
.chiffre{background:var(--carte);border:1px solid var(--trait);border-radius:8px;padding:14px}
.chiffre b{display:block;font-family:var(--display);font-weight:500;font-size:1.7rem;color:var(--bleu);line-height:1.1}
.chiffre span{font-size:.85rem;color:var(--discret)}
.deux{display:grid;gap:12px}
.bloc{background:var(--carte);border:1px solid var(--trait);border-radius:8px;padding:16px}
.bloc h3{font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:var(--laiton-texte);margin:0 0 .7rem;font-weight:600}
.barre{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:8px;font-size:.9rem;margin:6px 0}
.barre i{display:block;height:10px;border-radius:5px;background:var(--teinte);overflow:hidden}
.barre i s{display:block;height:100%;background:var(--bleu);text-decoration:none}
.barre em{font-style:normal;text-align:right;color:var(--discret)}
.guide p{margin:0 0 .8rem}
.guide ul{margin:0 0 .8rem;padding-left:1.1rem}
.filtres{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.filtres button{font:inherit;font-size:.9rem;padding:8px 14px;border-radius:20px;border:1px solid var(--trait);background:var(--carte);color:var(--texte);cursor:pointer}
.filtres button[aria-pressed=true]{background:var(--bleu);border-color:var(--bleu);color:#fff}
.liste{display:grid;gap:12px}
.prog{background:var(--carte);border:1px solid var(--trait);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:8px}
.prog h3{font-family:var(--display);font-weight:500;font-size:1.25rem;margin:0;line-height:1.2}
.prog .qui{font-size:.88rem;color:var(--discret);margin:0}
.prog dl{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:0;font-size:.92rem}
.prog dt{color:var(--discret)}
.prog dd{margin:0}
.puces{display:flex;flex-wrap:wrap;gap:6px}
.puce{font-size:.8rem;padding:3px 9px;border-radius:12px;background:var(--teinte);color:var(--bleu);font-weight:600}
.puce.laiton{background:transparent;border:1px solid var(--laiton);color:var(--laiton-texte)}
.prog .bas{margin-top:auto;display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding-top:8px;border-top:1px solid var(--trait)}
.prog .prix{font-weight:600}
.prog .prix small{display:block;font-weight:400;font-size:.78rem;color:var(--discret)}
.prog .dispo{font-size:.88rem;color:var(--bleu);font-weight:600;white-space:nowrap}
.vide{display:none;color:var(--discret);padding:12px 0}
.appel{background:var(--bleu);color:#fff;border-radius:10px;padding:22px 18px;margin:2.4rem 0 0}
.appel h2{color:#fff;margin:0 0 .5rem}
.appel p{margin:0 0 1rem;color:var(--teinte)}
.appel .boutons{display:flex;flex-wrap:wrap;gap:10px}
.appel a{display:inline-block;padding:12px 18px;border-radius:6px;font-weight:600;text-decoration:none}
.appel a.plein{background:#fff;color:var(--bleu)}
.appel a.creux{border:1px solid #fff;color:#fff}
.note{font-size:.8rem;color:var(--discret);margin:1.2rem 0 0}
footer{border-top:1px solid var(--trait);padding:22px 16px;text-align:center;font-size:.85rem;color:var(--discret)}
footer a{color:var(--discret)}
.villes{display:grid;gap:12px}
.villes a{display:block;background:var(--carte);border:1px solid var(--trait);border-radius:8px;padding:16px;text-decoration:none;color:var(--texte)}
.villes a b{font-family:var(--display);font-weight:500;font-size:1.3rem;color:var(--bleu)}
.villes a span{display:block;color:var(--discret);font-size:.9rem}
@media (min-width:700px){.chiffres{grid-template-columns:repeat(4,1fr)}.deux{grid-template-columns:1fr 1fr}.liste,.villes{grid-template-columns:1fr 1fr}}
@media (min-width:1000px){.liste{grid-template-columns:1fr 1fr 1fr}}
`;

function tete({ titre, description, url, test }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titre)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
${test ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<meta property="og:title" content="${esc(titre)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE}/logo-glr.png">
<link rel="icon" type="image/png" href="/logo-glr.png">
<meta name="theme-color" content="#F4F0E8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;6..96,500&family=Archivo:wght@400;500;600&display=swap">
<style>${CSS}</style>
</head>
<body>
${test ? '<div class="test">Page d’essai — données fictives, non publiée</div>\n' : ''}<header><a href="/" aria-label="GLR Immobilier — accueil"><img src="/logo-glr.png" alt="GLR Immobilier" width="85" height="68"></a><a class="tel" href="tel:${CONTACT.tel}">${CONTACT.telAffiche}</a></header>`;
}

const pied = `<footer>GLR Immobilier — logements neufs en Île-de-France · <a href="/">Accueil</a> · <a href="/mentions-legales/">Mentions légales</a></footer>`;

function barres(obj, total) {
  const max = Math.max(1, ...Object.values(obj));
  return Object.entries(obj).map(([k, v]) =>
    `<div class="barre"><span>${esc(k)}</span><i><s style="width:${Math.round(v / max * 100)}%"></s></i><em>${nb(v)}</em></div>`).join('');
}

function carteProgramme(p) {
  const lignes = [];
  if (p.livraison) lignes.push(['Livraison', p.livraison]);
  if (p.quartier) lignes.push(['Quartier', p.quartier]);
  if (p.gare) lignes.push(['Transport', p.gare + (p.gare_minutes_a_pied ? ' · ' + p.gare_minutes_a_pied + ' min à pied' : '')]);
  const typos = (p.typologies || []).map(t => `<span class="puce">${esc(t)}</span>`).join('');
  const disp = (p.dispositifs || []).filter(x => !/LLI|LMNP/i.test(x)).map(t => `<span class="puce laiton">${esc(t)}</span>`).join('');
  // Programme sans mandat (« Oui, c'est ça », Alex, 24/11/2026) ; libellé à lui montrer avant mise en ligne.
  const picking = p.picking ? '<span class="puce laiton" title="Programme proposé sans mandat de commercialisation">Picking</span>' : '';
  const nom = p.page_programme ? `<a href="${esc(p.page_programme)}">${esc(p.nom)}</a>` : esc(p.nom);
  return `<article class="prog" data-typos="${esc((p.typologies || []).join(' '))}">
  <h3>${nom}</h3>
  <p class="qui">${esc(p.promoteur)}</p>
  ${lignes.length ? '<dl>' + lignes.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('') + '</dl>' : ''}
  ${typos || disp || picking ? `<div class="puces">${typos}${disp}${picking}</div>` : ''}
  <div class="bas"><span class="prix">${AFFICHER.prixAPartirDe && p.prix_a_partir_de != null ? '<small>à partir de</small>' + euros(p.prix_a_partir_de) : '<small>prix</small>sur demande'}</span><span class="dispo">${pluriel(p.nb_lots_libres, 'logement disponible', 'logements disponibles')}</span></div>
</article>`;
}

function pageVille(d) {
  const c = d.chiffres, g = d.guide || {};
  const url = `${SITE}/neuf/${d.slug}/`;
  const titre = `Immobilier neuf à ${d.ville} (${d.cp}) : ${c.nb_programmes} programmes | GLR Immobilier`;
  const description = `${c.nb_programmes} programmes neufs et ${nb(c.nb_lots_libres)} logements disponibles à ${d.ville}` +
    (AFFICHER.prixM2 && c.prix_m2_moyen ? `, ${euros(c.prix_m2_moyen)}/m² en moyenne` : '') + `. Plans et prix de tous les promoteurs, mis à jour à chaque pige par GLR Immobilier.`;
  const typosFiltre = ['T1', 'T2', 'T3', 'T4', 'T5+'].filter(t => d.programmes.some(p => (p.typologies || []).includes(t)));
  const progs = [...d.programmes].sort((a, b) => (a.livraison_cle || '').localeCompare(b.livraison_cle || '') || b.nb_lots_libres - a.nb_lots_libres);
  const ld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Immobilier neuf', item: SITE + '/neuf/' },
      { '@type': 'ListItem', position: 3, name: d.ville, item: url }]
  };
  return `${tete({ titre, description, url, test: d.test })}
<main>
  <p class="fil"><a href="/">Accueil</a> › <a href="/neuf/">Immobilier neuf</a> › ${esc(d.ville)}</p>
  <h1>Immobilier neuf à ${esc(d.ville)}</h1>
  <hr class="filet">
  <p class="chapo">${pluriel(c.nb_programmes, 'programme', 'programmes')} de ${pluriel(c.nb_promoteurs, 'promoteur', 'promoteurs')} et ${nb(c.nb_lots_libres)} logements disponibles à ${esc(d.ville)} (${esc(d.cp)}). Nous suivons tous les programmes neufs de la ville et vous envoyons les plans et les prix de ceux qui vous correspondent. Mis à jour le ${dateFr(d.maj)}.</p>

  <div class="chiffres">
    <div class="chiffre"><b>${nb(c.nb_programmes)}</b><span>programmes en vente</span></div>
    <div class="chiffre"><b>${nb(c.nb_lots_libres)}</b><span>logements disponibles</span></div>
    ${AFFICHER.prixM2 ? `<div class="chiffre"><b>${c.prix_m2_moyen ? euros(c.prix_m2_moyen) : '—'}</b><span>prix moyen au m²</span></div>` : `<div class="chiffre"><b>${nb(c.nb_promoteurs)}</b><span>promoteurs</span></div>`}
    ${AFFICHER.prixAPartirDe ? `<div class="chiffre"><b>${c.prix_entree ? euros(c.prix_entree) : '—'}</b><span>premier prix</span></div>` : `<div class="chiffre"><b>${nb(Object.keys(c.livraisons || {}).length)}</b><span>années de livraison</span></div>`}
  </div>

  <div class="deux">
    ${c.typologies ? `<div class="bloc"><h3>Logements disponibles par taille</h3>${barres(c.typologies)}</div>` : ''}
    ${c.livraisons ? `<div class="bloc"><h3>Programmes par année de livraison</h3>${barres(c.livraisons)}</div>` : ''}
  </div>

  ${g.intro || (g.transports && g.transports.length) || g.zone_ptz || g.tva_reduite ? `<h2>Acheter dans le neuf à ${esc(d.ville)}</h2>
  <div class="bloc guide">
    ${g.intro ? `<p>${esc(g.intro)}</p>` : ''}
    ${g.transports && g.transports.length ? `<h3>Transports</h3><ul>${g.transports.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    ${g.zone_ptz ? `<p>${esc(d.ville)} est en zone ${esc(g.zone_ptz)} pour le prêt à taux zéro.</p>` : ''}
    ${g.tva_reduite ? `<p>Certains programmes sont éligibles à la TVA réduite à 5,5 %, sous conditions de ressources.</p>` : ''}
  </div>` : ''}

  <h2>Les programmes neufs à ${esc(d.ville)}</h2>
  ${typosFiltre.length > 1 ? `<div class="filtres" role="group" aria-label="Filtrer par taille"><button type="button" aria-pressed="true" data-t="">Tous</button>${typosFiltre.map(t => `<button type="button" aria-pressed="false" data-t="${t}">${t}</button>`).join('')}</div>` : ''}
  <div class="liste">
${progs.map(carteProgramme).join('\n')}
  </div>
  <p class="vide">Aucun programme avec cette taille de logement en ce moment.</p>

  <section class="appel" id="contact">
    <h2>Recevoir les plans et les prix</h2>
    <p>Dites-nous ce que vous cherchez à ${esc(d.ville)} : nous vous envoyons la grille complète des logements qui vous correspondent, tous promoteurs confondus. Le service est gratuit pour vous.</p>
    <div class="boutons"><a class="plein" href="tel:${CONTACT.tel}">Appeler le ${CONTACT.telAffiche}</a><a class="creux" href="mailto:${CONTACT.mail}?subject=${encodeURIComponent('Plans et prix à ' + d.ville)}">Écrire un e-mail</a></div>
  </section>
  <p class="note">Disponibilités relevées le ${dateFr(d.maj)} ; elles changent chaque semaine et sont confirmées par votre conseiller.</p>
</main>
${pied}
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script>
(function(){var bs=document.querySelectorAll('.filtres button'),cs=document.querySelectorAll('.prog'),v=document.querySelector('.vide');
bs.forEach(function(b){b.addEventListener('click',function(){var t=b.getAttribute('data-t'),n=0;
bs.forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});
cs.forEach(function(c){var ok=!t||(' '+c.getAttribute('data-typos')+' ').indexOf(' '+t+' ')>-1;c.style.display=ok?'':'none';if(ok)n++});
v.style.display=n?'none':'block';});});})();
</script>
</body>
</html>
`;
}

function pageIndex(villes) {
  const test = villes.some(d => d.test);
  const url = SITE + '/neuf/';
  return `${tete({ titre: 'Immobilier neuf en Île-de-France, ville par ville | GLR Immobilier', description: 'Tous les programmes neufs, ville par ville : nombre de logements disponibles, prix moyen au m², livraisons. Plans et prix envoyés gratuitement par GLR Immobilier.', url, test })}
<main>
  <p class="fil"><a href="/">Accueil</a> › Immobilier neuf</p>
  <h1>Immobilier neuf, ville par ville</h1>
  <hr class="filet">
  <p class="chapo">Nous suivons tous les programmes neufs de ces villes et vous envoyons les plans et les prix de ceux qui vous correspondent.</p>
  <div class="villes">
${villes.map(d => `    <a href="/neuf/${d.slug}/"><b>${esc(d.ville)}</b><span>${pluriel(d.chiffres.nb_programmes, 'programme', 'programmes')} · ${nb(d.chiffres.nb_lots_libres)} logements disponibles${AFFICHER.prixM2 && d.chiffres.prix_m2_moyen ? ' · ' + euros(d.chiffres.prix_m2_moyen) + '/m²' : ''}</span></a>`).join('\n')}
  </div>
</main>
${pied}
</body>
</html>
`;
}

const dossier = path.join(ICI, 'donnees');
const villes = fs.readdirSync(dossier).filter(f => f.endsWith('.json')).sort().map(f => {
  const d = JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8'));
  verifier(d, f);
  return d;
});
for (const d of villes) {
  fs.mkdirSync(path.join(ICI, d.slug), { recursive: true });
  fs.writeFileSync(path.join(ICI, d.slug, 'index.html'), pageVille(d));
}
villes.sort((a, b) => a.ville.localeCompare(b.ville, 'fr'));
fs.writeFileSync(path.join(ICI, 'index.html'), pageIndex(villes));
console.log(villes.length + ' pages ville fabriquées : ' + villes.map(d => d.slug).join(', '));
