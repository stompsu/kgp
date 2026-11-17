"""Import parking and marked hiking trails around every KGP summit from OpenStreetMap (Overpass).

Usage: python3 -I data/scripts/import_osm.py [--cache DIR] [--repo DIR]
  Needs a Python 3 with a current OpenSSL: the macOS /usr/bin/python3 (3.9, LibreSSL 2.8) fails the TLS
  handshake with overpass-api.de; e.g. Homebrew python3.14 works.
  --repo   repository root (default: two levels above this script)
  --cache  directory for raw Overpass responses, outside the repo (default: $TMPDIR/kgp-overpass-cache).
           Reruns read from the cache and do not re-query; delete it to refresh.

Writes data/osm/parking.geojson, data/osm/trails.geojson and data/osm/import-report.md.
Feature shapes and selection rules: docs/api.md, section "Parking and trails (M3)".
Summit coordinates come from data/peaks.json and are never changed here.

Politeness (https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances):
User-Agent `kgp-companion-import` (no personal data), at least 2 s between queries, retry with
exponential backoff on 429/502/503/504/timeouts, and fall back to the next public endpoint when one is overloaded.

Endpoints, tried in order:
  https://overpass-api.de/api/interpreter
  https://overpass.private.coffee/api/interpreter
  https://maps.mail.ru/osm/tools/overpass/api/interpreter
  https://overpass.openstreetmap.fr/api/interpreter   (OSM France instance, full planet)

Queries: peaks are batched in groups of PEAKS_PER_QUERY (= 7, so 4 + 4 queries in total) to keep the load on the
public instances low; results are assigned to peaks locally. For each group, with one `around` line per peak
({lat},{lon} = summit from peaks.json):
  Parking (10 km radius, areas as their centre):
    [out:json][timeout:300];
    (
      nwr[amenity=parking](around:10000,{lat},{lon});
      ...
    );
    out center tags;
  Trails (route=hiking relations with a member way within 250 m of a summit, full member geometry):
    [out:json][timeout:600];
    (
      way(around:250,{lat},{lon});
      ...
    )->.w;
    rel(bw.w)[route=hiking];
    out geom;
  A relation belongs to a peak when one of its member ways passes within 250 m of that summit
  (point-to-segment distance in a local metric projection, which matches Overpass `around`).
  Fallback: a peak with no such relation is queried again on its own with around:500 (TRAIL_FALLBACK_M).
  The report lists every peak that needed it (Wysoka Kopa: the summit is ~400 m off the red Główny Szlak Sudecki).

Processing: parking with access=private|no is skipped; nearest 10 kept (haversine).
Trails: member ways are joined end to end, clipped to a 10 km circle around the summit (lines are split
where they leave it), simplified with Douglas-Peucker (15 m) in a local equirectangular projection and
rounded to 5 decimals. Relations whose clipped geometry is empty are dropped.
Data (c) OpenStreetMap contributors, ODbL.
"""
import argparse, datetime, hashlib, json, math, os, sys, tempfile, time, urllib.error, urllib.parse, urllib.request

ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter',
]
USER_AGENT = 'kgp-companion-import'
MIN_INTERVAL_S = 2.0
PARKING_RADIUS_M = 10000
PARKING_MAX = 10
TRAIL_SEARCH_M = 250
TRAIL_FALLBACK_M = 500  # only for a peak with no trail within TRAIL_SEARCH_M; flagged in the report
CLIP_RADIUS_M = 10000
SIMPLIFY_M = 15.0
EARTH_R = 6371008.8

PEAKS_PER_QUERY = 7


def parking_query(peaks):
    arounds = '\n'.join(f"  nwr[amenity=parking](around:{PARKING_RADIUS_M},{p['latitude']},{p['longitude']});" for p in peaks)
    return f"[out:json][timeout:300];\n(\n{arounds}\n);\nout center tags;"


