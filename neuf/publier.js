#!/usr/bin/env node
// Met à jour les pages ville /neuf/ depuis la base, avec garde-fous (option « automatique » choisie par Alex le 25/11/2026).
//   node neuf/publier.js                     lit la base avec la clé publique du site (la même que dans les pages), écrit neuf/donnees/<slug>.json, lance fabriquer.js
//   node neuf/publier.js --depuis <dossier>  essai sans base : lit <dossier>/villes.json et <dossier>/<slug>.json
// Un garde-fou qui se déclenche arrête TOUT : rien n'est écrit, rien n'est publié, code de sortie 1.
// Aucun secret : la clé publique ne lit que les villes à l'état « publiee » (fonctions neuf_villes_publiees et neuf_ville_publiee).
// Un arrêt fait échouer la tâche GitHub : c'est le mail d'échec de GitHub qui prévient Alex.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ICI = __dirname;
const DONNEES = path.join(ICI, 'donnees');
const BASE = process.env.SUPABASE_URL || 'https://hydqfbxdtpmbuooexekp.supabase.co';
const CLE = process.env.SUPABASE_PUBLIC_KEY || 'sb_publishable_hD_52JIZ-4b9gHIV3lXpVw_gbrmi0VL'; // clé publique (publishable), faite pour être lue dans les pages
const SEUIL_BAISSE = 0.30; // une ville qui perd plus de 30 % de ses logements d'un coup n'est pas publiée
const args = process.argv.slice(2);
const DEPUIS = args.includes('--depuis') ? args[args.indexOf('--depuis') + 1] : null;

class Arret extends Error {}
const arret = m => { throw new Arret(m); };

