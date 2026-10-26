# glr-site — www.glrimmobilier.com

Lire d'abord `../CLAUDE.md` (règles communes, routine, préférences d'Alex).

Le site vitrine de GLR Immobilier et les pages que les clients ouvrent depuis les mails (rendez-vous, sélection, programmes). GitHub Pages avec le domaine `www.glrimmobilier.com` (fichier `CNAME` : ne pas y toucher). Site public, sans connexion ; les pages client lisent leurs données via les edge functions Supabase (`rdv`, `selection`, RPC `programme_public`), jamais directement dans la base.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | L'accueil du site. |
| `rdv/index.html` | Page de rendez-vous : `?v=<prenom>` (lien public d'un commercial), `?t=<jeton>` (lien personnel d'un client), `&f=visio` ou `appel`, `&p=<projet>` (préremplissage depuis une page programme). Copie de secours dans `glrimmobilier/rdv.html`. |
| `selection/index.html` | Feuille sélection d'un client : `?t=<jeton>`. **Figée** (décision d'Alex du 02/10/2026) : aucune évolution sans demande explicite ; un bug avéré se corrige. Doit rester **identique** à `glrimmobilier/selection.html`. |
| `programme.html` + `programmes/<slug>/` | Page publique d'un programme en campagne : `?prog=<slug>&v=<prenom>`. Données : table `programmes` + RPC `programme_public`. Les photos sont dans `programmes/<slug>/`. |
| `quoi-de-neuf/` | Pages hebdo « Quoi de neuf » (~100 pages), **générées** par `pige/current/quoi_de_neuf.py` sur le Mac d'Alex : ne pas les éditer à la main, régénérer. |
| `mentions-legales/index.html` | Mentions légales. |
| `robots.txt`, `sitemap.xml` | Référencement. |
| `logo-glr.png`, `icone-glr.png` | Identité. Le logo est aussi servi aux mails (`www.glrimmobilier.com/logo-glr.png`) : ne pas le renommer ni le déplacer. |

## Ce qu'il faut savoir avant de toucher aux pages client

- Ce sont les pages que voient les clients : rendu irréprochable, fonds clairs, charte GLR (vert #1E3A32, crème #FBF8F1, laiton #B0894C), jamais de jargon technique. Vérifier sur mobile (390 px) : la plupart des clients ouvrent depuis leur téléphone.
- Une seule page sert toutes les sélections et tous les rendez-vous : ne jamais remettre en ligne une ancienne version (incident du 28/08/2026, tous les liens cassés).
- Les edge functions vérifient (HEAD, cache 5 min) que la page existe avant d'y rediriger, sinon retombent sur l'ancienne adresse github.io : ne pas renommer `rdv/` ni `selection/`.
- `rdv/index.html` et `selection/index.html` reçoivent leurs données de `?data=1` sur les edge functions `rdv` et `selection` ; les actions du client (réserver, accepter une proposition, donner un avis, poser une option) partent en POST sur les mêmes fonctions. Un changement de contrat entre la page et la fonction se fait des deux côtés, fonction d'abord.
- Jamais montrés sur la feuille sélection : TVA 10 % (LLI) et LMNP. TVA 5,5 % masquée si `qualif.tva_reduite = non`.

## Vérifier avant de commiter

Même recette que le CRM : `node --check` sur chaque bloc `<script>` (le script est dans `../glrimmobilier/CLAUDE.md`), rendu Playwright en 390 px et en bureau, et pour une page client, un passage avec des données simulées (`?t=` + réponse `?data=1` interceptée).

Quand `rdv/index.html` ou `selection/index.html` change, appliquer la même modification à la copie dans `glrimmobilier/` dans le même commit, et le dire à Alex (deux dépôts à pousser).
