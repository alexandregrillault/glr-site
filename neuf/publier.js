#!/usr/bin/env node
// Met à jour les pages ville /neuf/ depuis la base, avec garde-fous (option « automatique » choisie par Alex le 25/11/2026).
//   node neuf/publier.js                     lit la base (SUPABASE_SERVICE_KEY obligatoire), écrit neuf/donnees/<slug>.json, lance fabriquer.js
//   node neuf/publier.js --alerte            en cas d'arrêt, ajoute aussi une étape dans la todo d'Alex (CRM)
//   node neuf/publier.js --depuis <dossier>  essai sans base : lit <dossier>/villes.json et <dossier>/<slug>.json
// Un garde-fou qui se déclenche arrête TOUT : rien n'est écrit, rien n'est publié, code de sortie 1.
// Aucun secret dans ce fichier : la clé de service vient de l'environnement (secret GitHub).
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ICI = __dirname;
const DONNEES = path.join(ICI, 'donnees');
const BASE = process.env.SUPABASE_URL || 'https://hydqfbxdtpmbuooexekp.supabase.co';
const CLE = process.env.SUPABASE_SERVICE_KEY || '';
const SEUIL_BAISSE = 0.30; // une ville qui perd plus de 30 % de ses logements d'un coup n'est pas publiée
const args = process.argv.slice(2);
const ALERTE = args.includes('--alerte');
const DEPUIS = args.includes('--depuis') ? args[args.indexOf('--depuis') + 1] : null;

class Arret extends Error {}
const arret = m => { throw new Arret(m); };

async function rest(chemin, opts = {}) {
  if (!CLE) arret('SUPABASE_SERVICE_KEY absente');
  const r = await fetch(BASE + '/rest/v1/' + chemin, { ...opts, headers: { apikey: CLE, Authorization: 'Bearer ' + CLE, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!r.ok) arret('la base répond ' + r.status + ' sur ' + chemin.split('?')[0]);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// ---- Garde-fou : champ interdit ----------------------------------------------------------------------------------
const CLE_PUBLIQUE = /^[0-9a-f]{12}$/;
const LOGEMENT_PERMIS = ['id', 'typo', 'pieces', 'surface', 'etage', 'exterieur'];
const PRIX_TOLERES_VIDES = ['prix_a_partir_de', 'prix_entree', 'prix_m2_moyen']; // rendus vides par la base ; un chiffre dedans arrête tout
const NOM_INTERDIT = /(^|_)(prix|prix_lot|lots?|plans?|plan_url|commission\w*|extranet|intranet|lat|lng|image|images|photo|photos)$|^immolead|^pige_interne|^id_pige$/i;

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
    for (const l of p.logements || []) {
      const en_trop = Object.keys(l).filter(k => !LOGEMENT_PERMIS.includes(k));
      if (en_trop.length) arret(nom + p.slug + ' : champs de logement non permis ' + en_trop.join(', '));
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

function controlerRelevés(d, ville) {
  if (!d.insee) arret(ville + ' : pas de code INSEE dans les données');
  for (const dossier of ['contours', 'lieux', 'parcs']) {
    if (!fs.existsSync(path.join(DONNEES, dossier, d.insee + '.json'))) arret(ville + ' : relevé public manquant (' + dossier + '/' + d.insee + '.json)');
  }
}

async function lireVilles() {
  if (DEPUIS) {
    const liste = JSON.parse(fs.readFileSync(path.join(DEPUIS, 'villes.json'), 'utf8'));
    return liste.map(v => ({ ...v, json: JSON.parse(fs.readFileSync(path.join(DEPUIS, v.slug + '.json'), 'utf8')) }));
  }
  const liste = await rest('neuf_villes?etat=eq.publiee&select=ville,slug,insee&order=slug');
  if (!liste.length) arret('aucune ville au statut « publiee » dans la base (anormal : Colombes au moins)');
  const out = [];
  for (const v of liste) {
    const json = await rest('rpc/neuf_ville_public', { method: 'POST', body: JSON.stringify({ p_ville: v.slug }) });
    if (!json) arret(v.ville + ' : la base ne rend rien pour cette ville');
    out.push({ ...v, json });
  }
  return out;
}

function lire(f) { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } }

async function alerter(raison) {
  if (!ALERTE || DEPUIS || !CLE) return;
  try {
    const sujet = 'Pages ville';
    const etape = 'Mise à jour automatique arrêtée, rien n\'a été publié : ' + raison;
    const deja = await rest('gerant_todo?sujet=eq.' + encodeURIComponent(sujet) + '&fait_le=is.null&etape=like.' + encodeURIComponent('Mise à jour automatique arrêtée*') + '&select=id');
    if (deja && deja.length) return; // une alerte non traitée suffit, pas d'empilement
    await rest('gerant_todo', { method: 'POST', body: JSON.stringify({ sujet, etape, ordre: 0, cree_par: 'Robot pages ville' }) });
  } catch (e) { console.error('alerte todo impossible : ' + e.message); }
}

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
    controlerChute(d, v.ville || v.slug, avant ? JSON.parse(avant) : null);
    controlerRelevés(d, v.ville || v.slug);
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
  await alerter(raison);
  process.exit(1);
});