async function rest(chemin, opts = {}) {
  const r = await fetch(BASE + '/rest/v1/' + chemin, { ...opts, headers: { apikey: CLE, Authorization: 'Bearer ' + CLE, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!r.ok) arret('la base répond ' + r.status + ' sur ' + chemin.split('?')[0]);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// ---- Garde-fou : champ interdit ----------------------------------------------------------------------------------
const CLE_PUBLIQUE = /^[0-9a-f]{12}$/;
const LOGEMENT_PERMIS = ['id', 'typo', 'pieces', 'surface', 'etage', 'exterieur', 'statut', 'v3d', 'p2d']; // p2d : « ce logement a un plan du promoteur » (vrai seulement, jamais d'adresse) ; v3d : « ce logement a une visite 3D » (vrai seulement ; décision d'Alex du 27/11/2026)
const PRIX_TOLERES_VIDES = ['prix_a_partir_de', 'prix_entree', 'prix_m2_moyen']; // rendus vides par la base ; un chiffre dedans arrête tout
const NOM_INTERDIT = /(^|_)(prix|prix_lot|lots?|plans?|plan_url|plan_masse|commission\w*|extranet|intranet|lat|lng|image|images|photo|photos)$|^immolead|^pige_interne|^id_pige$/i;

function parcourir(x, chemin, faire) {
  if (Array.isArray(x)) x.forEach((v, i) => parcourir(v, chemin + '[' + i + ']', faire));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { faire(k, v, chemin); parcourir(v, chemin + '.' + k, faire); }
}

function controlerChamps(d, ville) {
  const nom = ville + ' : ';
  parcourir(d, '', (k, v, chemin) => {
    if (PRIX_TOLERES_VIDES.includes(k)) { if (v != null && v !== '') arret(nom + 'un chiffre est apparu dans ' + k + ' (' + chemin + ')'); return; }
    if (NOM_INTERDIT.test(k)) { if (k === 'image' && (v == null || v === '')) return; arret(nom + 'champ interdit « ' + k + ' » (' + chemin + ')'); }
  });
  const texte = JSON.stringify(d);
  if (/immolead_/i.test(texte)) arret(nom + 'un nom technique immolead_* apparaît dans les données');
  if (/nomandat/i.test(texte)) arret(nom + 'un programme « nomandat » apparaît dans les données');
  if (/https?:\/\/[^"]*(extranet|intranet|immo-?lead)/i.test(texte)) arret(nom + 'une adresse d\'intranet apparaît dans les données');
  for (const p of d.programmes || []) {
    for (const k of ['pige_id', 'id']) if (p[k] != null && !CLE_PUBLIQUE.test(String(p[k]))) arret(nom + p.slug + ' : ' + k + ' n\'est pas une clé publique de 12 caractères');
    if (p.visite_3d != null && p.visite_3d !== true) arret(nom + p.slug + ' : visite_3d doit valoir true ou être absent');
    if (p.rue != null) { // « rue » : point précis réservé au bouton « Voir la rue » (5 décimales au plus, Île-de-France seulement, rien d'autre dans l'objet)
      const r = p.rue, ok = r && typeof r === 'object' && !Array.isArray(r) && Object.keys(r).sort().join() === 'latitude,longitude' && [r.latitude, r.longitude].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n * 1e5 - Math.round(n * 1e5)) < 1e-6) && r.latitude >= 48.1 && r.latitude <= 49.3 && r.longitude >= 1.4 && r.longitude <= 3.6;
      if (!ok) arret(nom + p.slug + ' : rue doit être {latitude, longitude} en Île-de-France, 5 décimales au plus');
    }
    if (p.pm != null && p.pm !== true) arret(nom + p.slug + ' : pm doit valoir true ou être absent'); // pm : « ce programme a un plan de masse du promoteur » (vrai seulement, jamais de lien ; plan_masse est interdit)
    for (const l of p.logements || []) {
      const en_trop = Object.keys(l).filter(k => !LOGEMENT_PERMIS.includes(k));
      if (en_trop.length) arret(nom + p.slug + ' : champs de logement non permis ' + en_trop.join(', '));
      if (l.p2d != null && l.p2d !== true) arret(nom + p.slug + ' : p2d doit valoir true ou être absent');
      if (l.v3d != null && l.v3d !== true) arret(nom + p.slug + ' : v3d doit valoir true ou être absent');
      if (l.id != null && !CLE_PUBLIQUE.test(String(l.id))) arret(nom + p.slug + ' : id de logement qui n\'est pas une clé publique');
    }
  }
}

const compter = d => (d.programmes || []).reduce((n, p) => n + (p.logements || []).length, 0);

// ---- Garde-fou : chute brutale -------------------------------------------------------------------------------------
function controlerChute(d, ville, avant) {
  if (!avant || avant.test) return;
  const a = compter(avant), n = compter(d);
  if (a > 0 && n < a * (1 - SEUIL_BAISSE)) arret(ville + ' : ' + a + ' logements avant, ' + n + ' maintenant (plus de 30 % de baisse d\'un coup)');
  const pa = (avant.programmes || []).length, pn = (d.programmes || []).length;
  if (pa >= 3 && pn < pa * (1 - SEUIL_BAISSE)) arret(ville + ' : ' + pa + ' programmes avant, ' + pn + ' maintenant (plus de 30 % de baisse d\'un coup)');
}

// Relevé de cartes manquant : la ville n'est pas prête côté site, on la laisse de côté (elle sera fabriquée quand son relevé existera)
// sans bloquer les autres villes. Retourne le nom du relevé manquant, ou null.
function releveManquant(d, ville) {
  if (!d.insee) arret(ville + ' : pas de code INSEE dans les données');
  for (const dossier of ['contours', 'lieux', 'parcs']) {
    if (!fs.existsSync(path.join(DONNEES, dossier, d.insee + '.json'))) return dossier + '/' + d.insee + '.json';
  }
  return null;
}

async function lireVilles() {
  if (DEPUIS) {
    const liste = JSON.parse(fs.readFileSync(path.join(DEPUIS, 'villes.json'), 'utf8'));
    return liste.map(v => ({ ...v, json: JSON.parse(fs.readFileSync(path.join(DEPUIS, v.slug + '.json'), 'utf8')) }));
  }
  const liste = await rest('rpc/neuf_villes_publiees', { method: 'POST', body: '{}' });
  if (!liste.length) arret('aucune ville au statut « publiee » dans la base (anormal : Colombes au moins)');
  const out = [];
  for (const v of liste) {
    const json = await rest('rpc/neuf_ville_publiee', { method: 'POST', body: JSON.stringify({ p_ville: v.slug }) });
    if (!json) arret(v.ville + ' : la base ne rend rien pour cette ville');
    out.push({ ...v, json });
  }
  return out;
}

function lire(f) { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } }

(async () => {
  const villes = await lireVilles();
  const aEcrire = [];
  for (const v of villes) {
    const d = v.json;
    if (!/^[a-z0-9-]+$/.test(v.slug || '')) arret('slug invalide ' + v.slug);
    if (d.slug !== v.slug) arret(v.slug + ' : le JSON porte un autre slug (' + d.slug + ')');
    controlerChamps(d, v.ville || v.slug);
    const f = path.join(DONNEES, v.slug + '.json');
    const avant = lire(f);
    // Une ville qui chute trop d'un coup garde ses données d'hier (rien n'est publié pour elle) ; les autres villes se mettent à jour.
    // Avant : le robot s'arrêtait pour TOUTES les villes (27/11/2026 : Bourg-la-Reine, 3 programmes → 2, a bloqué la mise à jour du jour).
    try { controlerChute(d, v.ville || v.slug, avant ? JSON.parse(avant) : null); }
    catch (e) {
      if (!(e instanceof Arret)) throw e;
      console.log('Ville gardée telle qu\'hier, à vérifier par Alex : ' + e.message);
      if (avant) aEcrire.push({ f, nouveau: avant, avant, slug: v.slug });
      continue;
    }
    { const m = releveManquant(d, v.ville || v.slug); if (m) { console.log('Ville laissée de côté, relevé de cartes manquant : ' + (v.ville || v.slug) + ' (' + m + ')'); continue; } }
    // Le fichier de données est public (servi tel quel) : aucun nom de promoteur ni de commercialisateur n'y figure (décision d'Alex du 25/11/2026).
    // On garde le nombre de vrais promoteurs, compté avant d'effacer.
    { const COMM = /^(iselection|accueil immobilier|valority|wemo)\b|agr[ée]gateur/i;
      const vrais = new Set((d.programmes || []).filter(p => !p.picking).map(p => String(p.promoteur || '').trim()).filter(n => n && !COMM.test(n)));
      if (d.chiffres) d.chiffres.nb_promoteurs = vrais.size; // seulement les programmes en vente (pas le picking), commercialisateurs exclus
      for (const p of d.programmes || []) p.promoteur = ''; }
    aEcrire.push({ f, nouveau: JSON.stringify(d, null, 2) + '\n', avant, slug: v.slug });
  }
  const listeF = path.join(DONNEES, 'villes-publiees.json');
  const listeAvant = lire(listeF);
  const sauvegarde = aEcrire.map(x => ({ f: x.f, avant: x.avant })).concat([{ f: listeF, avant: listeAvant }]);
  for (const x of aEcrire) fs.writeFileSync(x.f, x.nouveau);
  fs.writeFileSync(listeF, JSON.stringify({ villes: aEcrire.map(x => x.slug).sort() }, null, 2) + '\n');
  const r = spawnSync(process.execPath, [path.join(ICI, 'fabriquer.js')], { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) {
    for (const s of sauvegarde) { if (s.avant == null) { try { fs.unlinkSync(s.f); } catch (e) {} } else fs.writeFileSync(s.f, s.avant); }
    arret('fabriquer.js a échoué : ' + (r.stderr || '').trim().split('\n').slice(0, 3).join(' | '));
  }
  console.log('OK : ' + aEcrire.map(x => x.slug + ' (' + compter(JSON.parse(x.nouveau)) + ' logements)').join(', '));
})().catch(async e => {
  const raison = e instanceof Arret ? e.message : 'erreur inattendue : ' + e.message;
  console.error('ARRÊT : ' + raison);
  process.exit(1);
});