def trails_query(peaks, radius=TRAIL_SEARCH_M):
    arounds = '\n'.join(f"  way(around:{radius},{p['latitude']},{p['longitude']});" for p in peaks)
    return f"[out:json][timeout:600];\n(\n{arounds}\n)->.w;\nrel(bw.w)[route=hiking];\nout geom;"

NETWORK_ORDER = {'iwn': 0, 'nwn': 1, 'rwn': 2, 'lwn': 3}
COLOURS = {
    'red': 'red', 'czerwony': 'red', 'czerwona': 'red', 'cervena': 'red', 'červená': 'red', '#ff0000': 'red', '#f00': 'red',
    'blue': 'blue', 'niebieski': 'blue', 'niebieska': 'blue', 'modra': 'blue', '#0000ff': 'blue', '#00f': 'blue',
    'green': 'green', 'zielony': 'green', 'zielona': 'green', 'zelena': 'green', 'zelená': 'green', '#008000': 'green', '#00ff00': 'green', '#0f0': 'green',
    'yellow': 'yellow', 'żółty': 'yellow', 'zolty': 'yellow', 'żółta': 'yellow', 'zluta': 'yellow', 'žlutá': 'yellow', '#ffff00': 'yellow', '#ff0': 'yellow',
    'black': 'black', 'czarny': 'black', 'czarna': 'black', 'cerna': 'black', 'černá': 'black', '#000000': 'black', '#000': 'black',
}

_last_query = [0.0]
endpoints_used = set()
dead = set()


def overpass(query, cache_dir):
    """Return parsed Overpass JSON for `query`, from cache if present."""
    key = hashlib.sha256(query.encode()).hexdigest()[:24]
    path = os.path.join(cache_dir, key + '.json')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            cached = json.load(f)
        endpoints_used.add(cached['endpoint'])
        return cached['response']
    data = urllib.parse.urlencode({'data': query}).encode()
    for endpoint in ENDPOINTS:
        if endpoint in dead:
            continue
        for attempt in range(3):
            wait = _last_query[0] + MIN_INTERVAL_S - time.time()
            if wait > 0:
                time.sleep(wait)
            _last_query[0] = time.time()
            req = urllib.request.Request(endpoint, data=data, headers={'User-Agent': USER_AGENT})
            try:
                with urllib.request.urlopen(req, timeout=660) as r:
                    res = json.load(r)
                if 'remark' in res and 'runtime error' in res['remark']:
                    raise RuntimeError(res['remark'])
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump({'endpoint': endpoint, 'query': query, 'response': res}, f)
                endpoints_used.add(endpoint)
                return res
            except urllib.error.HTTPError as e:
                if e.code not in (429, 502, 503, 504):
                    raise
                err = f'HTTP {e.code}'
            except (OSError, RuntimeError, ValueError) as e:  # URLError, socket timeouts, bad JSON
                err = repr(e)
                if 'timed out' in err:  # a hanging instance: don't wait on it again
                    print(f'  {endpoint}: {err}', file=sys.stderr)
                    break
            backoff = 5 * 2 ** attempt
            print(f'  {endpoint}: {err}; retry in {backoff}s', file=sys.stderr)
            time.sleep(backoff)
        print(f'  giving up on {endpoint}, trying next endpoint', file=sys.stderr)
        dead.add(endpoint)  # overloaded: skip it for the rest of this run
    raise SystemExit('All Overpass endpoints failed for query:\n' + query)


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R * math.asin(math.sqrt(a))


def osm_id(el):
    return f"{el['type']}/{el['id']}"


def parse_fee(v):
    return {'yes': True, 'no': False}.get((v or '').strip().lower())


