# glr-site — www.glrimmobilier.com

Lire d'abord `../CLAUDE.md` (règles communes, routine, préférences d'Alex).

Le site vitrine de GLR Immobilier et les pages que les clients ouvrent depuis les mails (rendez-vous, sélection, programmes). GitHub Pages avec le domaine `www.glrimmobilier.com` (fichier `CNAME` : ne pas y toucher). Site public, sans connexion ; les pages client lisent leurs données via les edge functions Supabase (`rdv`, `selection`, RPC `programme_public`), jamais directement dans la base.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | L'accueil du site. |
| `rdv/index.html` | Page de rendez-vous : `?v=<prenom>` (lien public d'un commercial), `?t=<jeton>` (lien personnel d'un client), `&f=visio` ou `appel`, `&p=<projet>` (préremplissage depuis une page programme). Copie de secours dans `glrimmobilier/rdv.html`. |
| `budget/index.html` | « Mon budget en 2 minutes » : `?t=<jeton du lien de rendez-vous>` (`?demo=1` pour un aperçu sans données). Même calcul que `glrimmobilier/simulateur.html` (taux du jour via `taux-marche`), envoyé en POST `action: 'budget'` sur l'edge function `rdv`. Proposée seulement après la prise de rendez-vous, et tant qu'aucun budget n'existe sur la fiche (règles dans `glrimmobilier/CLAUDE.md`, « Budget fait par le client »). `noindex`. |
| `selection/index.html` | Feuille sélection d'un client : `?t=<jeton>`. **Figée** (décision d'Alex du 02/10/2026) : aucune évolution sans demande explicite ; un bug avéré se corrige. Évolution demandée par Alex le 11/11/2026 : écart avec le loyer actuel et aides en euros sous la mensualité de chaque lot. Doit rester **identique** à `glrimmobilier/selection.html`. |
| `programme.html` + `programmes/<slug>/` | Page publique d'un programme en campagne : `?prog=<slug>&v=<prenom>`. Données : table `programmes` + RPC `programme_public`. Les photos sont dans `programmes/<slug>/`. |
| `quoi-de-neuf/` | Pages hebdo « Quoi de neuf » (~100 pages), **générées** par `pige/current/quoi_de_neuf.py` sur le Mac d'Alex : ne pas les éditer à la main, régénérer. |
| `neuf/` | Pages ville et pages programme pour le référencement local (« Immobilier neuf à <ville> »). **Pages générées** par `node neuf/fabriquer.js` à partir de `neuf/donnees/<ville>.json` : ne pas les éditer à la main. Règles dans la section « Pages ville » plus bas. |
| `plans/index.html` | Formulaire « recevoir les plans des programmes neufs de ton secteur », ouvert depuis le robot Instagram de Quoi de neuf (`?src=instagram&ref=<publication>`). Poste sur l'edge function `qdn-plans` (lead chez Théophile, source « Quoi de neuf Instagram »). Présente Quoi de neuf comme le média de GLR Immobilier (décision d'Alex du 03/11/2026), et demande l'accord de recontact (décision d'Alex du 03/11/2026). `noindex`. |
| `parrainage/index.html` | Parrainage (décisions d'Alex du 12/11/2026) : 1 000 € en carte cadeau au parrain, 500 € au filleul, à la signature chez le notaire ; tout le monde peut parrainer. Sans paramètre : « Recommander un proche » / « Recevoir mon lien » ; `?p=<code>` : page du filleul (« Prénom vous recommande GLR Immobilier »). Poste sur l'edge function `parrainage`. Liens depuis l'accueil (menu, section `#parrainage`, pied de page) et bandeau en bas de `programme.html`. Règles dans `glrimmobilier/CLAUDE.md`, « Parrainage ». |
| `mentions-legales/index.html` | Mentions légales. |
| `robots.txt`, `sitemap.xml` | Référencement. |
| `logo-glr.png`, `icone-glr.png` | Identité. Le logo est aussi servi aux mails (`www.glrimmobilier.com/logo-glr.png`) : ne pas le renommer ni le déplacer. |

## Ce qu'il faut savoir avant de toucher aux pages client

- Ce sont les pages que voient les clients : rendu irréprochable, fonds clairs, charte GLR unique figée par Alex le 23/11/2026 (bleu du logo `#005875` pour les boutons, liens et titres forts ; laiton `#B0894C` pour le décor seulement, `#8A6A2F` pour un texte d'accent ; fond `#F4F0E8`, carte `#FBF8F1`, texte `#161A1E`, texte discret `#616B75`, trait `#D8D2C5`, teinte claire `#DCE7EC` ; texte blanc sur fond bleu ou laiton ; détail dans `../CLAUDE.md` et `../glrimmobilier/CLAUDE.md`, « Charte GLR » ; l'ancien vert `#1E3A32` et l'or `#C8A96E` ne s'emploient plus), jamais de jargon technique. Vérifier sur mobile (390 px) : la plupart des clients ouvrent depuis leur téléphone.
- Une seule page sert toutes les sélections et tous les rendez-vous : ne jamais remettre en ligne une ancienne version (incident du 28/08/2026, tous les liens cassés).
- Les edge functions vérifient (HEAD, cache 5 min) que la page existe avant d'y rediriger, sinon retombent sur l'ancienne adresse github.io : ne pas renommer `rdv/` ni `selection/`.
- `rdv/index.html` et `selection/index.html` reçoivent leurs données de `?data=1` sur les edge functions `rdv` et `selection` ; les actions du client (réserver, accepter une proposition, donner un avis, poser une option) partent en POST sur les mêmes fonctions. Un changement de contrat entre la page et la fonction se fait des deux côtés, fonction d'abord.
- Jamais montrés sur la feuille sélection : TVA 10 % (LLI) et LMNP. TVA 5,5 % masquée si `qualif.tva_reduite = non`.

## Pages ville `/neuf/` — version validée par Alex le 24/11/2026

Alex a validé ce parcours sur Colombes (« je veux valider cette version pour aujourd'hui », « créer une règle avant qu'on le fasse pour toutes les villes »). **Toute nouvelle ville reprend ce parcours tel quel** ; on ne le modifie que sur sa demande, et la modification vaut alors pour toutes les villes (un seul gabarit, `neuf/fabriquer.js`).

Le parcours, dans l'ordre :

1. **Carte des départements** (`/neuf/`) : Île-de-France vue du dessus, chaque département sa teinte, liseré blanc ombré, numéro au centre, comme l'ouverture des vidéos Quoi de neuf. Ni routes ni noms. Recherche par ville au-dessus.
2. **Un département touché** : zoom dessus, ses communes dessinées ; celles qui ont une page sont teintées en bleu. Une commune sans page propose d'appeler.
3. **Une ville choisie** : vue **du dessus, à plat**. Sol épuré (fond clair, rues blanches, grands axes laiton fins, Seine et parcs en couleur), limite de la ville en trait bleu sur liseré blanc, villes voisines gardées mais pâlies. **Aucun immeuble en relief sur la carte.** Repères des programmes (bleu ; laiton = picking), qui restent à leur place quand on bouge. Gares et tramways avec leur nom dès la vue de la ville ; commerces au premier cran de zoom (13,1), écoles au suivant (13,9), nom au survol. Molette et déplacement libres. Au survol d'un repère : nom du programme et date de livraison.
4. **Un programme touché** : court zoom, fondu, puis **la page du programme** (jamais une vue 3D seule, jamais de « vue quartier » sur la carte). En-tête avec les repères chiffrés ; **une seule vue** mêlant plan de masse et maquette : l'immeuble de trois-quarts sur son terrain, la **liste d'étages** à gauche ; choisir un étage fait partir les étages du dessus et affiche les appartements avec typologie et surface ; « Tout » remet l'immeuble entier. Liste des lots à côté (dessous sur téléphone), filtres par typologie, les trois se répondent. Bouton « Retour à la carte de <ville> », qui ramène directement sur la ville.
5. **Boussole** toujours affichée en bas à gauche, de la carte des départements à l'immeuble : pointe bleue marquée N, un appui remet le nord en haut.

Règles de contenu, non négociables :

- **Prix visibles sans compte, plans seulement avec un compte.** Les prix ne sont jamais écrits dans les pages ni dans ce dépôt (public) : la page les demande à l'edge function `neuf-prix`, qui limite l'aspiration. Deux prix quand ils existent (TVA 20 % et TVA 5,5 % « sous conditions de ressources »).
- `fabriquer.js` **refuse** tout fichier contenant un prix de lot, un plan, une commission, un numéro de lot ou un identifiant interne de la pige (seules les clés publiques de 12 caractères passent). Ne jamais contourner ce refus.
- Programmes sans mandat : seuls ceux de source **picking** sont montrés, avec la mention « Picking » et « grille sur demande » ; les autres sans mandat jamais. Jamais LLI ni LMNP.
- Seulement les lots libres de type appartement ou maison.
- **Optionné = libre** (décision d'Alex du 25/11/2026 : « optionné et libre = libre, je vois pas les pastilles mais c'est pas grave si le client est interessé et qu'il ne connait pas l'option ça peut lui faire peur. »). Les lots optionnés sont exportés avec les libres (statut `option` accepté par `fabriquer.js`), mais la page les présente exactement comme des libres : ni pastille, ni mot « optionné », ni « dont N optionnés » ; le compteur « logements disponibles » additionne libres et optionnés.
- **Jamais un nom de promoteur ni de commercialisateur** (décision d'Alex du 25/11/2026 : « je veux jamais qu'on affiche les noms des promoteurs ou commercialisateur », après « masque le promoteur et garde les deux fiches » pour Opus et Opus 2). Aucune page ville ni aucun fichier de `donnees/` (public) ne porte un nom : `fabriquer.js` et `publier.js` effacent le champ `promoteur` de tous les programmes, et ne gardent que le nombre de vrais promoteurs (commercialisateurs exclus : iSelection, Accueil Immobilier, Valority, Wemo, « agrégateur »). Les lots restent de vrais lots, prix toujours visibles, plans avec un compte. Deux programmes à la même adresse restent deux fiches distinctes, la carte les réunit en un repère groupé « N programmes ici ».
- **Visite 3D** (décisions d'Alex du 27/11/2026 : « Après le formulaire », « mets les leads chez moi, et garde les numéros de lots »). Aucun fichier de plan ni de visite dans ce dépôt public. La base ajoute `visite_3d: true` au programme et `v3d: true` aux lots visitables (seuls champs acceptés, booleans vrais seulement). Sur la fiche, seulement si `visite_3d` : **l'immeuble 3D de Plans 3D remplace la maquette automatique, sans formulaire** (décision d'Alex du 27/11/2026 : « je veux que le client voit le nouvelle immeuble qu'on a mis en place et il pourra voir les plans uniquement si il a un compte »), chargé (1,4 Mo) seulement quand il arrive à l'écran ou au toucher ; le formulaire d'accès (`#compte` : prénom, téléphone, e-mail, accord) n'est demandé qu'au toucher d'un logement (message du cadre) ou d'un bouton « Visite 3D » ; ces pages n'utilisent plus `programme.js` (filtres repris dans `visite3d.js`). `neuf/visite3d.js` : jeton gardé dans le navigateur, fichier demandé à l'edge function `plans-3d` (lien temporaire de 5 minutes ; immeuble sans paramètre `l`, logement avec `l`), ouvert dans un cadre par un blob, messages du cadre acceptés seulement s'ils viennent de ce cadre et portent une clé de lot connue. Les programmes sans visite gardent la maquette automatique. Tant qu'aucun programme n'a `visite_3d`, les pages ne changent pas.
- Charte GLR unique ; rien n'est posé par-dessus une vue (fiches et réglages dessous) ; boutons en toutes lettres.
- Une ville n'est publiée (retirée du `noindex`, liée depuis le site, ajoutée au sitemap) que sur un « pousse » d'Alex, avec de vraies données. Liste des villes fabriquées : `donnees/villes-publiees.json`, écrit par `publier.js` d'après les villes « publiee » de la base (Colombes seule au 25/11/2026).

Par ville, trois relevés à fournir en plus du JSON (le robot) : contour de la commune (`donnees/contours/<insee>.json`, geo.api.gouv.fr), lieux (`donnees/lieux/<insee>.json`) et espaces verts (`donnees/parcs/<insee>.json`), tous deux tirés d'OpenStreetMap. Le format complet est dans la note partagée « Pages ville - format des données ».

À savoir avant de généraliser (état au 25/11/2026) : Colombes est en **vraies données** depuis le 25/11/2026 (21 programmes, lues dans la base par `neuf/publier.js` avec la clé publique ; la liste des villes fabriquées est `donnees/villes-publiees.json`, à défaut Colombes seule) ; la maquette et le décor autour de l'immeuble sont génériques (forme réelle, orientation et vrais voisins inconnus) ; la fluidité sur un vrai téléphone n'a pas été mesurée ; `carte.js` garde en sommeil le code de l'ancienne vue quartier, à supprimer si Alex confirme.

## Vérifier avant de commiter

Même recette que le CRM : `node --check` sur chaque bloc `<script>` (le script est dans `../glrimmobilier/CLAUDE.md`), rendu Playwright en 390 px et en bureau, et pour une page client, un passage avec des données simulées (`?t=` + réponse `?data=1` interceptée).

Quand `rdv/index.html` ou `selection/index.html` change, appliquer la même modification à la copie dans `glrimmobilier/` dans le même commit, et le dire à Alex (deux dépôts à pousser).
