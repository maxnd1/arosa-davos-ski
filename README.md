# Arosa · Davos Ski

A browser ski game set in a 1:1 recreation of **Arosa Lenzerheide** and **Davos Klosters** (Graubünden, Switzerland).

- Real terrain: swisstopo swissALTI3D at 2 m around both resorts (`swiss-ski/alti/`), EU-DEM for the wider area (`swiss-ski/tiles/`)
- Real pistes, piste numbers, lifts, pylons, stations, buildings and mountain restaurants from OpenStreetMap (`swiss-ski/osmdata.js`, `swiss-ski/buildings.js`)
- Landmarks at their real locations (`swiss-ski/landmarks.js`): RhB railway with trains and viaducts, Parsennbahn / Schatzalp-Bahn / Tschuggen Express funiculars (rideable), frozen lakes, churches, the Natureisbahn Davos, Schatzalp, Kirchner Museum, snow parks with kickers, rails, boxes and a halfpipe
- Time of day, changing weather and snow conditions, avalanche danger, other skiers and a ski school, snow groomers in the evening, lift opening hours, sounds, saved progress
- Standard or realistic graphics (physical sky, bloom, sharper shadows) in the settings
- Three.js renderer, no build step

## Play online

**https://maxnd1.github.io/arosa-davos-ski/** — runs in Chrome, Edge or Firefox on a computer (keyboard needed). The first load downloads about 50 MB (2 m terrain tiles) and takes 30–60 s.

## Play locally

Requires [Node.js](https://nodejs.org/). From the repository folder:

```bash
node swiss-ski/server.js
```

Then open <http://127.0.0.1:8642> in Chrome or Edge (first load takes ~30 s). Opening `index.html` directly does not work: the browser blocks reading the terrain tiles from `file://`.

## Controls

| Key | Action |
|---|---|
| Esc | menu: choose your start, settings, controls |
| A / D | roll onto the edges and turn (hold longer for a tighter carve) |
| W | tuck, or skate when slow |
| S | pizza (snowplough): gentle braking at any speed |
| Q | hockey stop (hold A or D with it to choose the side) |
| Space | jump (pop off a rail or box) |
| In the air | A / D spin, W / S front / back flip (press after take-off), Shift grab |
| E | ride the lift you are standing at |
| F | fast-forward the lift |
| K | take skis off / put them on (walk with W, jog with Shift) |
| R | after a fall: get back up with your skis on |
| T | teleport to a lift top or restaurant |
| M | map: scroll or + / − to zoom, drag to pan, click to drop in |
| C | camera mode |
| Page Up / Page Down, mouse wheel | zoom |
| Mouse drag | orbit the camera |

## Data

Map data © OpenStreetMap contributors, available under the Open Database License (ODbL).
Elevation data: swissALTI3D © swisstopo; EU-DEM via the AWS Terrain Tiles (Mapzen Terrarium) dataset.
