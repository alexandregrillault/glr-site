#!/usr/bin/env python3
"""Relevés publics d'une ville pour les pages /neuf/ (règle « Pages ville » de CLAUDE.md).
Pour chaque commune (code INSEE), écrit dans neuf/donnees/ :
  contours/<insee>.json  contour officiel (geo.api.gouv.fr, Licence Ouverte)
  lieux/<insee>.json     gares et tramways, écoles, commerces (© contributeurs OpenStreetMap, ODbL)
  parcs/<insee>.json     parcs, bois et terrains de sport de plus de 2 500 m² (idem)
Ne refait pas un fichier déjà présent (--refaire pour forcer). Aucune donnée de la pige, aucun secret.
Usage : python3 neuf/releve_osm.py 92025 92050 ...      ou      python3 neuf/releve_osm.py --dept 92
"""
import json, math, os, sys, time, urllib.parse, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(ICI, 'donnees')
OVERPASS = ['https://lz4.overpass-api.de/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
UA = {'User-Agent': 'glr-site-releve'}


def get(url, essais=4):
    for i in range(essais):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except Exception as e:
            time.sleep(2 + 3 * i)
    raise RuntimeError('échec ' + url)


def overpass(requete):
    for i in range(6):
        u = OVERPASS[i % len(OVERPASS)]
        try:
            req = urllib.request.Request(u, data=urllib.parse.urlencode({'data': requete}).encode(), headers=UA)
            return json.load(urllib.request.urlopen(req, timeout=150))['elements']
        except Exception:
            time.sleep(8 + 6 * i)
    raise RuntimeError('Overpass ne répond pas')


def points(g):
    c = g['coordinates']
    return [p for ring in (c if g['type'] == 'Polygon' else [r for poly in c for r in poly]) for p in ring[:1] and ring]


def aire(r, lat):
    kx, ky = 111320 * math.cos(math.radians(lat)), 111200
    return abs(sum(x1 * kx * y2 * ky - x2 * kx * y1 * ky for (x1, y1), (x2, y2) in zip(r, r[1:]))) / 2


def faire(insee, refaire=False):
    os.makedirs(os.path.join(D, 'contours'), exist_ok=True); os.makedirs(os.path.join(D, 'lieux'), exist_ok=True); os.makedirs(os.path.join(D, 'parcs'), exist_ok=True)
    fc = os.path.join(D, 'contours', insee + '.json')
    if refaire or not os.path.exists(fc):
        open(fc, 'w').write(json.dumps(get(f'https://geo.api.gouv.fr/communes/{insee}?fields=nom,code&format=geojson&geometry=contour'), ensure_ascii=False))
    g = json.load(open(fc))['geometry']; pts = points(g)
    lon0, lon1 = min(p[0] for p in pts) - .01, max(p[0] for p in pts) + .01
    lat0, lat1 = min(p[1] for p in pts) - .008, max(p[1] for p in pts) + .008
    bb = f'{lat0},{lon0},{lat1},{lon1}'
    fl = os.path.join(D, 'lieux', insee + '.json')
    if refaire or not os.path.exists(fl):
        q = f'[out:json][timeout:120];(node({bb})[railway=station];node({bb})[station=subway];node({bb})[railway=tram_stop];nwr({bb})[amenity=school];nwr({bb})[amenity=college];nwr({bb})[shop=supermarket];nwr({bb})[shop=mall];nwr({bb})[amenity=marketplace];);out center;'
        out, vus = [], set()
        for e in overpass(q):
            t = e.get('tags', {}); a = e.get('lat') or (e.get('center') or {}).get('lat'); o = e.get('lon') or (e.get('center') or {}).get('lon')
            if a is None: continue
            gen = 'transport' if (t.get('railway') or t.get('station')) else 'ecole' if t.get('amenity') in ('school', 'college') else 'commerce'
            nom = t.get('name') or {'ecole': 'École', 'commerce': 'Supermarché' if t.get('shop') == 'supermarket' else 'Marché', 'transport': 'Gare'}[gen]
            k = (gen, nom, round(a, 3), round(o, 3))
            if k in vus: continue
            vus.add(k); out.append({'g': gen, 'n': nom, 'a': round(a, 5), 'o': round(o, 5)})
        json.dump({'source': '© contributeurs OpenStreetMap (ODbL)', 'lieux': out}, open(fl, 'w'), ensure_ascii=False, separators=(',', ':'))
    fp = os.path.join(D, 'parcs', insee + '.json')
    if refaire or not os.path.exists(fp):
        q = f'[out:json][timeout:120];(way({bb})[leisure~"^(park|garden|pitch|stadium|sports_centre|golf_course)$"];way({bb})[landuse~"^(forest|grass|cemetery|recreation_ground|village_green)$"];way({bb})[natural=wood];relation({bb})[leisure~"^(park|sports_centre|stadium)$"];);out geom;'
        feats = []
        for e in overpass(q):
            t = e.get('tags', {}); sport = t.get('leisure') in ('pitch', 'stadium', 'sports_centre', 'golf_course')
            anneaux = [e.get('geometry', [])] if e['type'] == 'way' else [m.get('geometry', []) for m in e.get('members', []) if m.get('role') == 'outer']
            for geom in anneaux:
                r = [[round(p['lon'], 5), round(p['lat'], 5)] for p in geom]
                if len(r) >= 4 and r[0] == r[-1] and aire(r, lat0) >= 2500:
                    feats.append({'type': 'Feature', 'properties': {'g': 'sport' if sport else 'parc', 'n': t.get('name', '')}, 'geometry': {'type': 'Polygon', 'coordinates': [r]}})
        json.dump({'type': 'FeatureCollection', 'source': '© contributeurs OpenStreetMap (ODbL)', 'features': feats}, open(fp, 'w'), ensure_ascii=False, separators=(',', ':'))
    return json.load(open(fl))['lieux']


if __name__ == '__main__':
    args = sys.argv[1:]; refaire = '--refaire' in args; args = [a for a in args if a != '--refaire']
    if args[:1] == ['--dept']:
        liste = [c['code'] for c in get(f'https://geo.api.gouv.fr/departements/{args[1]}/communes?fields=code')]
    else:
        liste = args
    for i, insee in enumerate(liste, 1):
        try:
            n = faire(insee, refaire); print(f'[{i}/{len(liste)}] {insee} ok ({len(n)} lieux)', flush=True)
        except Exception as e:
            print(f'[{i}/{len(liste)}] {insee} ÉCHEC {e}', flush=True)
        time.sleep(3)
