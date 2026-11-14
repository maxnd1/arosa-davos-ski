// Headless test of the crash ragdoll. It cuts the real ragdoll code out of swiss-ski/index.html and drops the
// ragdoll on planar slopes (15, 25, 35, 40 degrees) at 20, 50 and 90 km/h, several times each.
//   node tests/ragdoll.mjs [runs=5] [surface=piste|powder|ice] [reason="..."] [mode] [slope/kmh] [traceSeed]
//     mode:  quick = only the key cases · each = print every run with its seed · quick-each = both
//     TUNE='{"e":0.2}' environment variable overrides RAG_TUNE constants for the run
//     slope/kmh  only that case, e.g. 25/50      traceSeed  replay one seed and print a time series
// Randomness is seeded, so every run (and every outlier) can be replayed exactly.
// Per case it reports: distance travelled, airborne hops (count, highest), full tumbles, bone stretch, how deep
// anything went through the snow, time to settle, and whether the simulation ever blew up.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'swiss-ski', 'index.html'), 'utf8');
const a = src.indexOf('// ================= ragdoll ================='), b = src.indexOf('// ================= other skiers');
if (a < 0 || b < 0) throw new Error('ragdoll section not found in index.html');
const code = src.slice(a, b);
const RUNS = +process.argv[2] || 5, SURFACE = process.argv[3] || 'piste', REASON = process.argv[4] ?? '';
const MODE = process.argv[5] || '', QUICK = MODE.includes('quick'), EACH = MODE.includes('each');
const ONLY = process.argv[6] ? process.argv[6].split('/').map(Number) : null, TRACE_SEED = process.argv[7] ? +process.argv[7] : null;
let _seed = 1; const seedRng = s => { _seed = s >>> 0; };
Math.random = () => ((_seed = (Math.imul(_seed, 1664525) + 1013904223) >>> 0) / 4294967296);

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; } sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; } multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  negate() { return this.multiplyScalar(-1); } dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; } lengthSq() { return this.dot(this); } length() { return Math.sqrt(this.lengthSq()); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); } distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); } setY(y) { this.y = y; return this; }
  crossVectors(a, b) { const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x; return this.set(x, y, z); } cross(v) { return this.crossVectors(this.clone(), v); }
}
const THREE = { Vector3, Matrix4: class { }, Quaternion: class { }, Group: class { } };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), sstep = (lo, hi, x) => { const t = clamp((x - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
const G = 9.81, PHYS = { hz: 240 }, _up = new Vector3(0, 1, 0);
const ENV = { condGrip: SURFACE === 'ice' ? 0.72 : 1, fresh: SURFACE === 'powder' ? 25 : 2, cond: SURFACE };
const pmAt = () => (SURFACE === 'powder' ? 0 : 1);
const EQ = () => ({ board: false });
const $ = () => ({ style: {}, innerHTML: '' });
const scene = { add() { }, remove() { } };
const SPN = 100, spPos = new Float32Array(SPN * 3), spVel = new Float32Array(SPN * 3), spLife = new Float32Array(SPN);
const MASS = [5, 16, 16, 3.5, 2, 0.8, 3.5, 2, 0.8, 7, 5, 3.5, 7, 5, 3.5], MT = MASS.reduce((x, y) => x + y, 0);

const NAMES = ['head', 'neck', 'pelvis', 'lSh', 'lEl', 'lHa', 'rSh', 'rEl', 'rHa', 'lHip', 'lKn', 'lAn', 'rHip', 'rKn', 'rAn'];
function dumpLimbs(P, RAG, t, V3) { // debugging aid: state of every constraint touching the right leg, and the knee / elbow hinge offsets
  const lines = [];
  for (const c of RAG.cons) {
    const LEG = (process.env.LEG || '12,13,14').split(',').map(Number); if (!LEG.includes(c[0]) && !LEG.includes(c[1])) continue;
    const len = P[c[0]].distanceTo(P[c[1]]);
    lines.push(NAMES[c[0]] + '-' + NAMES[c[1]] + ' len ' + (len * 100).toFixed(1) + ' cm ' + (c[5] ? '(max ' + (c[5] * 100).toFixed(0) + ')' : c[4] ? '(min ' + (c[4] * 100).toFixed(0) + ')' : '(rest ' + (c[2] * 100).toFixed(1) + ')'));
  }
  const up = P[1].clone().sub(P[2]), ac = P[9].clone().sub(P[12]), fw = new V3().crossVectors(ac, up).normalize();
  const hk = RAG.hinges.map(h => NAMES[h[1]] + ' side ' + h[3] + ' offset ' + (P[h[1]].clone().sub(P[h[0]].clone().add(P[h[2]]).multiplyScalar(0.5)).dot(fw) * h[3] * 100).toFixed(1) + ' cm');
  console.log('DUMP t=' + t.toFixed(4)); lines.forEach(l => console.log('   ' + l)); console.log('   hinges: ' + hk.join(', ') + '; touching ' + [...RAG.touch].join(''));
}
function runCase(slopeDeg, kmh, seed, trace) {
  seedRng(seed);
  const SL = slopeDeg * Math.PI / 180, T = Math.tan(SL), cosS = Math.cos(SL);
  const hAt = (x, z) => -T * z;                                         // the slope falls towards +z
  const normalAt = (x, z, out = new Vector3()) => out.set(0, 1, T).normalize();
  const S = { p: new Vector3(), v: new Vector3(), yaw: 0, flipV: 0 };
  const node = (x, y, z) => ({ localToWorld: v => v.set(v.x + x, v.y + y + hAt(x, z), v.z + z) });
  const rig = { // a skier standing in a normal stance, skis pointing down the fall line
    root: { visible: true, position: new Vector3(), updateMatrixWorld() { } },
    neck: node(0, 1.5, 0.1), pelvis: node(0, 0.92, -0.05), spine: {}, mats: {},
    arms: [1, -1].map(s => ({ shoulder: node(0.2 * s, 1.4, 0.08), elbow: node(0.26 * s, 1.14, 0.18), hand: node(0.3 * s, 0.95, 0.38), pole: node(0.3 * s, 0.95, 0.38) })),
    legs: [1, -1].map(s => ({ hip: node(0.095 * s, 0.89, -0.05), knee: node(0.1 * s, 0.5, 0.12), ankle: node(0.1 * s, 0.1, 0), skiG: node(0.1 * s, -0.065, 0) })),
  };
  const make = new Function('clamp', 'sstep', 'pmAt', 'ENV', 'EQ', 'THREE', 'hAt', 'normalAt', 'G', 'PHYS', '_up', 'S', 'rig', '$', 'scene', 'spPos', 'spVel', 'spLife', 'SPN', 'RESCUE',
    'let spHead = 0; ' + code + '\n RAG.vis = { grp: { visible: false } };\n return { RAG, J, startRagdoll, ragStep, ragSub: typeof ragSub === "function" ? ragSub : null, clampFn: clamp, TUNE: typeof RAG_TUNE !== "undefined" ? RAG_TUNE : null, ragSurface: typeof ragSurface === "function" ? ragSurface : null };');
  const R = make(clamp, sstep, pmAt, ENV, EQ, THREE, hAt, normalAt, G, PHYS, _up, S, rig, $, scene, spPos, spVel, spLife, SPN, { bad: false });
  if (R.TUNE && process.env.TUNE) Object.assign(R.TUNE, JSON.parse(process.env.TUNE));   // e.g. TUNE={"loadG":1}
  const v = kmh / 3.6;
  R.startRagdoll(new Vector3(0, -Math.sin(SL) * v, Math.cos(SL) * v), REASON, 0);
  const { RAG, J } = R, P = RAG.P, sink = R.ragSurface ? R.ragSurface(0, 0).sink : 0;
  const bones = RAG.cons.filter(c => !c[4] && c[3] === 1 && c[2] >= 0.25), rest = bones.map(c => c[2]);   // visible bones: limbs and the torso diagonals (short rigid links like the 10 cm pelvis-hip joint are internal)
  const frame = () => { const up = P[J.neck].clone().sub(P[J.pelvis]).normalize(), ac = P[J.lHip].clone().sub(P[J.rHip]).normalize(), fw = new Vector3().crossVectors(ac, up).normalize(); return [up, ac, fw]; };
  const z0 = P[J.pelvis].z; let fPrev = frame();
  let t = 0, stretch = 0, pen = 0, hops = 0, hopMax = 0, comMax = 0, airT = 0, curClear = 0, curCom = 0, turned = 0, exploded = false, vmax = 0, vmaxAll = 0, settledAt = null, contactSeen = false, nextPrint = 0;
  const dt = 1 / 240;
  while (t < (trace ? 12 : 45)) {
    if (process.env.DUMP && t >= +process.env.DUMP - 1e-4 && t < +process.env.DUMP + 0.0042) dumpLimbs(P, RAG, t, Vector3);
    let snap = null; if (process.env.DIAG && t >= +process.env.DIAG.split(',')[0] && t <= +process.env.DIAG.split(',')[1]) snap = P.map((p, i) => ({ p: p.clone(), q: RAG.prev[i].clone(), d: RAG.dtPrev })); 
    if (process.env.SUBDIAG && !globalThis.__sd) { let vm = 0; const last = RAG.dtPrev || dt; for (let i = 0; i < 15; i++) vm = Math.max(vm, P[i].distanceTo(RAG.prev[i]) / last); const kk = clamp(Math.ceil(vm * dt / 0.04), 1, 4); for (let s2 = 0; s2 < kk; s2++) { const before = P.map((p, i) => ({ p: p.clone(), q: RAG.prev[i].clone(), d: RAG.dtPrev })); const cm0 = new Vector3(); for (let i = 0; i < 15; i++) cm0.addScaledVector(before[i].p.clone().sub(before[i].q), MASS[i] / MT / before[i].d); R.ragSub(dt / kk); { const cm1 = new Vector3(); for (let i = 0; i < 15; i++) cm1.addScaledVector(P[i].clone().sub(RAG.prev[i]), MASS[i] / MT / RAG.dtPrev); const dcm = cm1.clone().sub(cm0).length(); if (dcm > 1.2 && !globalThis.__sd) { globalThis.__sd = true; const parts = []; for (let i = 0; i < 15; i++) if (RAG.touch[i] || RAG.acc[i] > 0) parts.push(NAMES[i] + ' vin ' + (RAG.vin[i] / RAG.dtPrev).toFixed(1) + ' acc ' + (RAG.acc[i] / RAG.dtPrev).toFixed(1) + (RAG.touch[i] ? ' T' : '')); console.log('SUBDIAG t=' + t.toFixed(4) + ' substep ' + (s2 + 1) + '/' + kk + ' COM impulse ' + dcm.toFixed(2) + ' m/s (speed ' + cm0.length().toFixed(1) + ' -> ' + cm1.length().toFixed(1) + ') kick ' + (RAG.kick ? RAG.kick.map(v => v.toFixed(1)).join('/') : '-') + ' | ' + parts.join(' | ')); } } for (let i = 0; i < 15; i++) { const v0 = before[i].p.clone().sub(before[i].q).multiplyScalar(1 / before[i].d), v1 = P[i].clone().sub(RAG.prev[i]).multiplyScalar(1 / RAG.dtPrev); const dv = v1.clone().sub(v0).length(); if (false) { globalThis.__sd = true; console.log('SUBDIAG t=' + t.toFixed(4) + ' substep ' + (s2 + 1) + '/' + kk + ' ' + NAMES[i] + ' dv ' + dv.toFixed(0) + ' m/s (' + v0.length().toFixed(0) + ' -> ' + v1.length().toFixed(0) + ')  acc ' + (RAG.acc[i] / RAG.dtPrev).toFixed(1) + ' touching ' + RAG.touch[i] + ' act:' + [...RAG.act].map((x, ci) => x ? ci : '').filter(x => x !== '').join(',') + ' hinges:' + [...RAG.actH].join('') + ' hip:' + [...RAG.actHip].join('')); } } } t += dt; } else { R.ragStep(dt); t += dt; } if (snap) { const nm = ['head','neck','pelvis','lSh','lEl','lHa','rSh','rEl','rHa','lHip','lKn','lAn','rHip','rKn','rAn']; const out = []; for (let i = 0; i < 15; i++) { const v0 = snap[i].p.clone().sub(snap[i].q).multiplyScalar(1 / snap[i].d), v1 = P[i].clone().sub(RAG.prev[i]).multiplyScalar(1 / RAG.dtPrev); const dv = v1.clone().sub(v0).length(); if (dv > 12) out.push(nm[i] + ' dv ' + dv.toFixed(0) + ' m/s (now ' + v1.length().toFixed(0) + ', touching ' + RAG.touch[i] + ')'); } if (out.length) console.log('  DIAG t=' + t.toFixed(4) + ' k=' + Math.round(1 / 240 / RAG.dtPrev) + ' | ' + out.join(' | ')); }
    const vdt = RAG.dtPrev || dt;   // the ragdoll may take smaller steps; its stored velocities are per sub-step
    let minClear = 1e9, comN = 0, cnt = 0; const cv = new Vector3();
    for (let i = 0; i < 15; i++) {
      const p = P[i]; if (!isFinite(p.x + p.y + p.z)) { exploded = true; break; }
      const cl = (p.y - hAt(p.x, p.z) - RAG.rad[i] + sink) * cosS; minClear = Math.min(minClear, cl); if (cl < 0.01) cnt++;
      comN += (p.y - hAt(p.x, p.z)) * cosS * MASS[i] / MT;
      const sp = p.distanceTo(RAG.prev[i]) / vdt; vmax = Math.max(vmax, sp); vmaxAll = Math.max(vmaxAll, sp); if (sp > 150) exploded = true;
      cv.addScaledVector(p.clone().sub(RAG.prev[i]), MASS[i] / MT / vdt);
    }
    if (exploded) break;
    pen = Math.max(pen, -minClear);
    bones.forEach((c, i) => { stretch = Math.max(stretch, Math.abs(P[c[0]].distanceTo(P[c[1]]) - rest[i]) / rest[i]); });
    if (minClear < 0.01 && t > 0.3) contactSeen = true;
    if (minClear > 0.03) { airT += dt; curClear = Math.max(curClear, minClear); curCom = Math.max(curCom, comN); }
    else { if (airT >= 0.1 && contactSeen) { hops++; hopMax = Math.max(hopMax, curClear); comMax = Math.max(comMax, curCom); } airT = 0; curClear = 0; curCom = 0; }
    const fNow = frame(); let sq = 0; for (let k = 0; k < 3; k++) sq += Math.acos(clamp(fNow[k].dot(fPrev[k]), -1, 1)) ** 2; turned += Math.sqrt(sq / 2); fPrev = fNow;
    if (trace && process.env.FINE && process.env.VIOL && t >= +process.env.FINE.split(',')[0] && t <= +process.env.FINE.split(',')[1]) { const nm = ['head','neck','pelvis','lSh','lEl','lHa','rSh','rEl','rHa','lHip','lKn','lAn','rHip','rKn','rAn']; const bad = []; for (const c of RAG.cons) { const len = P[c[0]].distanceTo(P[c[1]]); const [a2, b2, rest2, k2, min2, max2] = c; if (max2) { if (len - max2 > 0.02) bad.push(nm[a2] + '-' + nm[b2] + ' max by ' + ((len - max2) * 100).toFixed(1) + 'cm'); } else if (min2) { if (min2 - len > 0.02) bad.push(nm[a2] + '-' + nm[b2] + ' min short ' + ((min2 - len) * 100).toFixed(1) + 'cm'); } else if (Math.abs(len - rest2) / rest2 > 0.03) bad.push(nm[a2] + '-' + nm[b2] + ' bone ' + (((len - rest2) / rest2) * 100).toFixed(1) + '%'); } if (bad.length) console.log('  VIOL t=' + t.toFixed(4) + ' ' + bad.join(' | ')); }
    if (trace && process.env.ACC && t >= +process.env.ACC.split(',')[0] && t <= +process.env.ACC.split(',')[1]) { const nm = ['head','neck','pelvis','lSh','lEl','lHa','rSh','rEl','rHa','lHip','lKn','lAn','rHip','rKn','rAn']; const parts = []; for (let i = 0; i < 15; i++) if (RAG.touch[i] || RAG.acc[i] > 0) parts.push(nm[i] + ' vin ' + (RAG.vin[i] / vdt).toFixed(1) + ' acc ' + (RAG.acc[i] / vdt).toFixed(1) + ' now ' + (P[i].distanceTo(RAG.prev[i]) / vdt).toFixed(1)); let mv = new Vector3(); for (let i = 0; i < 15; i++) mv.addScaledVector(P[i].clone().sub(RAG.prev[i]), MASS[i] / MT / vdt); console.log('  ACC t=' + t.toFixed(4) + ' COM ' + mv.length().toFixed(2) + ' m/s | ' + parts.join(' | ')); }
    if (trace && process.env.FINE && !process.env.VIOL && t >= +process.env.FINE.split(',')[0] && t <= +process.env.FINE.split(',')[1]) { let mv = 0, ncl = 0; for (let i = 0; i < 15; i++) { mv += MASS[i] / MT * (P[i].y - RAG.prev[i].y) / vdt; } console.log('  step t=' + t.toFixed(4) + ' COM vy ' + mv.toFixed(1) + ' kick ' + (RAG.kick ? RAG.kick.map(v => v.toFixed(1)).join('/') : '-') + ' contacts ' + cnt + ' lowest ' + minClear.toFixed(3) + ' fastest ' + (() => { let bi = 0, bv = 0; for (let i = 0; i < 15; i++) { const sp = P[i].distanceTo(RAG.prev[i]) / vdt; if (sp > bv) { bv = sp; bi = i; } } const nm = ['head','neck','pelvis','lSh','lEl','lHa','rSh','rEl','rHa','lHip','lKn','lAn','rHip','rKn','rAn'][bi]; return nm + ' ' + bv.toFixed(2) + ' (touching: ' + (RAG.touch[bi] ? 'yes' : 'no') + ')'; })()); }
    if (trace && t >= nextPrint) { nextPrint += 0.25; console.log('t=' + t.toFixed(2) + ' lowest ' + minClear.toFixed(2) + ' centre ' + comN.toFixed(2) + ' | speed ' + cv.length().toFixed(1) + ' m/s | contacts ' + cnt + '/15 | tumbles ' + (turned / 6.283).toFixed(1) + ' | fastest joint ' + vmax.toFixed(0) + ' m/s | stretch so far ' + (stretch * 100).toFixed(1) + ' %'); vmax = 0; }
    if (RAG.settled >= 0.5 && !trace) { settledAt = t; break; }
  }
  return { dist: (P[J.pelvis].z - z0) / cosS, hops, hopMax, comMax, tumbles: turned / (2 * Math.PI), stretch, pen, settledAt, exploded, vmax: vmaxAll, seed };
}
const med = arr => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const f = (v, d = 1) => v.toFixed(d), rng = (arr, d = 0) => { const lo = Math.min(...arr), hi = Math.max(...arr); return lo.toFixed(d) === hi.toFixed(d) ? lo.toFixed(d) : lo.toFixed(d) + '-' + hi.toFixed(d); };
console.log('ragdoll test | surface: ' + SURFACE + ' | ' + RUNS + ' runs per case | crash reason: "' + (REASON || 'caught an edge (default)') + '"');
if (TRACE_SEED !== null) { const [sl, kh] = ONLY; console.log(JSON.stringify(runCase(sl, kh, TRACE_SEED, true))); process.exit(0); }
console.log('slope  speed   | distance m (median)   | hops (highest clear / body centre)   | tumbles   | stretch | through snow | settled after      | blew up');
let bad = 0;
for (const slope of [15, 25, 35, 40]) for (const kmh of [20, 50, 90]) {
  if (QUICK && !((slope === 15 && kmh === 20) || ((slope === 25 || slope === 35) && kmh >= 50))) continue;
  if (ONLY && !(slope === ONLY[0] && kmh === ONLY[1])) continue;
  const rs = Array.from({ length: RUNS }, (_, k) => runCase(slope, kmh, slope * 1000 + kmh * 10 + k + 1, false));
  if (EACH) rs.forEach(r => console.log('   seed ' + r.seed + ': dist ' + r.dist.toFixed(0) + ' m, hops ' + r.hops + ' (clear ' + r.hopMax.toFixed(2) + ' / centre ' + r.comMax.toFixed(2) + '), tumbles ' + r.tumbles.toFixed(1) + ', stretch ' + (r.stretch * 100).toFixed(1) + ' %, fastest joint ' + r.vmax.toFixed(0) + ' m/s, settled ' + (r.settledAt ? r.settledAt.toFixed(1) : 'never')));
  const ns = rs.filter(r => r.settledAt === null).length, ex = rs.filter(r => r.exploded).length; if (ex) bad++;
  const hopTxt = rng(rs.map(r => r.hops)) + ' (' + f(Math.max(...rs.map(r => r.hopMax)), 2) + ' m / ' + f(Math.max(...rs.map(r => r.comMax)), 2) + ' m)';
  const setTxt = ns === RUNS ? 'never (45 s)' : rng(rs.filter(r => r.settledAt !== null).map(r => r.settledAt), 1) + ' s' + (ns ? ', ' + ns + 'x never' : '');
  console.log(String(slope).padStart(3) + ' deg ' + String(kmh).padStart(3) + ' km/h | ' + (rng(rs.map(r => r.dist)) + ' (med ' + med(rs.map(r => r.dist)).toFixed(0) + ')').padEnd(22) + ' | ' + hopTxt.padEnd(36)
    + ' | ' + rng(rs.map(r => r.tumbles), 1).padEnd(9) + ' | ' + (f(Math.max(...rs.map(r => r.stretch)) * 100, 1) + ' %').padEnd(7) + ' | ' + (f(Math.max(...rs.map(r => r.pen)) * 100, 1) + ' cm').padEnd(12)
    + ' | ' + setTxt.padEnd(18) + ' | ' + (ex ? 'YES x' + ex : 'no'));
}
process.exit(bad ? 1 : 0);
