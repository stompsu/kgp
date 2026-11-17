"""Look up OSM summit candidates for every peak in data/peaks.json via Nominatim.

Usage: python3 -I data/scripts/lookup_coordinates.py data/peaks.json
Prints candidates (ele, lat, lon). Pick the one whose ele matches the KGP height; border peaks
(Biskupia Kopa, Orlica, Snieznik) are tagged with bilingual names and need a manual query.
Respects the Nominatim usage policy: 1 request/second, generic User-Agent, no personal data.
"""
import json, sys, time, urllib.parse, urllib.request
peaks = json.load(open(sys.argv[1]))['peaks']
out = {}
for p in peaks:
    q = urllib.parse.urlencode({'q': p['name'], 'countrycodes': 'pl', 'format': 'jsonv2',
                                'extratags': 1, 'limit': 10, 'layer': 'natural'})
    req = urllib.request.Request('https://nominatim.openstreetmap.org/search?' + q,
                                 headers={'User-Agent': 'kgp-companion-import'})
    res = json.load(urllib.request.urlopen(req, timeout=30))
    cands = [r for r in res if r.get('type') in ('peak', 'volcano')]
    out[p['slug']] = [{'osm': f"{r['osm_type']}/{r['osm_id']}", 'lat': float(r['lat']), 'lon': float(r['lon']),
                       'ele': (r.get('extratags') or {}).get('ele'), 'name': r['name'], 'display': r['display_name'][:90]}
                      for r in cands]
    time.sleep(1.2)
json.dump(out, open('nominatim.json', 'w'), ensure_ascii=False, indent=1)
for p in peaks:
    c = out[p['slug']]
    print(f"{p['number']:2} {p['name']:20} kgp={p['heightMeters']:5} n={len(c)} ", [(x['ele'], round(x['lat'],4), round(x['lon'],4)) for x in c][:5])