def parse_capacity(v):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def parking_features(peak, res):
    lat0, lon0 = peak['latitude'], peak['longitude']
    feats = []
    for el in res['elements']:
        tags = el.get('tags', {})
        if tags.get('access', '').strip().lower() in ('private', 'no'):
            continue
        c = el.get('center') or ({'lat': el['lat'], 'lon': el['lon']} if 'lat' in el else None)
        if not c:
            continue
        d = haversine(lat0, lon0, c['lat'], c['lon'])
        if d > PARKING_RADIUS_M:
            continue
        feats.append({'type': 'Feature',
                      'geometry': {'type': 'Point', 'coordinates': [round(c['lon'], 5), round(c['lat'], 5)]},
                      'properties': {'peakSlug': peak['slug'], 'osmId': osm_id(el), 'name': tags.get('name') or None,
                                     'fee': parse_fee(tags.get('fee')), 'capacity': parse_capacity(tags.get('capacity')),
                                     'distanceMeters': int(round(d))}})
    feats.sort(key=lambda f: (f['properties']['distanceMeters'], f['properties']['osmId']))
    return feats[:PARKING_MAX]


# --- trail geometry, in local metres around the summit -------------------------------------------------
class Local:
    def __init__(self, lat0, lon0):
        self.lat0, self.lon0 = lat0, lon0
        self.kx = math.radians(1) * EARTH_R * math.cos(math.radians(lat0))
        self.ky = math.radians(1) * EARTH_R

    def fwd(self, lon, lat):
        return ((lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky)

    def inv(self, x, y):
        return (self.lon0 + x / self.kx, self.lat0 + y / self.ky)


def join_ways(ways):
    """Join way point lists sharing endpoints into longer lines (order/direction agnostic)."""
    lines = [list(w) for w in ways if len(w) >= 2]
    out = []
    while lines:
        cur = lines.pop()
        changed = True
        while changed:
            changed = False
            for i, l in enumerate(lines):
                if l[0] == cur[-1]:
                    cur += l[1:]
                elif l[-1] == cur[-1]:
                    cur += l[::-1][1:]
                elif l[-1] == cur[0]:
                    cur = l[:-1] + cur
                elif l[0] == cur[0]:
                    cur = l[::-1][:-1] + cur
                else:
                    continue
                lines.pop(i)
                changed = True
                break
        out.append(cur)
    return out


def circle_cross(a, b, r):
    """Parameters t in (0,1) where segment a->b crosses the circle |p| = r."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    A = dx * dx + dy * dy
    if A == 0:
        return []
    B = 2 * (a[0] * dx + a[1] * dy)
    C = a[0] ** 2 + a[1] ** 2 - r * r
    disc = B * B - 4 * A * C
    if disc < 0:
        return []
    s = math.sqrt(disc)
    return sorted(t for t in ((-B - s) / (2 * A), (-B + s) / (2 * A)) if 0 < t < 1)


def clip_circle(line, r):
    """Split a projected polyline into the parts lying inside the circle of radius r around the origin."""
    parts, cur = [], []
    inside = lambda p: p[0] ** 2 + p[1] ** 2 <= r * r
    for i, p in enumerate(line):
        if i == 0:
            if inside(p):
                cur.append(p)
            continue
        a = line[i - 1]
        for t in circle_cross(a, p, r):
            q = (a[0] + t * (p[0] - a[0]), a[1] + t * (p[1] - a[1]))
            if cur:  # leaving
                cur.append(q)
                parts.append(cur)
                cur = []
            else:  # entering
                cur = [q]
        if inside(p):
            if not cur:
                cur = [p]
            else:
                cur.append(p)
        elif cur:  # numeric edge case: left without a detected crossing
            parts.append(cur)
            cur = []
    if cur:
        parts.append(cur)
    return [pt for pt in parts if len(pt) >= 2]


def douglas_peucker(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = pts[i]
        bx, by = pts[j]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        dmax, idx = -1.0, -1
        for k in range(i + 1, j):
            px, py = pts[k]
            d = abs(dy * (px - ax) - dx * (py - ay)) / L if L else math.hypot(px - ax, py - ay)
            if d > dmax:
                dmax, idx = d, k
        if dmax > tol:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(pts, keep) if k]


def normalize_colour(tags):
    c = (tags.get('colour') or '').strip().lower()
    if c in COLOURS:
        return COLOURS[c]
    sym = (tags.get('osmc:symbol') or '').strip().lower()
    if sym:
        return COLOURS.get(sym.split(':')[0].strip())
    return None


def trail_feature(peak, rel):
    loc = Local(peak['latitude'], peak['longitude'])
    seen, ways = set(), []
    for m in rel.get('members', []):
        if m.get('type') != 'way' or not m.get('geometry') or m['ref'] in seen:
            continue
        seen.add(m['ref'])
        ways.append([(g['lon'], g['lat']) for g in m['geometry'] if g])
    parts = []
    for line in join_ways(ways):
        for part in clip_circle([loc.fwd(*p) for p in line], CLIP_RADIUS_M):
            simple = douglas_peucker(part, SIMPLIFY_M)
            coords = []
            for x, y in simple:
                lon, lat = loc.inv(x, y)
                c = [round(lon, 5), round(lat, 5)]
                if not coords or coords[-1] != c:
                    coords.append(c)
            if len(coords) >= 2:
                parts.append(coords)
    if not parts:
        return None
    parts.sort(key=lambda p: -len(p))
    geom = {'type': 'LineString', 'coordinates': parts[0]} if len(parts) == 1 else \
           {'type': 'MultiLineString', 'coordinates': parts}
    tags = rel.get('tags', {})
    net = (tags.get('network') or '').strip().lower()
    return {'type': 'Feature', 'geometry': geom,
            'properties': {'peakSlug': peak['slug'], 'osmId': osm_id(rel), 'name': tags.get('name') or None,
                           'ref': tags.get('ref') or None, 'colour': normalize_colour(tags),
                           'network': net if net in NETWORK_ORDER else None}}


def seg_dist0(a, b):
    """Distance from the origin to segment a-b (projected metres)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, -(a[0] * dx + a[1] * dy) / L2))
    return math.hypot(a[0] + t * dx, a[1] + t * dy)


