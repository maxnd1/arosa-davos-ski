# Arosa · Davos Ski

A browser ski game set in a 1:1 recreation of **Arosa Lenzerheide** and **Davos Klosters** (Graubünden, Switzerland).

- Real terrain from the EU-DEM elevation model (`swiss-ski/tiles/`, 70 Terrarium tiles at zoom 13)
- Real pistes, piste numbers, lifts, pylons, stations, buildings and mountain restaurants from OpenStreetMap (`swiss-ski/osmdata.js`, `swiss-ski/buildings.js`)
- Three.js renderer, no build step

## Play

Requires [Node.js](https://nodejs.org/). From the repository folder:

```bash
node swiss-ski/server.js
```

Then open <http://127.0.0.1:8642> in Chrome or Edge (first load takes ~20 s). Opening `index.html` directly does not work: the browser blocks reading the terrain tiles from `file://`.

## Controls

| Key | Action |
|---|---|
| Esc | menu: choose your start, settings, controls |
| A / D | roll onto the edges and turn (hold longer for a tighter carve) |
| W | tuck, or skate when slow |
| S | snowplough, or hockey stop at speed |
| Space | jump |
| E | ride the lift you are standing at |
| F | fast-forward the lift |
| K | take skis off / put them on (walk with W, jog with Shift) |
| T | teleport to a lift top or restaurant |
| M | map: scroll or + / − to zoom, drag to pan, click to drop in |
| C | camera mode |
| Page Up / Page Down, mouse wheel | zoom |
| Mouse drag | orbit the camera |

## Data

Map data © OpenStreetMap contributors, available under the Open Database License (ODbL).
Elevation data: EU-DEM via the AWS Terrain Tiles (Mapzen Terrarium) dataset.
