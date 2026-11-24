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
const PRIX_URL = 'https://hydqfbxdtpmbuooexekp.supabase.co/functions/v1/neuf-prix';
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
  // Rien de confidentiel sur une page publique (dépôt public) : ni prix de lot, ni plan, ni commission (décision d'Alex du 24/11/2026 : listing sans prix, plans avec compte).
  const interdits = ['prix', 'prix_lot', 'lots', 'plan', 'plans', 'plan_url', 'commission', 'commission_pct', 'extranet', 'lat', 'lng'];
  const vus = JSON.stringify(d).match(new RegExp('"(' + interdits.join('|') + ')"', 'g'));
  if (vus) throw new Error(fichier + ' : champs interdits sur une page publique ' + [...new Set(vus)].join(', '));
  const permis = ['id', 'typo', 'pieces', 'surface', 'etage', 'exterieur'];
  for (const p of d.programmes) {
    if (!/^[a-z0-9-]+$/.test(p.slug || '')) throw new Error(fichier + ' : slug de programme invalide ' + p.slug);
    // Clés publiques seulement (substr(md5('glr-neuf:' || id), 1, 12)) : jamais l'identifiant interne de la pige
    const cle = x => /^[0-9a-f]{12}$/.test(String(x));
    if (!d.test && p.pige_id != null && !cle(p.pige_id)) throw new Error(fichier + ' : ' + p.slug + ' : pige_id doit être la clé publique de 12 caractères');
    if (!d.test && (p.logements || []).some(l => l.id != null && !cle(l.id))) throw new Error(fichier + ' : ' + p.slug + ' : id de logement doit être la clé publique de 12 caractères');
    for (const l of p.logements || []) {
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
.carte{height:420px;border-radius:8px;border:1px solid var(--trait);margin:0 0 .6rem;z-index:0}
.carte-zone{position:relative}
.maplibregl-map{font-family:var(--body);border-radius:8px}
.maplibregl-ctrl-attrib{font-size:10px;background:rgba(251,248,241,.85)!important}
button.repere{padding:0;cursor:pointer;display:block}
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
.tete-immeuble{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.retour-carte{font-weight:600;font-size:.92rem;text-decoration:none;border:1px solid var(--trait);border-radius:6px;padding:7px 12px;background:var(--carte)}
.titre-listes{font-family:var(--display);font-weight:500;font-size:1.2rem;margin:0 0 .6rem}
.immeuble .listes .typo h3{font-size:1.02rem}
.immeuble .vue{display:contents}
.immeuble .scene3d{position:sticky;top:0;z-index:3}
.immeuble .listes{margin-top:1rem}
@media (min-width:960px){
  .immeuble{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:0 22px;align-items:start}
  .immeuble .vue{display:block;position:sticky;top:10px}
  .immeuble .scene3d{position:relative}
  .immeuble .listes{margin-top:0}
  .immeuble .sous-immeuble{grid-column:1 / -1}
  main:has(.immeuble){max-width:1240px}
}
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
  <p class="qui">${esc(p.promoteur)}</p>
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
<script type="module" src="/neuf/carte.js"></script>` : ''}
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

const LIBS = `<link rel="modulepreload" href="https://unpkg.com/three@0.160.0/build/three.module.js"><link rel="modulepreload" href="https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js"><link rel="modulepreload" href="/neuf/maquette.js"><link rel="modulepreload" href="/neuf/immeuble3d.js">
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}</script>`;
const ARRONDI = x => Math.round(x * 1000) / 1000;
const logementsPublics = p => (p.logements || []).map(l => ({ i: l.id == null ? '' : String(l.id), t: l.typo, s: l.surface, e: l.etage == null ? 0 : l.etage, x: l.exterieur || '' }));
// Données de la carte d'une ville ; avecMaquette = on embarque les logements (sans prix) pour la maquette 3D
function donneesVille(d, avecMaquette) {
  return {
    v: d.ville, s: d.slug, cp: d.cp, i: d.insee || '', c: contour(d),
    r: `${pluriel(d.chiffres.nb_programmes, 'programme', 'programmes')} · ${nb(d.chiffres.nb_lots_libres)} logements disponibles`,
    p: d.programmes.filter(p => p.position && p.position.latitude != null).map(p => ({
      n: p.nom, s: p.slug, k: !!p.picking, a: ARRONDI(p.position.latitude), o: ARRONDI(p.position.longitude),
      u: `${d.slug}/${p.slug}/`,
      l: p.livraison || '', d: p.picking ? 'Grille sur demande' : (p.nb_lots_libres ? pluriel(p.nb_lots_libres, 'logement disponible', 'logements disponibles') : ''),
      }))
  };
}
const blocCarte = (grande, legendePicking) => `<div class="carte-zone">
    <div id="carte" class="carte${grande ? ' grande' : ''}" aria-label="Carte des programmes neufs"></div>
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
  const etage = e => e == null ? '—' : e === 0 ? 'RDC' : e + (e === 1 ? 'er' : 'e');
  const tableau = t => `<section class="typo"><h3>${esc(t)} · ${pluriel(groupes[t].length, 'logement', 'logements')}</h3>
  <table class="lots"><thead><tr><th>Surface</th><th>Étage</th><th>Extérieur</th><th>Prix</th><th></th></tr></thead><tbody>
  ${groupes[t].sort((a, b) => (a.surface || 0) - (b.surface || 0)).map(l => `<tr id="l-${esc(l.id == null ? '' : l.id)}"><td>${l.surface != null ? nb(l.surface) + '\u00a0m²' : '—'}</td><td>${etage(l.etage)}</td><td>${esc(l.exterieur || '—')}</td><td class="prix-lot" data-lot="${esc(l.id == null ? '' : l.id)}" data-s="${l.surface || ''}">…</td><td class="plan"><a href="#compte"><span class="long">Voir le </span>plan</a></td></tr>`).join('\n  ')}
  </tbody></table></section>`;
  return `${tete({ titre, description, url, test: d.test })}
<main>
  <p class="fil"><a href="/">Accueil</a> › <a href="/neuf/">Immobilier neuf</a> › <a href="../">${esc(d.ville)}</a> › ${esc(p.nom)}</p>
  <h1>${esc(p.nom)}</h1>
  <hr class="filet">
  <p class="chapo">Programme neuf à ${esc(d.ville)} (${esc(d.cp)})${p.picking ? '. Nous pouvons vous obtenir la grille de ce programme sur demande.' : p.nb_lots_libres ? ` : ${pluriel(p.nb_lots_libres, 'logement disponible', 'logements disponibles')}, relevés le ${dateFr(d.maj)}.` : '.'}</p>
  ${infos.length ? '<dl class="infos">' + infos.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('') + '</dl>' : ''}
  ${p.picking ? '<div class="puces"><span class="puce laiton" title="Programme proposé sans mandat de commercialisation">Picking</span></div>' : ''}
  ${typos.length ? `<div class="tete-immeuble"><h2 id="immeuble">L’immeuble</h2><a class="retour-carte" href="/neuf/?ville=${esc(d.slug)}">Retour à la carte de ${esc(d.ville)}</a></div>
  <div class="immeuble">
   <div class="vue">
    <div class="filtres" role="group" aria-label="Montrer une taille de logement"><button type="button" aria-pressed="true" data-t="">Tous</button>${typos.map(t => `<button type="button" aria-pressed="false" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    <div class="coupe"><label for="coupe">Voir jusqu’à</label><input type="range" id="coupe" min="1" max="1" value="1" step="1"><output id="coupe-val"></output></div>
 <div class="coupe"><label for="heure">Soleil à</label><input type="range" id="heure" min="6" max="22" step="0.25" value="14"><output id="heure-val"></output></div>
    <div class="scene3d" id="imm3d" data-lat="${p.position ? ARRONDI(p.position.latitude) : ''}" data-lng="${p.position ? ARRONDI(p.position.longitude) : ''}" aria-label="Maquette 3D de l’immeuble : faites-la tourner, touchez un logement"></div>
    <div class="fiche-lot" id="bulle" aria-live="polite">Touchez ou survolez un logement de la maquette pour voir sa fiche.</div>
   </div>
   <div class="listes">
    <h3 class="titre-listes">Les logements disponibles</h3>
    ${typos.map(tableau).join('\n    ')}
   </div>
   <div class="sous-immeuble">
    <p class="aide">Touchez une fenêtre, ou passez sur une ligne de la liste : le logement ressort de l’immeuble. Glissez pour tourner autour, molette ou pincement pour zoomer, clic droit ou deux doigts pour vous déplacer.</p>
    <p class="note">Maquette dessinée automatiquement à partir des logements disponibles : la forme réelle du bâtiment et la place exacte des logements sur l’étage peuvent différer.${p.image ? '' : ''}</p>
    ${p.image ? `<figure class="perspective"><img src="${esc(p.image)}" alt="Perspective de ${esc(p.nom)}" loading="lazy"><figcaption>Perspective du promoteur, non contractuelle.</figcaption></figure>` : ''}
   </div>
  </div>` : `<h2>Les logements</h2><p>La grille de ce programme est envoyée sur demande.</p>`}
  <section class="appel" id="compte">
    <h2>Voir les plans de ces logements</h2>
    <p>Les plans et les prix sont réservés à votre espace client. Il se crée en une minute ; en attendant, appelez-nous et nous vous les envoyons.</p>
    <div class="boutons"><a class="plein" href="tel:${CONTACT.tel}">Appeler le ${CONTACT.telAffiche}</a><a class="creux" href="mailto:${CONTACT.mail}?subject=${encodeURIComponent('Plans de ' + p.nom + ' à ' + d.ville)}">Écrire un e-mail</a></div>
  </section>
  <p class="note" id="mention-tva" hidden>* TVA 5,5 % : prix réservé aux acheteurs éligibles, sous conditions de ressources.</p>
  <p class="note">Disponibilités et prix relevés le ${dateFr(d.maj)} ; ils changent chaque semaine et sont confirmés par votre conseiller.</p>
</main>
${pied}
${typos.length ? `<script type="application/json" id="logements-data">${JSON.stringify((p.logements || []).map(l => ({ i: l.id == null ? '' : String(l.id), t: l.typo, s: l.surface, e: l.etage == null ? 0 : l.etage, x: l.exterieur || '' }))).replace(/</g, '\\u003c')}</script>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}</script>
<script type="module" src="/neuf/immeuble3d.js"></script>
<script>
(function(){var bs=document.querySelectorAll('.immeuble .filtres button');bs.forEach(function(b){b.addEventListener('click',function(){var t=b.getAttribute('data-t');
  bs.forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});
  document.querySelectorAll('section.typo').forEach(function(s){s.style.display=!t||s.querySelector('h3').textContent.indexOf(t+' ')===0?'':'none'});});});})();
</script>
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
<script type="module" src="/neuf/carte.js"></script>
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
var d=new URLSearchParams(location.search).get('ville');if(d){var v=V.filter(function(x){return x.s===d})[0];if(v){q.value=v.v;montrer(v);}}
})();
</script>
</body>
</html>
`;
}

const dossier = path.join(ICI, 'donnees');
// Villes publiées : on commence par Colombes seule (demande d'Alex du 24/11/2026). Les autres fichiers restent prêts.
const VILLES_ACTIVES = ['colombes'];
const villes = fs.readdirSync(dossier).filter(f => f.endsWith('.json') && VILLES_ACTIVES.includes(f.replace(/\.json$/, ''))).sort().map(f => {
  const d = JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8'));
  verifier(d, f);
  return d;
});
for (const d of villes) {
  fs.mkdirSync(path.join(ICI, d.slug), { recursive: true });
  fs.writeFileSync(path.join(ICI, d.slug, 'index.html'), pageVille(d));
  for (const p of d.programmes) {
    fs.mkdirSync(path.join(ICI, d.slug, p.slug), { recursive: true });
    fs.writeFileSync(path.join(ICI, d.slug, p.slug, 'index.html'), pageProgramme(d, p));
  }
}
villes.sort((a, b) => a.ville.localeCompare(b.ville, 'fr'));
fs.writeFileSync(path.join(ICI, 'index.html'), pageIndex(villes));
console.log(villes.length + ' pages ville fabriquées : ' + villes.map(d => d.slug).join(', '));
