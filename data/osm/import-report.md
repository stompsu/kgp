# OSM import report

- Date: 2026-11-17
- Overpass endpoint(s) used: https://maps.mail.ru/osm/tools/overpass/api/interpreter, https://overpass-api.de/api/interpreter
- Script: `data/scripts/import_osm.py` (queries and processing rules in its header)
- Parking: `amenity=parking` within 10 km, access not private/no, nearest 10
- Trails: `route=hiking` relations with a member way within 250 m of the summit, clipped to 10 km, simplified 15 m
- Totals: 280 parking, 112 trails
- File sizes: `parking.geojson` 56 KB, `trails.geojson` 307 KB
- Data (c) OpenStreetMap contributors, ODbL.

| # | Peak | Parking | Trails | Trail colours |
|---|---|---|---|---|
| 1 | Łysica | 10 | 4 | ?, blue, red |
| 2 | Ślęża | 10 | 6 | black, blue, red, yellow |
| 3 | Skopiec | 10 | 4 | blue, red, yellow |
| 4 | Kłodzka Góra | 10 | 4 | blue, red, yellow |
| 5 | Chełmiec | 10 | 8 | ?, black, blue, green, red, yellow |
| 6 | Biskupia Kopa | 10 | 4 | blue, green, red, yellow |
| 7 | Lubomir | 10 | 3 | green, red |
| 8 | Szczeliniec Wielki | 10 | 3 | blue, green |
| 9 | Czupel | 10 | 2 | ?, blue |
| 10 | Waligóra | 10 | 5 | ?, black, blue, yellow |
| 11 | Skalnik | 10 | 3 | blue, red |
| 12 | Jagodna | 10 | 1 | blue |
| 13 | Kowadło | 10 | 4 | blue, green, yellow |
| 14 | Lackowa | 10 | 3 | ?, red, yellow |
| 15 | Wielka Sowa | 10 | 10 | ?, black, blue, green, red, yellow |
| 16 | Wysoka | 10 | 4 | ?, blue, green |
| 17 | Orlica | 10 | 5 | green, red |
| 18 | Rudawiec | 10 | 2 | green, red |
| 19 | Wysoka Kopa | 10 | 1 | red |
| 20 | Mogielica | 10 | 5 | blue, green, red, yellow |
| 21 | Skrzyczne | 10 | 2 | blue, green |
| 22 | Radziejowa | 10 | 3 | blue, red |
| 23 | Turbacz | 10 | 4 | blue, green, red, yellow |
| 24 | Tarnica | 10 | 1 | yellow |
| 25 | Śnieżnik | 10 | 7 | ?, blue, green, red, yellow |
| 26 | Śnieżka | 10 | 4 | blue, red, yellow |
| 27 | Babia Góra | 10 | 8 | ?, blue, green, red, yellow |
| 28 | Rysy | 10 | 2 | red |

## Peaks using the 500 m fallback

No marked trail passes within 250 m of these summits, so trails within 500 m are listed:
- Wysoka Kopa

## Peaks with no trails

None.

## Peaks with no parking

None.
