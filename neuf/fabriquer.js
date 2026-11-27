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
const AFFICHER = { prixAPartirDe: false, prixM2: false };
// Prix des logements (décision d'Alex du 24/11/2026 : prix visibles sans compte, plans avec compte).
// Les prix ne sont JAMAIS écrits dans les pages ni dans le dépôt : la page les demande à l'ouverture
// à l'edge function ci-dessous (limite contre l'aspiration en masse). Fonction à créer par la session CRM.
// Empreinte des scripts communs : l'adresse des scripts change dès qu'un script change, donc la page et ses scripts changent toujours ensemble (cache de 10 minutes de GitHub Pages)
const VERSION_JS = require('crypto').createHash('sha1').update(['carte.js', 'immeuble3d.js', 'maquette.js', 'programme.js', 'visite3d.js'].map(n => fs.readFileSync(path.join(__dirname, n), 'utf8')).join('\n')).digest('hex').slice(0, 10);
const PRIX_URL = 'https://hydqfbxdtpmbuooexekp.supabase.co/functions/v1/neuf-prix';
const CONTACT = { tel: '+33614550273', telAffiche: '06 14 55 02 73', mail: 'agl@glrimmobilier.com' };

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = n => n == null ? '' : Number(n).toLocaleString('fr-FR').replace(/ /g, ' ');
const euros = n => n == null ? '' : nb(Math.round(n)) + ' €';
// « Livré » : programme dont la date de livraison est passée (la base écrit « Livré » à la place de la date).
const dejaLivre = p => /^livr/i.test(String(p.livraison || ''));
// « à pied de Le Stade » → « à pied du Stade », « des Agnettes », « de l'Hôtel de Ville », « de Quatre Routes »
const deGare = g => String(g).replace(/^Le\s+/, 'du ').replace(/^Les\s+/, 'des ').replace(/^L['’]/, "de l'").replace(/^(?!du |des |de l')/, 'de ');
const pluriel = (n, un, plus) => n + ' ' + (n > 1 ? plus : un);
const dateFr = iso => { const [a, m, j] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); };

function verifier(d, fichier) {
  const manque = ['version', 'slug', 'ville', 'cp', 'dept', 'maj', 'chiffres', 'programmes'].filter(k => d[k] == null);
  if (manque.length) throw new Error(fichier + ' : champs manquants ' + manque.join(', '));
  if (d.version !== 1) throw new Error(fichier + ' : version ' + d.version + ' inconnue');
  if (!/^[a-z0-9-]+$/.test(d.slug)) throw new Error(fichier + ' : slug invalide');
  // Rien de confidentiel sur une page publique (dépôt public) : ni prix de lot, ni plan, ni commission (décision d'Alex du 24/11/2026 : listing sans prix, plans avec compte).
  const interdits = ['prix', 'prix_lot', 'lots', 'plan', 'plans', 'plan_url', 'commission', 'commission_pct', 'extranet', 'lat', 'lng'];
  const vus = JSON.stringify(d).match(new RegExp('"(' + interdits.join('|') + ')"', 'g'));
  if (vus) throw new Error(fichier + ' : champs interdits sur une page publique ' + [...new Set(vus)].join(', '));
  const permis = ['id', 'typo', 'pieces', 'surface', 'etage', 'exterieur', 'statut', 'v3d', 'p2d'];
  for (const p of d.programmes) {
    if (!/^[a-z0-9-]+$/.test(p.slug || '')) throw new Error(fichier + ' : slug de programme invalide ' + p.slug);
    // Clés publiques seulement (substr(md5('glr-neuf:' || id), 1, 12)) : jamais l'identifiant interne de la pige
    const cle = x => /^[0-9a-f]{12}$/.test(String(x));
    if (!d.test && p.pige_id != null && !cle(p.pige_id)) throw new Error(fichier + ' : ' + p.slug + ' : pige_id doit être la clé publique de 12 caractères');
    if (!d.test && (p.logements || []).some(l => l.id != null && !cle(l.id))) throw new Error(fichier + ' : ' + p.slug + ' : id de logement doit être la clé publique de 12 caractères');
    for (const l of p.logements || []) {
      if (l.statut != null && !['libre', 'option'].includes(l.statut)) throw new Error(fichier + ' : ' + p.slug + ' : statut de logement inconnu ' + l.statut);
      if (l.p2d != null && l.p2d !== true) throw new Error(fichier + ' : ' + p.slug + ' : p2d doit valoir true ou être absent');
      if (l.v3d != null && l.v3d !== true) throw new Error(fichier + ' : ' + p.slug + ' : v3d doit valoir true ou être absent');
      const en_trop = Object.keys(l).filter(k => !permis.includes(k));
      if (en_trop.length) throw new Error(fichier + ' : ' + p.slug + ' : champs de logement non permis ' + en_trop.join(', '));
    }
  }
}

const CSS = `
/* Fondu enchaîné entre deux pages du site (de la carte à l'immeuble) : pas d'écran vide */
@view-transition{navigation:auto}
::view-transition-old(root),::view-transition-new(root){animation-duration:.7s;animation-timing-function:ease-in-out}
/* le cadre de la carte se transforme en cadre de l'immeuble (même élément d'une page à l'autre) */
#carte,#imm3d{view-transition-name:scene}
::view-transition-group(scene){animation-duration:.8s;animation-timing-function:cubic-bezier(.4,0,.2,1)}
::view-transition-old(scene),::view-transition-new(scene){animation-duration:.8s;height:100%;object-fit:cover}
@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}}

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
h2{font-family:var(--display);font-weight:500;font-size:1.45rem;margin:2.2rem 0 .9rem;scroll-margin-top:12px}
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
.immeuble3d{position:relative;min-height:260px;background:var(--carte);border:1px solid var(--trait);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center}
.immeuble3d iframe{display:block;width:100%;height:min(78vh,720px);border:0;background:var(--carte)}
.immeuble3d iframe:not([src]){display:none}
.immeuble3d .etat3d{margin:0 0 12px;padding:0 14px;text-align:center;color:var(--discret)}
.immeuble3d .charger3d{margin:10px 0;border:0;background:var(--bleu);color:#fff;border-radius:6px;padding:12px 18px;font:inherit;font-weight:600;cursor:pointer}
.immeuble3d.charge .charger3d,.immeuble3d.charge .etat3d{display:none}
[hidden]{display:none!important}
.onglets3d{display:flex;gap:8px;padding:10px;width:100%;box-sizing:border-box}
.onglets3d button{border:1px solid var(--bleu);background:#fff;color:var(--bleu);border-radius:6px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer}
.onglets3d button[aria-pressed=true]{background:var(--bleu);color:#fff}
.planbox{width:100%;max-height:78vh;overflow:auto;-webkit-overflow-scrolling:touch;background:#fff;text-align:center;padding:8px;box-sizing:border-box}
.pagesplan{display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;margin:0 0 8px}
.pagesplan button{border:1px solid var(--bleu);background:#fff;color:var(--bleu);border-radius:6px;padding:8px 12px;font:inherit;font-weight:600;cursor:pointer}
.pagesplan button:disabled{opacity:.4;cursor:default}
.planbox img{display:block;width:100%;height:auto;margin:0 auto}
.planbox img:not([src]){display:none}
.planbox .ouvrir-plan{display:inline-block;margin:14px;padding:12px 18px;border-radius:6px;background:var(--bleu);color:#fff;font-weight:600;text-decoration:none}
.immeuble3d.plan-seul{margin:1.2rem 0;padding:10px}
.immeuble3d .ferme3d{margin:10px 0;border:1px solid var(--bleu);background:#fff;color:var(--bleu);border-radius:6px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer}
button.bouton-plein{border:0;font:inherit;font-weight:600;cursor:pointer}
.lien-visite{display:inline-block;margin-left:0;padding:4px 10px;border:1px solid var(--bleu);border-radius:6px;background:#fff;color:var(--bleu);font:inherit;font-size:.85rem;font-weight:600;cursor:pointer}
@media(max-width:560px){.lien-visite{display:block;margin:6px 0 0;white-space:nowrap}table.lots td.plan{white-space:normal}}
.visite3d{margin:1.4rem 0;background:var(--carte);border:1px solid var(--trait);border-radius:10px;padding:14px}
.visite3d[hidden]{display:none}
.visite3d .entete3d{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}
.visite3d h2{margin:0;font-size:1.2rem}
.visite3d .ferme3d{border:1px solid var(--bleu);background:#fff;color:var(--bleu);border-radius:6px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer}
.visite3d .etat3d{margin:0 0 10px;color:var(--discret)}
.visite3d iframe{display:block;width:100%;height:min(78vh,720px);border:1px solid var(--trait);border-radius:8px;background:#fff}
.form3d[hidden],.ok3d[hidden]{display:none}
.ok3d button.plein{border:0;background:#fff;color:var(--bleu);border-radius:6px;padding:12px 18px;font:inherit;font-weight:600;cursor:pointer;margin-bottom:1rem}
.form3d{display:grid;gap:10px;margin:0 0 1rem;max-width:460px}
.form3d label{display:grid;gap:4px;color:#fff;font-weight:600}
.form3d input:not([type=checkbox]){padding:11px 12px;border:0;border-radius:6px;font:inherit;color:#161A1E;background:#fff}
.form3d .accord{display:flex;gap:10px;align-items:flex-start;font-weight:400;color:var(--teinte)}
.form3d .accord input{margin-top:4px;flex:none}
.form3d .erreur3d{margin:0;color:#fff;font-weight:600;min-height:1.2em}
.form3d button.plein{justify-self:start;background:#fff;color:var(--bleu);border:0;border-radius:6px;padding:12px 18px;font:inherit;font-weight:600;cursor:pointer}
.carte{height:420px;border-radius:8px;border:1px solid var(--trait);margin:0 0 .6rem;z-index:0}
.carte-zone{position:relative}
.maplibregl-map{font-family:var(--body);border-radius:8px}
.maplibregl-ctrl-attrib{font-size:10px;background:rgba(251,248,241,.85)!important}
button.repere{padding:0;cursor:pointer;display:block}
button.repere.approx{background:#fff;border:3px dashed var(--bleu);box-sizing:border-box}
button.repere.approx.picking{border-color:var(--laiton)}
.fil-carte{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:.5rem 0 0;font-size:.92rem;color:var(--discret);min-height:2.2em}
.boutons-carte{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.fil-carte b{color:var(--bleu);font-weight:600}
.fil-carte button{font:inherit;font-size:.85rem;background:transparent;border:1px solid var(--trait);border-radius:6px;padding:6px 10px;color:var(--texte);cursor:pointer;white-space:nowrap}
.etiquette-prog{background:#005875;color:#fff;font-family:var(--display);font-size:1rem;font-weight:500;padding:5px 12px;border-radius:6px;white-space:nowrap;box-shadow:0 3px 10px rgba(22,26,30,.25);animation:nait .5s cubic-bezier(.3,1.5,.5,1) 1.8s both;pointer-events:none}
.etiquette-prog::after{content:"";position:absolute;left:50%;top:100%;margin-left:-6px;border:6px solid transparent;border-top-color:#005875}
.num-dep{font-family:var(--body);font-weight:600;font-size:1.05rem;color:#6E7884;text-shadow:0 0 4px #fff,0 0 8px #fff;pointer-events:none}
button.repere.pop{animation:pop .55s cubic-bezier(.3,1.6,.5,1) both}
button.repere{overflow:visible} /* surtout pas de position ici : la carte place elle-même chaque repère */
button.repere.nait{animation:nait .7s cubic-bezier(.3,1.5,.5,1) .25s both}
button.repere.nait::after{content:"";position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid currentColor;color:var(--bleu);animation:onde 1.1s ease-out both;pointer-events:none}
button.repere.picking.nait::after{color:var(--laiton)}
@keyframes nait{from{scale:0;opacity:0}to{scale:1;opacity:1}}
@keyframes onde{from{scale:.4;opacity:.9}to{scale:4.5;opacity:0}}
.lieu{width:30px;height:30px;border-radius:50%;background:#fff;border:2px solid var(--trait);display:grid;place-items:center;box-shadow:0 2px 6px rgba(22,26,30,.2);animation:nait .5s cubic-bezier(.3,1.5,.5,1) both}
.lieu svg{width:17px;height:17px}
.lieu.petit{width:22px;height:22px;border-width:1.5px;box-shadow:0 1px 3px rgba(22,26,30,.18)}.lieu.petit svg{width:12px;height:12px}
.lieu .nom{position:absolute;left:100%;top:50%;translate:5px -50%;white-space:nowrap;font-family:var(--body);font-size:.72rem;font-weight:600;color:#005875;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 5px #fff;pointer-events:none}
.lieu.transport{color:#005875;border-color:#005875}.lieu.ecole{color:#8A6A2F;border-color:#B0894C}.lieu.commerce{color:#616B75;border-color:#9AA3AC}
.proches{list-style:none;margin:2px 0;padding:0;display:flex;flex-direction:column;gap:5px;font-size:.86rem;color:var(--texte)}
.proches li{line-height:1.45}.proches small{color:var(--discret)}
.lieu-mini{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;border:1.5px solid currentColor;margin-right:6px;vertical-align:-5px}
.lieu-mini svg{width:12px;height:12px}.lieu-mini.transport{color:#005875}.lieu-mini.ecole{color:#8A6A2F}.lieu-mini.commerce{color:#616B75}
@keyframes pop{from{scale:0;opacity:0}to{scale:1;opacity:1}}
button.repere:hover{scale:1.25;transition:scale .15s}
.panneau{position:static;margin:.6rem 0 0;background:var(--carte);border:1px solid var(--trait);border-top:3px solid var(--laiton);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.panneau[hidden]{display:none}
.panneau .titre{font-family:var(--display);font-weight:500;font-size:1.25rem;color:var(--bleu)}
.panneau .sous{font-size:.88rem;color:var(--discret)}
.panneau .heure{display:flex;align-items:center;gap:8px;font-size:.85rem;color:var(--discret)}
.panneau .heure input{flex:1;accent-color:#B0894C}
.panneau .heure output{min-width:70px;text-align:right;color:var(--laiton-texte);font-weight:600}
.panneau .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}
.panneau a.voir{background:var(--bleu);color:#fff;padding:9px 14px;border-radius:6px;font-weight:600;text-decoration:none;font-size:.92rem}
.panneau button{font:inherit;font-size:.9rem;background:transparent;border:1px solid var(--trait);border-radius:6px;padding:8px 12px;color:var(--texte);cursor:pointer}
.recherche{position:relative;margin:0 0 14px}
.recherche label{display:block;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:var(--laiton-texte);font-weight:600;margin:0 0 6px}
.recherche input{width:100%;font:inherit;font-size:1.05rem;padding:13px 14px;border:1px solid var(--trait);border-radius:8px;background:#fff;color:var(--texte)}
.recherche input:focus{outline:2px solid var(--bleu);outline-offset:1px;border-color:var(--bleu)}
.propositions{position:absolute;left:0;right:0;top:100%;margin:4px 0 0;padding:4px;list-style:none;background:#fff;border:1px solid var(--trait);border-radius:8px;box-shadow:0 6px 18px rgba(22,26,30,.12);z-index:1000;display:none}
.propositions li{padding:10px 12px;border-radius:6px;cursor:pointer}
.propositions li small{color:var(--discret);margin-left:6px}
.propositions li[aria-selected=true],.propositions li:hover{background:var(--teinte)}
.carte.grande{height:520px}
@media (max-width:600px){.carte{height:460px}.carte.grande{height:480px}}
.resume{display:none;background:var(--carte);border:1px solid var(--trait);border-left:3px solid var(--laiton);border-radius:8px;padding:14px 16px;margin:0 0 1rem}
.resume b{font-family:var(--display);font-weight:500;font-size:1.35rem;color:var(--bleu)}
.resume p{margin:.3rem 0 .7rem;color:var(--discret)}
.resume a.bouton{display:inline-block;background:var(--bleu);color:#fff;padding:10px 16px;border-radius:6px;font-weight:600;text-decoration:none}
.resume.absente{border-left-color:var(--trait)}
.legende{display:flex;flex-wrap:wrap;gap:14px;font-size:.82rem;color:var(--discret);margin:0 0 1rem}
.legende i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:middle}
.repere{width:18px;height:18px;border-radius:50%;background:var(--bleu);border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}
.repere.picking{background:var(--laiton)}
.leaflet-popup-content{font-family:var(--body);font-size:.9rem;line-height:1.45}
.leaflet-popup-content b{font-family:var(--display);font-weight:500;font-size:1.05rem}
.leaflet-popup-content a.voir{display:inline-block;margin-top:6px;font-weight:600}
.typo{margin:0 0 1.4rem}
.typo h3{font-family:var(--display);font-weight:500;font-size:1.2rem;margin:0 0 .5rem}
table.lots{width:100%;border-collapse:collapse;background:var(--carte);border:1px solid var(--trait);border-radius:8px;overflow:hidden;font-size:.92rem}
table.lots th{text-align:left;font-weight:600;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:var(--laiton-texte);padding:9px 10px;border-bottom:1px solid var(--trait)}
table.lots td{padding:9px 10px;border-bottom:1px solid var(--trait)}
table.lots tr:last-child td{border-bottom:0}
table.lots td.plan{text-align:right;white-space:nowrap}
table.lots td.plan a{font-weight:600;text-decoration:none}
table.lots td.prix-lot{font-weight:600;white-space:nowrap}
table.lots td.prix-lot .tva{font-weight:600;color:var(--bleu)}
table.lots td.prix-lot small{font-weight:400;font-size:.72rem;color:var(--discret)}
@media (max-width:480px){table.lots{font-size:.86rem}table.lots th,table.lots td{padding:8px 5px}table.lots .long{display:none}table.lots th{font-size:.7rem;letter-spacing:.02em}}
@media (min-width:960px) and (max-width:1200px){table.lots{font-size:.86rem}table.lots th,table.lots td{padding:8px 6px}table.lots .long{display:none}table.lots th{font-size:.7rem;letter-spacing:.02em}}
.immeuble .scene{position:relative;background:linear-gradient(#FBF8F1,#F4F0E8);border:1px solid var(--trait);border-radius:8px;padding:8px;margin:0 0 .4rem;overflow:hidden}
.immeuble svg{display:block;width:100%;height:auto;max-height:520px}
.immeuble .lot{cursor:pointer;transition:opacity .2s}
.immeuble .lot.eteint{opacity:.18}
.immeuble .lot.actif polygon{stroke:#B0894C;stroke-width:2.5}
.fiche-lot{background:var(--carte);border:1px solid var(--trait);border-left:3px solid var(--laiton);border-radius:8px;padding:10px 14px;margin:.6rem 0 0;font-size:.92rem;color:var(--discret);min-height:3.2em}
.fiche-lot b{color:var(--bleu)}
.bulle{position:absolute;min-width:150px;background:#fff;border:1px solid var(--trait);border-top:3px solid var(--laiton);border-radius:6px;padding:8px 10px;font-size:.88rem;line-height:1.4;box-shadow:0 6px 18px rgba(22,26,30,.15);pointer-events:none}
.bulle b{color:var(--bleu)}
.bulle a{pointer-events:auto;font-weight:600}
tr.vise td{background:var(--teinte)}
.legende-typo{display:flex;flex-wrap:wrap;gap:12px;font-size:.8rem;color:var(--discret);margin:0 0 .4rem}
.legende-typo i{display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:5px;vertical-align:middle}
.page-prog{max-width:1240px}
.hero{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin:0 0 1.2rem}
.hero .sur{font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:var(--laiton-texte);font-weight:600;margin:0 0 .5rem}
.hero .chapo{margin:0 0 .9rem}
.hero-actions{display:flex;gap:8px;flex-wrap:wrap}
.bouton-plein{background:var(--bleu);color:#fff;padding:11px 18px;border-radius:6px;font-weight:600;text-decoration:none}
.retour-carte{font-weight:600;font-size:.92rem;text-decoration:none;border:1px solid var(--trait);border-radius:6px;padding:10px 14px;background:var(--carte)}
.reperes{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:0 0 1.6rem}
.repere-cle{background:var(--carte);border:1px solid var(--trait);border-radius:8px;padding:13px 14px}
.repere-cle b{display:block;font-family:var(--display);font-weight:500;font-size:1.45rem;color:var(--bleu);line-height:1.15}
.repere-cle span{font-size:.84rem;color:var(--discret)}
.titre-listes{font-family:var(--display);font-weight:500;font-size:1.35rem;margin:0 0 .7rem}
.immeuble .listes .typo h3{font-size:1.02rem}
.immeuble .listes{margin-top:1.4rem}
.immeuble .vue{background:var(--carte);border:1px solid var(--trait);border-radius:10px;padding:12px}
.onglets{display:flex;gap:4px;border-bottom:1px solid var(--trait);margin:0 0 12px}
.onglets button{font:inherit;font-weight:600;font-size:.95rem;padding:9px 14px;border:0;border-bottom:3px solid transparent;background:transparent;color:var(--discret);cursor:pointer;margin-bottom:-1px}
.onglets button[aria-selected=true]{color:var(--bleu);border-bottom-color:var(--laiton)}
.plan-cadre{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:stretch}
.etages{display:flex;flex-direction:column;gap:4px}
.etages button{font:inherit;font-size:.82rem;font-weight:600;min-width:58px;padding:6px 8px;border:1px solid var(--trait);border-radius:6px;background:#fff;color:var(--texte);cursor:pointer;display:flex;justify-content:space-between;gap:8px;align-items:center}
.etages button small{font-weight:600;color:var(--bleu);background:var(--teinte);border-radius:9px;padding:0 6px;font-size:.74rem}
.etages button.vide{color:var(--discret)}.etages button.vide small{background:transparent;color:var(--discret)}
.etages button.tout{justify-content:center;margin-bottom:4px;border-color:var(--laiton);color:var(--laiton-texte)}
.etages button[aria-pressed=true]{background:var(--bleu);border-color:var(--bleu);color:#fff}
.etages button[aria-pressed=true] small{background:rgba(255,255,255,.22);color:#fff}
.plan-dessin{min-width:0}
.etage-titre{margin:0 0 6px;font-size:.88rem;color:var(--discret)}
#plan{display:block;width:100%;height:auto;border-radius:8px;border:1px solid var(--trait)}
#plan[hidden],#imm3d[hidden],.vues[hidden]{display:none}
#plan text{font-family:var(--body);pointer-events:none}
#plan .case{cursor:pointer;outline:none}
#plan .case rect:first-child{transition:opacity .2s}
#plan .case.eteinte{opacity:.22}
#plan .case.choisie rect:first-child{stroke:#B0894C;stroke-width:.55}
.plan-promoteur{margin:0 0 12px}.plan-promoteur img{width:100%;border-radius:8px;border:1px solid var(--trait)}.plan-promoteur figcaption{font-size:.8rem;color:var(--discret);margin-top:4px}
.immeuble .vue .note{margin:.6rem 0 0}
@media (min-width:700px){.reperes{grid-template-columns:repeat(4,1fr)}}
@media (min-width:960px){
  .immeuble{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:0 24px;align-items:start}
  .immeuble .vue{position:sticky;top:10px}
  .immeuble .listes{margin-top:0}
}
.vues{display:flex;flex-wrap:wrap;gap:6px;margin:.5rem 0 .6rem}
.vues button{font:inherit;font-size:.88rem;padding:8px 12px;border-radius:6px;border:1px solid var(--trait);background:#fff;color:var(--bleu);font-weight:600;cursor:pointer}
.vues button:hover{background:var(--teinte)}
.geste{position:absolute;left:50%;bottom:14px;translate:-50% 0;background:rgba(0,88,117,.92);color:#fff;font-size:.88rem;font-weight:600;padding:8px 14px 8px 40px;border-radius:20px;pointer-events:none;opacity:0;transition:opacity .4s;z-index:2;white-space:nowrap}
.geste.visible{opacity:1}
.geste .main{position:absolute;left:12px;top:50%;width:16px;height:16px;margin-top:-8px;border-radius:50%;border:2px solid #fff;animation:glisse 1.6s ease-in-out infinite}
@keyframes glisse{0%,100%{translate:-4px 0}50%{translate:6px 0}}
.info-prog{position:absolute;left:50%;bottom:calc(100% + 8px);translate:-50% 0;background:#005875;color:#fff;font-family:var(--body);font-size:.8rem;line-height:1.35;padding:6px 10px;border-radius:6px;white-space:nowrap;text-align:left;box-shadow:0 3px 10px rgba(22,26,30,.25);opacity:0;pointer-events:none;transition:opacity .15s;z-index:5}
.info-prog b{display:block;font-family:var(--display);font-weight:500;font-size:.95rem}
button.repere.groupe{width:24px;height:24px;display:flex;align-items:center;justify-content:center}
button.repere.groupe::before{content:attr(data-n);color:#fff;font:600 .62rem var(--body)}
button.repere.groupe.ouvert{z-index:8}
button.repere.groupe.ouvert .info-prog,button.repere.groupe:focus-visible .info-prog{opacity:1;pointer-events:auto}
.choix-prog{display:block;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.35);cursor:pointer;text-decoration:underline}
.info-prog::after{content:"";position:absolute;left:50%;top:100%;margin-left:-5px;border:5px solid transparent;border-top-color:#005875}
button.repere:hover .info-prog,button.repere:focus-visible .info-prog{opacity:1}
button.repere:hover{z-index:6}
.lieu:hover .info-prog,.lieu:focus .info-prog{opacity:1}
.lieu:hover,.lieu:focus{z-index:6;outline:none}
.lieu.ecole .info-prog{background:#8A6A2F}.lieu.ecole .info-prog::after{border-top-color:#8A6A2F}
.lieu.commerce .info-prog{background:#4A545E}.lieu.commerce .info-prog::after{border-top-color:#4A545E}
.boussole{position:absolute;left:12px;bottom:12px;width:64px;height:64px;padding:0;border:0;background:transparent;cursor:pointer;z-index:4;filter:drop-shadow(0 2px 5px rgba(22,26,30,.22))}
.boussole svg{display:block;width:100%;height:100%}
.boussole .aiguille{transition:transform .12s linear;transform-origin:0 0}
.scene3d{position:relative;border:1px solid var(--trait);border-radius:10px;overflow:hidden;background:radial-gradient(ellipse at 50% 30%,#FFFFFF 0%,#F4F0E8 70%);min-height:240px;touch-action:pan-y}
.scene3d canvas{display:block;width:100%;touch-action:none}
.coupe{display:flex;align-items:center;gap:10px;margin:0 0 10px;font-size:.9rem;color:var(--discret)}
.coupe input{flex:1;accent-color:#005875}
.coupe output{min-width:110px;text-align:right;color:var(--bleu);font-weight:600}
.aide{font-size:.85rem;color:var(--discret);margin:.5rem 0 0}
.perspective{margin:1rem 0 0}.perspective img{width:100%;border-radius:8px;border:1px solid var(--trait)}.perspective figcaption{font-size:.8rem;color:var(--discret);margin-top:4px}
.infos{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0 0 1rem}
.infos dt{color:var(--discret)}
.infos dd{margin:0}
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

function tete({ titre, description, url, test, carte }) {
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
${carte ? '<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">\n' : ''}<style>${CSS}</style>
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
  const nom = `<a href="${esc(p.slug)}/">${esc(p.nom)}</a>`;
  return `<article class="prog" data-typos="${esc((p.typologies || []).join(' '))}">
  <h3>${nom}</h3>
  ${p.promoteur ? `<p class="qui">${esc(p.promoteur)}</p>` : ''}
  ${lignes.length ? '<dl>' + lignes.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('') + '</dl>' : ''}
  ${typos || disp || picking ? `<div class="puces">${typos}${disp}${picking}</div>` : ''}
  ${p.picking ? '<div class="bas"><span class="prix"><small>grille</small>sur demande</span></div>' : `<div class="bas"><span class="prix">${AFFICHER.prixAPartirDe && p.prix_a_partir_de != null ? '<small>à partir de</small>' + euros(p.prix_a_partir_de) : '<small>prix</small>sur demande'}</span><span class="dispo">${pluriel(p.nb_lots_libres, 'logement disponible', 'logements disponibles')}</span></div>`}
</article>`;
}

function pageVille(d) {
  const c = d.chiffres, g = d.guide || {};
  const url = `${SITE}/neuf/${d.slug}/`;
  const titre = `Immobilier neuf à ${d.ville} (${d.cp}) : ${c.nb_programmes} programmes | GLR Immobilier`;
  const description = `${c.nb_programmes} programmes neufs et ${nb(c.nb_lots_libres)} logements disponibles à ${d.ville}` +
    (AFFICHER.prixM2 && c.prix_m2_moyen ? `, ${euros(c.prix_m2_moyen)}/m² en moyenne` : '') + `. Plans et prix de tous les promoteurs, mis à jour à chaque pige par GLR Immobilier.`;
  const typosFiltre = ['T1', 'T2', 'T3', 'T4', 'T5+'].filter(t => d.programmes.some(p => (p.typologies || []).includes(t)));
  // Programmes « picking » (sans mandat, source picking ; les « nomandat » ne sont jamais fournis) : en fin de liste, grille sur demande.
  const progs = [...d.programmes].sort((a, b) => (a.picking ? 1 : 0) - (b.picking ? 1 : 0) || (a.livraison_cle || '').localeCompare(b.livraison_cle || '') || (b.nb_lots_libres || 0) - (a.nb_lots_libres || 0));
  const dv = donneesVille(d, true);
  const ld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Immobilier neuf', item: SITE + '/neuf/' },
      { '@type': 'ListItem', position: 3, name: d.ville, item: url }]
  };
  return `${tete({ titre, description, url, test: d.test, carte: true })}
<main>
  <p class="fil"><a href="/">Accueil</a> › <a href="/neuf/">Immobilier neuf</a> › ${esc(d.ville)}</p>
  <h1>Immobilier neuf à ${esc(d.ville)}</h1>
  <hr class="filet">
  <p class="chapo">${pluriel(c.nb_programmes, 'programme', 'programmes')}${c.nb_promoteurs ? ' de ' + pluriel(c.nb_promoteurs, 'promoteur', 'promoteurs') : ''} et ${nb(c.nb_lots_libres)} logements disponibles à ${esc(d.ville)} (${esc(d.cp)}). Nous suivons tous les programmes neufs de la ville et vous envoyons les plans et les prix de ceux qui vous correspondent. Mis à jour le ${dateFr(d.maj)}.</p>

  <div class="chiffres">
    <div class="chiffre"><b>${nb(c.nb_programmes)}</b><span>programmes en vente</span></div>
    <div class="chiffre"><b>${nb(c.nb_lots_libres)}</b><span>logements disponibles</span></div>
    ${AFFICHER.prixM2 ? `<div class="chiffre"><b>${c.prix_m2_moyen ? euros(c.prix_m2_moyen) : '—'}</b><span>prix moyen au m²</span></div>` : (c.nb_promoteurs ? `<div class="chiffre"><b>${nb(c.nb_promoteurs)}</b><span>promoteurs</span></div>` : `<div class="chiffre"><b>${nb(Object.keys(c.typologies || {}).length)}</b><span>types de logements</span></div>`)}
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
  ${dv.p.length ? blocCarte(false, dv.p.some(x => x.k)) : ''}
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
${dv.p.length ? `${LIBS}
<script type="application/json" id="carte-data">${JSON.stringify({ ville: d.slug, villes: [dv] }).replace(/</g, '\\u003c')}</script>
<script type="module" src="/neuf/carte.js?v=${VERSION_JS}"></script>` : ''}
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

function contour(d) {
  if (!d.insee) return null;
  const f = path.join(ICI, 'donnees', 'contours', d.insee + '.json');
  if (!fs.existsSync(f)) return null;
  // Contour officiel de la commune (geo.api.gouv.fr, Licence Ouverte), coordonnées arrondies pour alléger la page.
  const g = JSON.parse(fs.readFileSync(f, 'utf8')).geometry;
  const arr = c => typeof c[0] === 'number' ? [Math.round(c[0] * 1e4) / 1e4, Math.round(c[1] * 1e4) / 1e4] : c.map(arr);
  return { type: 'Feature', properties: {}, geometry: { type: g.type, coordinates: arr(g.coordinates) } };
}

// Boussole : toujours affichée, de la carte de l'Île-de-France jusqu'à l'immeuble ; l'aiguille laiton montre le nord
const BOUSSOLE = id => `<button type="button" class="boussole" id="${id}" aria-label="Boussole : la pointe bleue marquée N indique le nord. Appuyer pour remettre le nord en haut." title="Remettre le nord en haut"><svg viewBox="-30 -30 60 60"><circle r="28" fill="#fff" stroke="#D8D2C5" stroke-width="1.4"/><g class="aiguille"><text x="0" y="-15.5" font-size="11" font-weight="700" text-anchor="middle" fill="#005875" font-family="Archivo,Arial,sans-serif">N</text><polygon points="0,-13 6.5,6 0,2 -6.5,6" fill="#005875"/><polygon points="0,2 6.5,6 0,20 -6.5,6" fill="#D8D2C5"/><line x1="-22" y1="0" x2="-18" y2="0" stroke="#9AA3AC" stroke-width="1.4"/><line x1="18" y1="0" x2="22" y2="0" stroke="#9AA3AC" stroke-width="1.4"/><line x1="0" y1="22" x2="0" y2="25" stroke="#9AA3AC" stroke-width="1.4"/></g><circle r="2" fill="#B0894C"/></svg></button>`;
const LIBS = `<link rel="modulepreload" href="https://unpkg.com/three@0.160.0/build/three.module.js"><link rel="modulepreload" href="https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js"><link rel="modulepreload" href="/neuf/maquette.js"><link rel="modulepreload" href="/neuf/immeuble3d.js">
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}</script>`;
const ARRONDI = x => Math.round(x * 1000) / 1000;
const logementsPublics = p => (p.logements || []).map(l => ({ i: l.id == null ? '' : String(l.id), t: l.typo, s: l.surface, e: l.etage == null ? null : l.etage, x: l.exterieur || '' }));
// Données de la carte d'une ville ; avecMaquette = on embarque les logements (sans prix) pour la maquette 3D
function donneesVille(d, avecMaquette) {
  return {
    v: d.ville, s: d.slug, cp: d.cp, i: d.insee || '', c: contour(d),
    r: `${pluriel(d.chiffres.nb_programmes, 'programme', 'programmes')} · ${nb(d.chiffres.nb_lots_libres)} logements disponibles`,
    p: d.programmes.filter(p => p.position && p.position.latitude != null).map(p => ({
      n: p.nom, s: p.slug, k: !!p.picking, a: ARRONDI(p.position.latitude), o: ARRONDI(p.position.longitude),
      z: !!(p.position && p.position.approx), u: `${d.slug}/${p.slug}/`,
      l: p.livraison || '', d: p.picking ? 'Grille sur demande' : (p.nb_lots_libres ? pluriel(p.nb_lots_libres, 'logement disponible', 'logements disponibles') : ''),
      }))
  };
}
const blocCarte = (grande, legendePicking) => `<div class="carte-zone">
    <div id="carte" class="carte${grande ? ' grande' : ''}" aria-label="Carte des programmes neufs"></div>
    ${BOUSSOLE('boussole-carte')}
  </div>
  <div class="fil-carte"><span id="fil-carte">Touchez un département.</span><span class="boutons-carte"><button type="button" id="carte-idf" hidden>Toute l’Île-de-France</button></span></div>
  <p class="legende"><span><i style="background:var(--bleu)"></i>Programme en vente</span>${legendePicking ? '<span><i style="background:var(--laiton)"></i>Picking, grille sur demande</span>' : ''}<span>Pastilles blanches : gares et tramways ; commerces et écoles en zoomant</span><span>${grande ? 'Choisissez une ville, puis touchez un programme pour voir son immeuble.' : 'Touchez un programme pour voir son immeuble.'}</span></p>`;

function pageProgramme(d, p) {
  const url = `${SITE}/neuf/${d.slug}/${p.slug}/`;
  const titre = `${p.nom} à ${d.ville} — programme neuf | GLR Immobilier`;
  const description = `${p.nom}, programme neuf à ${d.ville} (${d.cp})` + (p.promoteur ? ` par ${p.promoteur}` : '') + (p.livraison ? `, livraison ${p.livraison}` : '') +
    (p.nb_lots_libres ? `. ${pluriel(p.nb_lots_libres, 'logement disponible', 'logements disponibles')}` : '') + `. Plans envoyés par GLR Immobilier.`;
  const infos = [['Promoteur', p.promoteur], ['Livraison', p.livraison], ['Quartier', p.quartier],
    ['Transport', p.gare ? p.gare + (p.gare_minutes_a_pied ? ' · ' + p.gare_minutes_a_pied + '\u00a0min à pied' : '') : null],
    ['Dispositifs', (p.dispositifs || []).filter(x => !/LLI|LMNP/i.test(x)).join(', ') || null]].filter(x => x[1]);
  const ordre = ['T1', 'T2', 'T3', 'T4', 'T5+'];
  const groupes = {};
  for (const l of p.logements || []) (groupes[l.typo] = groupes[l.typo] || []).push(l);
  const typos = Object.keys(groupes).sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
  const ss = (p.logements || []).map(l => l.surface).filter(x => x != null);
  const surfaces = ss.length ? (Math.round(Math.min(...ss)) === Math.round(Math.max(...ss)) ? Math.round(ss[0]) + '\u00a0m²' : Math.round(Math.min(...ss)) + ' à ' + Math.round(Math.max(...ss)) + '\u00a0m²') : '';
  const etage = e => e == null ? 'non précisé' : e === 0 ? 'RDC' : e + (e === 1 ? 'er' : 'e');
  const plan2d = (p.logements || []).some(l => l.p2d && l.id); // au moins un logement a un plan du promoteur (jamais d'adresse : seulement ce drapeau)
  const acces = !!p.visite_3d || plan2d; // formulaire d'accès à la place de « appelez-nous »
  const idsPlan = (p.logements || []).filter(l => l.p2d && l.id).map(l => l.id).join(',');
  const zoneDocs = mode => `<div class="immeuble3d${mode === 'plan' ? ' plan-seul' : ''}" id="visite3d" data-mode="${mode}" data-p="${esc(p.pige_id || '')}" data-lots="${esc((p.logements || []).filter(l => l.v3d && l.id).map(l => l.id).join(','))}" data-plans="${esc(idsPlan)}"${mode === 'plan' ? ' hidden' : ''}>
      <div class="onglets3d" hidden><button type="button" data-onglet="visite" aria-pressed="true">Visite 3D</button><button type="button" data-onglet="plan" aria-pressed="false">Plan du promoteur</button></div>
      <p class="etat3d" hidden></p>
      <iframe title="${mode === 'plan' ? 'Plan' : 'Visite 3D'} de ${esc(p.nom)}" allow="fullscreen"></iframe>
      <div class="planbox" hidden><div class="pagesplan" hidden><button type="button" data-page="prec">Page précédente</button><span></span><button type="button" data-page="suiv">Page suivante</button></div><img alt="Plan du logement"><a class="ouvrir-plan" target="_blank" rel="noopener" hidden>Ouvrir le plan</a></div>
      ${mode === 'plan' ? '<button type="button" class="ferme3d">Fermer le plan</button>' : '<button type="button" class="charger3d" data-3d="immeuble">Voir l’immeuble en 3D</button>'}
    </div>`;
  const tableau = t => `<section class="typo"><h3>${esc(t)} · ${pluriel(groupes[t].length, 'logement', 'logements')}</h3>
  <table class="lots"><thead><tr><th>Surface</th><th>Étage</th><th>Extérieur</th><th>Prix</th><th></th></tr></thead><tbody>
  ${groupes[t].sort((a, b) => (a.surface || 0) - (b.surface || 0)).map(l => `<tr id="l-${esc(l.id == null ? '' : l.id)}"><td>${l.surface != null ? nb(l.surface) + '\u00a0m²' : '—'}</td><td>${etage(l.etage)}</td><td>${esc(l.exterieur || '—')}</td><td class="prix-lot" data-lot="${esc(l.id == null ? '' : l.id)}" data-s="${l.surface || ''}">…</td><td class="plan">${p.visite_3d && l.v3d && l.id ? `<button type="button" class="lien-visite" data-3d="${esc(l.id)}">Visite 3D</button>` : l.p2d && l.id ? `<button type="button" class="lien-visite" data-plan="${esc(l.id)}">Plan</button>` : acces ? '' : '<a href="#compte"><span class="long">Voir le </span>plan</a>'}</td></tr>`).join('\n  ')}
  </tbody></table></section>`;
  return `${tete({ titre, description, url, test: d.test })}
<main class="page-prog">
  <p class="fil"><a href="/">Accueil</a> › <a href="/neuf/">Immobilier neuf</a> › <a href="../">${esc(d.ville)}</a> › ${esc(p.nom)}</p>
  <header class="hero">
    <div>
      <p class="sur">Programme neuf · ${esc(d.ville)} (${esc(d.cp)})</p>
      <h1>${esc(p.nom)}</h1>
      <hr class="filet">
      <p class="chapo">${p.picking ? 'Nous pouvons vous obtenir la grille de ce programme sur demande.' : `${p.promoteur ? 'Un programme ' + esc(p.promoteur) : 'Un programme neuf'}${p.quartier ? ', quartier ' + esc(p.quartier) : ''}${p.livraison ? (dejaLivre(p) ? ', déjà livré' : ', livré au ' + esc(p.livraison)) : ''}.`}</p>
      <div class="puces">${(p.typologies || []).map(t => `<span class="puce">${esc(t)}</span>`).join('')}${(p.dispositifs || []).filter(x => !/LLI|LMNP/i.test(x)).map(t => `<span class="puce laiton">${esc(t)}</span>`).join('')}${p.picking ? '<span class="puce laiton" title="Programme proposé sans mandat de commercialisation">Picking</span>' : ''}</div>
    </div>
    <div class="hero-actions">${p.visite_3d ? '<button type="button" class="bouton-plein" data-3d="immeuble">Voir en 3D</button>' : ''}<a class="bouton-plein" href="#compte">Recevoir les plans</a><a class="retour-carte" href="/neuf/?ville=${esc(d.slug)}&amp;vue=ville#carte">Retour à la carte de ${esc(d.ville)}</a></div>
  </header>
  <div class="reperes">
    ${p.nb_lots_libres ? `<div class="repere-cle"><b>${nb(p.nb_lots_libres)}</b><span>${p.nb_lots_libres > 1 ? 'logements disponibles' : 'logement disponible'}</span></div>` : ''}
    ${p.livraison ? `<div class="repere-cle"><b>${esc(p.livraison.replace(/ trimestre /, ' trim. '))}</b><span>${dejaLivre(p) ? 'programme déjà livré' : 'livraison prévue'}</span></div>` : ''}
    ${surfaces ? `<div class="repere-cle"><b>${surfaces}</b><span>surfaces disponibles</span></div>` : ''}
    ${p.gare ? `<div class="repere-cle"><b>${p.gare_minutes_a_pied ? p.gare_minutes_a_pied + ' min' : 'À côté'}</b><span>à pied ${esc(deGare(p.gare))}</span></div>` : ''}
  </div>
  ${typos.length ? `${plan2d && !p.visite_3d ? '<div class="vue-plan">' + zoneDocs('plan') + '</div>' : ''}<section class="immeuble" id="immeuble">
   ${p.visite_3d ? `<div class="vue vue3d">
    ${zoneDocs('3d')}
    <p class="note">Visite 3D réalisée à partir des plans du promoteur : touchez un étage, puis un logement pour le visiter. Les plans des logements demandent un compte, créé en une minute.</p>
   </div>` : ''}
   ${p.visite_3d ? `   <div class="vue" id="secours3d" hidden>
    ${p.plan_masse ? `<figure class="plan-promoteur"><img src="${esc(p.plan_masse)}" alt="Plan de masse de ${esc(p.nom)}" loading="lazy"><figcaption>Plan de masse du promoteur, non contractuel.</figcaption></figure>` : ''}
    <div class="plan-cadre">
      <div class="etages" id="etages" role="group" aria-label="Choisir un étage"></div>
      <div class="plan-dessin">
        <p class="etage-titre" id="etage-titre"></p>
        <div class="scene3d" id="imm3d" data-lat="${p.position ? ARRONDI(p.position.latitude) : ''}" data-lng="${p.position ? ARRONDI(p.position.longitude) : ''}" aria-label="L’immeuble sur son terrain : faites-le tourner, choisissez un étage, touchez un logement"><div class="geste" id="geste"><span class="main"></span>Glissez pour tourner</div>${BOUSSOLE('boussole-immeuble')}</div>
        <svg id="plan" hidden role="img" aria-label="Plan de masse : l’immeuble sur son terrain, avec les logements disponibles de l’étage choisi"></svg>
      </div>
    </div>
    <div class="vues" role="group" aria-label="Changer de vue"><button type="button" data-vue="ensemble">Vue d’ensemble</button><button type="button" data-vue="rue">Depuis la rue</button><button type="button" data-vue="arriere">Côté jardin</button><button type="button" data-vue="dessus">Du dessus</button><button type="button" data-vue="tour">Faire le tour</button></div>
    <div class="coupe"><label for="heure">Soleil à</label><input type="range" id="heure" min="6" max="22" step="0.25" value="14"><output id="heure-val"></output></div>
    <div class="fiche-lot" id="bulle" aria-live="polite">Choisissez un étage à gauche, touchez un logement, ou passez sur une ligne de la liste.</div>
    <p class="note">Plan et maquette dessinés automatiquement à partir des logements disponibles : la forme réelle du bâtiment et la place exacte des logements sur l’étage peuvent différer.</p>
   </div>` : `   <div class="vue">
    ${p.plan_masse ? `<figure class="plan-promoteur"><img src="${esc(p.plan_masse)}" alt="Plan de masse de ${esc(p.nom)}" loading="lazy"><figcaption>Plan de masse du promoteur, non contractuel.</figcaption></figure>` : ''}
    <div class="plan-cadre">
      <div class="etages" id="etages" role="group" aria-label="Choisir un étage"></div>
      <div class="plan-dessin">
        <p class="etage-titre" id="etage-titre"></p>
        <div class="scene3d" id="imm3d" data-lat="${p.position ? ARRONDI(p.position.latitude) : ''}" data-lng="${p.position ? ARRONDI(p.position.longitude) : ''}" aria-label="L’immeuble sur son terrain : faites-le tourner, choisissez un étage, touchez un logement"><div class="geste" id="geste"><span class="main"></span>Glissez pour tourner</div>${BOUSSOLE('boussole-immeuble')}</div>
        <svg id="plan" hidden role="img" aria-label="Plan de masse : l’immeuble sur son terrain, avec les logements disponibles de l’étage choisi"></svg>
      </div>
    </div>
    <div class="vues" role="group" aria-label="Changer de vue"><button type="button" data-vue="ensemble">Vue d’ensemble</button><button type="button" data-vue="rue">Depuis la rue</button><button type="button" data-vue="arriere">Côté jardin</button><button type="button" data-vue="dessus">Du dessus</button><button type="button" data-vue="tour">Faire le tour</button></div>
    <div class="coupe"><label for="heure">Soleil à</label><input type="range" id="heure" min="6" max="22" step="0.25" value="14"><output id="heure-val"></output></div>
    <div class="fiche-lot" id="bulle" aria-live="polite">Choisissez un étage à gauche, touchez un logement, ou passez sur une ligne de la liste.</div>
    <p class="note">Plan et maquette dessinés automatiquement à partir des logements disponibles : la forme réelle du bâtiment et la place exacte des logements sur l’étage peuvent différer.</p>
   </div>`}
   <div class="listes">
    <h2 class="titre-listes">Les logements disponibles</h2>
    <div class="filtres" role="group" aria-label="Montrer une taille de logement"><button type="button" aria-pressed="true" data-t="">Tous</button>${typos.map(t => `<button type="button" aria-pressed="false" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    ${typos.map(tableau).join('\n    ')}
   </div>
  </section>
  ${p.image ? `<figure class="perspective"><img src="${esc(p.image)}" alt="Perspective de ${esc(p.nom)}" loading="lazy"><figcaption>Perspective du promoteur, non contractuelle.</figcaption></figure>` : ''}` : `<h2>Les logements</h2><p>La grille de ce programme est envoyée sur demande.</p>`}
${acces ? `<section class="appel" id="compte">
    <h2>${p.visite_3d ? 'Voir les plans et la visite 3D' : 'Voir les plans de ces logements'}</h2>
    <p>Créez votre accès en une minute : ${p.visite_3d ? 'vous voyez les plans de ces logements et la visite en 3D' : 'vous voyez les plans de ces logements'}. Un conseiller GLR Immobilier pourra vous rappeler pour vous aider.</p>
    <form id="f3d" class="form3d" novalidate data-prog="${esc(p.nom)}" data-ville="${esc(d.ville)}">
      <label>Prénom<input name="prenom" autocomplete="given-name" maxlength="80" required></label>
      <label>Téléphone<input name="telephone" type="tel" autocomplete="tel" maxlength="30" required></label>
      <label>E-mail<input name="email" type="email" autocomplete="email" maxlength="160" required></label>
      <label class="accord"><input name="accord" type="checkbox"><span>J\u2019accepte d\u2019être recontacté par GLR Immobilier au sujet de ce programme.</span></label>
      <p class="erreur3d" id="f3d-err" role="alert"></p>
      <button type="submit" class="plein">Créer mon accès</button>
    </form>
    <div id="f3d-ok" class="ok3d" hidden>${p.visite_3d ? '<p>Votre accès est créé : vous pouvez voir les plans et la visite 3D de ce programme.</p><button type="button" class="plein" data-3d="immeuble">Voir l’immeuble en 3D</button>' : '<p>Votre accès est créé : touchez « Plan » sur un logement pour voir son plan.</p>'}</div>
    <div class="boutons"><a class="creux" href="tel:${CONTACT.tel}">Appeler le ${CONTACT.telAffiche}</a><a class="creux" href="mailto:${CONTACT.mail}?subject=${encodeURIComponent('Plans de ' + p.nom + ' à ' + d.ville)}">Écrire un e-mail</a></div>
  </section>` : `  <section class="appel" id="compte">
    <h2>Voir les plans de ces logements</h2>
    <p>Les plans de chaque logement sont réservés à votre espace client. Il se crée en une minute ; en attendant, appelez-nous et nous vous les envoyons.</p>
    <div class="boutons"><a class="plein" href="tel:${CONTACT.tel}">Appeler le ${CONTACT.telAffiche}</a><a class="creux" href="mailto:${CONTACT.mail}?subject=${encodeURIComponent('Plans de ' + p.nom + ' à ' + d.ville)}">Écrire un e-mail</a></div>
  </section>`}
  <p class="note" id="mention-tva" hidden>* TVA 5,5 % : prix réservé aux acheteurs éligibles, sous conditions de ressources.</p>
  <p class="note">Disponibilités et prix relevés le ${dateFr(d.maj)} ; ils changent chaque semaine et sont confirmés par votre conseiller.</p>
</main>
${pied}
${typos.length ? `${`<script type="application/json" id="logements-data">${JSON.stringify((p.logements || []).map(l => ({ i: l.id == null ? '' : String(l.id), t: l.typo, s: l.surface, e: l.etage == null ? null : l.etage, x: l.exterieur || '' }))).replace(/</g, '\\u003c')}</script>`}
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}</script>
${p.visite_3d ? '' : '<script src="/neuf/programme.js?v=' + VERSION_JS + '" defer></script>'}
${acces ? '<script src="/neuf/visite3d.js?v=' + VERSION_JS + '" defer></script>' : ''}
<script>
(function(){var cs=document.querySelectorAll('td.prix-lot'),eu=function(n){return Math.round(n).toLocaleString('fr-FR')+'\u00a0€'};
var poser=function(j){j=j||{};var a=j.prix||{},b=j.prix_tva_reduite||{};window.GLR_PRIX=a;window.GLR_PRIX_R=b;var deux=false;
cs.forEach(function(c){var k=c.getAttribute('data-lot'),v=a[k],w=b[k];if(w)deux=true;
c.innerHTML=v||w?(v?eu(v):'')+(w?(v?'<br>':'')+'<span class="tva">'+eu(w)+' <small>TVA\u00a05,5\u00a0%*</small></span>':''):'sur demande'});
var n=document.getElementById('mention-tva');if(n)n.hidden=!deux;};
${d.test ? `// Page d'essai : prix fictifs calculés ici, aucun prix dans le dépôt.
var a={},b={},red=${(p.dispositifs || []).some(x => /5,5/.test(x)) ? 'true' : 'false'};cs.forEach(function(c,n){var k=c.getAttribute('data-lot'),v=Math.round(c.getAttribute('data-s')*5200/1000)*1000;if(!red||n%4)a[k]=v;if(red&&n%3!==1)b[k]=Math.round(v*0.88/1000)*1000});poser({prix:a,prix_tva_reduite:b});` :
`fetch(${JSON.stringify(PRIX_URL)}+'?p='+encodeURIComponent(${JSON.stringify(String(p.pige_id || ''))}),{headers:{accept:'application/json'}})
.then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){poser(j)}).catch(function(){poser(null)});`}
})();
</script>` : ''}
</body>
</html>
`;
}

function pageIndex(villes) {
  const test = villes.some(d => d.test);
  const url = SITE + '/neuf/';
  const sansAccent = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const DV = villes.map(d => donneesVille(d, true));
  const V = villes.map(d => ({ v: d.ville, s: d.slug, cp: d.cp, k: sansAccent(d.ville + ' ' + d.cp),
    r: `${pluriel(d.chiffres.nb_programmes, 'programme', 'programmes')} · ${nb(d.chiffres.nb_lots_libres)} logements disponibles` }));
  return `${tete({ titre: 'Immobilier neuf en Île-de-France : tous les programmes par ville | GLR Immobilier', description: 'Cherchez une ville et voyez tous ses programmes neufs sur la carte : logements disponibles, typologies, prix. Plans envoyés par GLR Immobilier.', url, test, carte: true })}
<main>
  <p class="fil"><a href="/">Accueil</a> › Immobilier neuf</p>
  <h1>Tous les programmes neufs, ville par ville</h1>
  <hr class="filet">
  <p class="chapo">Tapez une ville : nous vous montrons tous ses programmes neufs, tous promoteurs confondus.</p>
  <div class="recherche">
    <label for="q">Quelle ville ?</label>
    <input id="q" type="search" autocomplete="off" placeholder="Ex. Aubervilliers ou 93300" role="combobox" aria-expanded="false" aria-controls="props" aria-autocomplete="list">
    <ul id="props" class="propositions" role="listbox"></ul>
  </div>
  <div class="resume" id="resume" aria-live="polite"></div>
  ${blocCarte(true, true)}
  <h2>Les villes suivies</h2>
  <div class="villes">
${villes.map(d => `    <a href="/neuf/${d.slug}/"><b>${esc(d.ville)}</b><span>${pluriel(d.chiffres.nb_programmes, 'programme', 'programmes')} · ${nb(d.chiffres.nb_lots_libres)} logements disponibles${AFFICHER.prixM2 && d.chiffres.prix_m2_moyen ? ' · ' + euros(d.chiffres.prix_m2_moyen) + '/m²' : ''}</span></a>`).join('\n')}
  </div>
</main>
${pied}
${LIBS}
<script type="application/json" id="carte-data">${JSON.stringify({ villes: DV }).replace(/</g, '\\u003c')}</script>
<script type="module" src="/neuf/carte.js?v=${VERSION_JS}"></script>
<script>
(function(){
var V=${JSON.stringify(V).replace(/</g, '\\u003c')};
var e=function(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
var sa=function(t){return t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()};
var q=document.getElementById('q'),ul=document.getElementById('props'),res=document.getElementById('resume'),choix=-1,liste=[];
function montrer(v){
  res.className='resume';res.style.display='block';
  res.innerHTML='<b>'+e(v.v)+'</b> <span>('+e(v.cp)+')</span><p>'+e(v.r)+'</p><a class="bouton" href="'+e(v.s)+'/">Voir les programmes de '+e(v.v)+'</a>';
  var essai=0,go=function(){if(window.GLRCarte)window.GLRCarte.ville(v.s,true);else if(essai++<40)setTimeout(go,250)};go();
  try{history.replaceState(null,'','?ville='+v.s)}catch(_){}
}
function absente(t){res.className='resume absente';res.style.display='block';
  res.innerHTML='<b>'+e(t)+'</b><p>Cette ville n\u2019a pas encore sa page. Nous suivons aussi ses programmes neufs : appelez-nous ou écrivez-nous, nous vous envoyons ce qui existe.</p><a class="bouton" href="tel:${CONTACT.tel}">Appeler le ${CONTACT.telAffiche}</a>';}
function proposer(){var t=sa(q.value);choix=-1;liste=t?V.filter(function(v){return v.k.indexOf(t)>-1}):[];
  ul.innerHTML=liste.map(function(v,i){return '<li role="option" id="o'+i+'" aria-selected="false">'+e(v.v)+'<small>'+e(v.cp)+'</small></li>'}).join('');
  ul.style.display=liste.length?'block':'none';q.setAttribute('aria-expanded',liste.length?'true':'false');
  [].forEach.call(ul.children,function(li,i){li.addEventListener('mousedown',function(ev){ev.preventDefault();valider(liste[i])})});}
function valider(v){ul.style.display='none';q.setAttribute('aria-expanded','false');if(v){q.value=v.v;montrer(v);}else if(q.value.trim())absente(q.value.trim());}
function marquer(){[].forEach.call(ul.children,function(li,i){li.setAttribute('aria-selected',i===choix?'true':'false')});}
q.addEventListener('input',proposer);
q.addEventListener('keydown',function(ev){
  if(ev.key==='ArrowDown'&&liste.length){choix=(choix+1)%liste.length;marquer();ev.preventDefault();}
  else if(ev.key==='ArrowUp'&&liste.length){choix=(choix-1+liste.length)%liste.length;marquer();ev.preventDefault();}
  else if(ev.key==='Enter'){ev.preventDefault();var t=sa(q.value);valider(liste[choix>-1?choix:0]||V.filter(function(v){return sa(v.v)===t})[0]);}
  else if(ev.key==='Escape'){ul.style.display='none';}});
q.addEventListener('blur',function(){ul.style.display='none'});
window.GLRSansPage=function(n){absente(n);res.scrollIntoView({behavior:'smooth',block:'nearest'})};
window.GLRChoixVille=function(s){var v=V.filter(function(x){return x.s===s})[0];if(v){q.value=v.v;montrer(v);}};
window.GLRDirect=new URLSearchParams(location.search).get('vue')==='ville';
var d=new URLSearchParams(location.search).get('ville');if(d){var v=V.filter(function(x){return x.s===d})[0];if(v){q.value=v.v;montrer(v);if(window.GLRDirect)setTimeout(function(){document.getElementById('carte').scrollIntoView({block:'center'})},60);}}
})();
</script>
</body>
</html>
`;
}

const dossier = path.join(ICI, 'donnees');
const COMMERCIALISATEURS = /^(iselection|accueil immobilier|valority|wemo)\b|agr[ée]gateur/i;
// Villes publiées : on commence par Colombes seule (demande d'Alex du 24/11/2026). Les autres fichiers restent prêts.
// Le générateur automatique (neuf/publier.js) écrit donnees/villes-publiees.json (liste des villes passées en « publiee » dans la base) ;
// sans ce fichier, Colombes seule.
const LISTE_PUBLIEES = path.join(dossier, 'villes-publiees.json');
const VILLES_ACTIVES = fs.existsSync(LISTE_PUBLIEES) ? JSON.parse(fs.readFileSync(LISTE_PUBLIEES, 'utf8')).villes : ['colombes'];
const villes = fs.readdirSync(dossier).filter(f => f.endsWith('.json') && VILLES_ACTIVES.includes(f.replace(/\.json$/, ''))).sort().map(f => {
  const d = JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8'));
  verifier(d, f);
  // « Logements disponibles » = libres + optionnés (décision d'Alex du 25/11/2026). La base compte les libres seuls dans nb_lots_libres :
  // on recalcule ici, programme par programme, à partir de la liste des logements, pour que le chiffre et la liste disent la même chose.
  // Jamais de nom de promoteur ni de commercialisateur sur les pages (décision d'Alex du 25/11/2026). On garde seulement le nombre de
  // vrais promoteurs (commercialisateurs exclus), compté avant d'effacer les noms, ou celui déjà écrit dans le fichier.
  { const vrais = new Set(d.programmes.map(p => String(p.promoteur || '').trim()).filter(n => n && !COMMERCIALISATEURS.test(n)));
    for (const p of d.programmes) p.promoteur = ''; }
  for (const p of d.programmes) {
    if (p.picking || !(p.logements || []).length) continue;
    p.nb_lots_libres = p.logements.length;
  }
  d.chiffres.nb_lots_libres = d.programmes.reduce((n, p) => n + (p.picking ? 0 : (p.logements || []).length || 0), 0) || d.chiffres.nb_lots_libres;
  return d;
}).filter(d => {
  // Une ville sans aucun logement à montrer (seulement du picking, ou rien) n'est pas présentable : pas de page (25/11/2026).
  const n = d.programmes.reduce((t, p) => t + (p.picking ? 0 : (p.logements || []).length), 0);
  if (!n) console.log('Ville non fabriquée (aucun logement à montrer) : ' + d.slug);
  return n > 0;
});
for (const d of villes) {
  fs.mkdirSync(path.join(ICI, d.slug), { recursive: true });
  fs.writeFileSync(path.join(ICI, d.slug, 'index.html'), pageVille(d));
  for (const p of d.programmes) {
    fs.mkdirSync(path.join(ICI, d.slug, p.slug), { recursive: true });
    fs.writeFileSync(path.join(ICI, d.slug, p.slug, 'index.html'), pageProgramme(d, p));
  }
  // Une page de programme qui n'est plus dans les données (programme parti de l'offre, ancien essai) ne reste pas en ligne :
  // on retire les dossiers fabriqués (un seul fichier index.html) qui ne sont plus dans la liste.
  const gardes = new Set(d.programmes.map(p => p.slug));
  for (const e of fs.readdirSync(path.join(ICI, d.slug), { withFileTypes: true })) {
    if (!e.isDirectory() || gardes.has(e.name)) continue;
    const dir = path.join(ICI, d.slug, e.name);
    if (fs.readdirSync(dir).join() === 'index.html') fs.rmSync(dir, { recursive: true });
  }
}
villes.sort((a, b) => a.ville.localeCompare(b.ville, 'fr'));
fs.writeFileSync(path.join(ICI, 'index.html'), pageIndex(villes));
console.log(villes.length + ' pages ville fabriquées : ' + villes.map(d => d.slug).join(', '));