def near_summit(peak, rel, radius):
    loc = Local(peak['latitude'], peak['longitude'])
    for m in rel.get('members', []):
        if m.get('type') != 'way' or not m.get('geometry'):
            continue
        pts = [loc.fwd(g['lon'], g['lat']) for g in m['geometry'] if g]
        if len(pts) == 1 and math.hypot(*pts[0]) <= radius:
            return True
        if any(seg_dist0(pts[i - 1], pts[i]) <= radius for i in range(1, len(pts))):
            return True
    return False


def trail_features(peak, res, radius=TRAIL_SEARCH_M):
    feats = []
    for rel in res['elements']:
        if rel.get('type') != 'relation' or rel.get('tags', {}).get('route') != 'hiking':
            continue
        if not near_summit(peak, rel, radius):
            continue
        f = trail_feature(peak, rel)
        if f:
            feats.append(f)
    key = lambda f: (NETWORK_ORDER.get(f['properties']['network'], 4), f['properties']['name'] is None,
                     f['properties']['name'] or '', f['properties']['osmId'])
    return sorted(feats, key=key)


def write_geojson(path, feats):
    with open(path, 'w', encoding='utf-8') as f:
        f.write('{"type":"FeatureCollection","features":[\n')
        f.write(',\n'.join(json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in feats))
        f.write('\n]}\n')


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default=os.path.dirname(os.path.dirname(here)))
    ap.add_argument('--cache', default=os.path.join(tempfile.gettempdir(), 'kgp-overpass-cache'))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    data_dir = os.path.join(args.repo, 'data')
    out_dir = os.path.join(data_dir, 'osm')
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(data_dir, 'peaks.json'), encoding='utf-8') as f:
        peaks = json.load(f)['peaks']

    parking, trails, counts = [], [], []
    for i in range(0, len(peaks), PEAKS_PER_QUERY):
        group = peaks[i:i + PEAKS_PER_QUERY]
        print('peaks ' + ', '.join(p['name'] for p in group), file=sys.stderr)
        pk_res = overpass(parking_query(group), args.cache)
        tr_res = overpass(trails_query(group), args.cache)
        for p in group:
            pk, tr = parking_features(p, pk_res), trail_features(p, tr_res)
            print(f"  {p['number']:2} {p['name']}: {len(pk)} parking, {len(tr)} trails", file=sys.stderr)
            parking += pk
            trails += tr
            counts.append([p, len(pk), len(tr), tr])

    # A summit slightly off the marked network (e.g. Wysoka Kopa): retry that peak alone with a wider radius.
    fallback = []
    for c in counts:
        if c[2] == 0:
            p = c[0]
            tr = trail_features(p, overpass(trails_query([p], TRAIL_FALLBACK_M), args.cache), TRAIL_FALLBACK_M)
            print(f"  {p['number']:2} {p['name']}: no trail within {TRAIL_SEARCH_M} m, {len(tr)} within {TRAIL_FALLBACK_M} m",
                  file=sys.stderr)
            if tr:
                c[2], c[3] = len(tr), tr
                fallback.append(p['name'])
    trails = [f for c in counts for f in c[3]]

    pk_path, tr_path = os.path.join(out_dir, 'parking.geojson'), os.path.join(out_dir, 'trails.geojson')
    write_geojson(pk_path, parking)
    write_geojson(tr_path, trails)

    kb = lambda pth: f'{os.path.getsize(pth) / 1024:.0f} KB'
    lines = ['# OSM import report', '',
             f'- Date: {datetime.date.today().isoformat()}',
             '- Overpass endpoint(s) used: ' + ', '.join(sorted(endpoints_used)),
             '- Script: `data/scripts/import_osm.py` (queries and processing rules in its header)',
             f'- Parking: `amenity=parking` within {PARKING_RADIUS_M // 1000} km, access not private/no, nearest {PARKING_MAX}',
             f'- Trails: `route=hiking` relations with a member way within {TRAIL_SEARCH_M} m of the summit, '
             f'clipped to {CLIP_RADIUS_M // 1000} km, simplified {SIMPLIFY_M:.0f} m',
             f'- Totals: {len(parking)} parking, {len(trails)} trails',
             f'- File sizes: `parking.geojson` {kb(pk_path)}, `trails.geojson` {kb(tr_path)}',
             '- Data (c) OpenStreetMap contributors, ODbL.', '',
             '| # | Peak | Parking | Trails | Trail colours |', '|---|---|---|---|---|']
    for p, npk, ntr, tr in counts:
        cols = ', '.join(sorted({f['properties']['colour'] or '?' for f in tr}))
        lines.append(f"| {p['number']} | {p['name']} | {npk} | {ntr} | {cols} |")
    zero_tr = [p['name'] for p, _, n, _ in counts if n == 0]
    lines += ['', f'## Peaks using the {TRAIL_FALLBACK_M} m fallback', '',
              (f'No marked trail passes within {TRAIL_SEARCH_M} m of these summits, so trails within {TRAIL_FALLBACK_M} m are listed:\n- '
               + '\n- '.join(fallback)) if fallback else 'None.']
    zero_pk = [p['name'] for p, n, _, _ in counts if n == 0]
    lines += ['', '## Peaks with no trails', '', ('- ' + '\n- '.join(zero_tr)) if zero_tr else 'None.',
              '', '## Peaks with no parking', '', ('- ' + '\n- '.join(zero_pk)) if zero_pk else 'None.', '']
    with open(os.path.join(out_dir, 'import-report.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print('\n'.join(lines), file=sys.stderr)


if __name__ == '__main__':
    main()
