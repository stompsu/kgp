# Data

- `peaks.json`: the 28 official Korona Gór Polski peaks (name, range, height per https://kgp.info.pl/wykaz-szczytow/).
  Coordinates are `null` until they are verified in M1. Known disputes about which summit is really the highest are recorded in `notes`.
  The app always uses the official KGP peak.
- `osm/`: GeoJSON exports of parking and hiking trails near each summit (generated in M3 by `scripts/`).
- `scripts/`: offline import scripts (Overpass). Never called from the browser.

## Licensing
Map, parking and trail data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the ODbL.
Attribution must be visible in the app wherever this data is shown.
