import * as THREE from 'three';
import type { LocalRoutePoint } from './routeProjection';
import { loadKenneyProps, type LoadedProp } from './assetLoader';

/** Deterministic small PRNG so scenery is stable across re-renders of the same route. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEAF_COLORS = [0x2f9e44, 0x37b24d, 0x2b8a3e];
const WALL_COLORS = [0xe8dcc8, 0xd9c9a8, 0xc9b896];

type Placement = { x: number; y: number; z: number; rotY: number; scale: number };
type TerrainSampler = (x: number, z: number) => number;

const TREE_ASSETS = [
  'trees/pine-round.glb',
  'trees/pine-tall.glb',
  'trees/detailed.glb',
  'trees/detailed-fall.glb',
  'trees/oak.glb',
  'trees/thin-dark.glb',
];
const ROCK_ASSETS = ['rocks/large-a.glb', 'rocks/large-d.glb', 'rocks/small-b.glb', 'rocks/tall-d.glb'];
const BUSH_ASSETS = ['bushes/large.glb', 'bushes/detailed.glb', 'bushes/small.glb'];
const HOUSE_ASSETS = ['houses/type-a.glb', 'houses/type-c.glb', 'houses/type-h.glb', 'houses/type-m.glb'];
const SIGN_ASSETS = ['sign.glb'];

/** Kenney's nature-kit models measure ~1 unit tall as authored — this brings a tree to roughly real size. */
const PROP_SCALE = 3.6;

/**
 * Height field for the ground away from the road: inverse-distance-weighted
 * blend of the route's own real elevation samples (so the large-scale climb
 * shape is genuine, not invented), plus deterministic pseudo-noise whose
 * amplitude grows with distance from the road — rolling hills near a real
 * mountain road instead of a flat shelf. No extra elevation API calls (we
 * already rate-limit hit those); this only reuses data already on hand.
 */
function buildTerrainSampler(points: LocalRoutePoint[]): TerrainSampler {
  const anchorStep = Math.max(1, Math.floor(points.length / 150));
  const anchors = points.filter((_, i) => i % anchorStep === 0);
  if (anchors.length === 0) anchors.push(points[0]);

  const seed = mulberry32(Math.round((points[points.length - 1]?.distanceMeters ?? 1) * 733) || 7);
  const noiseOffsetX = seed() * 1000;
  const noiseOffsetZ = seed() * 1000;

  return (x: number, z: number): number => {
    let weightSum = 0;
    let heightSum = 0;
    let minDistSq = Infinity;
    for (const a of anchors) {
      const dx = x - a.x;
      const dz = z - a.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDistSq) minDistSq = distSq;
      const w = 1 / (distSq + 4);
      weightSum += w;
      heightSum += w * a.y;
    }
    const idw = heightSum / weightSum;
    const distFromRoad = Math.sqrt(minDistSq);
    // Keep a flat corridor matching the road's own height out to past the
    // shoulder (ROAD_WIDTH/shoulder in RoadRibbon.ts span ~5.4m half-width)
    // — otherwise hilly noise right next to the road rises through the flat
    // road mesh and swallows it from a low chase-cam angle.
    const noiseAmp = Math.min(18, Math.max(0, distFromRoad - 9) * 0.45);
    const nx = (x + noiseOffsetX) * 0.015;
    const nz = (z + noiseOffsetZ) * 0.015;
    const noise = (Math.sin(nx * 1.7 + Math.cos(nz * 1.3)) + Math.sin(nz * 2.1 - nx * 0.6)) * 0.5;
    return idw + noise * noiseAmp;
  };
}

function buildTerrainGround(points: LocalRoutePoint[], sampler: TerrainSampler): THREE.Mesh {
  const totalDistance = points[points.length - 1].distanceMeters;
  const size = Math.max(400, totalDistance * 1.4);
  const segments = 70;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const origin = points[0];
  const posAttr = geometry.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const worldX = origin.x + posAttr.getX(i);
    const worldZ = origin.z + posAttr.getZ(i);
    posAttr.setY(i, sampler(worldX, worldZ) - 0.15);
  }
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ color: 0x6fbf6a, flatShading: true, roughness: 1 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(origin.x, 0, origin.z);
  return mesh;
}

/**
 * Scatters trees/bushes/rocks/houses (real CC0 Kenney models — see
 * public/assets/ride3d/LICENSE.txt — with a procedural fallback if any fail
 * to load) along both shoulders of the route, plus occasional signposts
 * right at the edge, using InstancedMesh — a handful of draw calls total
 * regardless of route length. Deterministic (seeded) so the same route
 * always scatters the same way.
 */
export async function buildScenery(points: LocalRoutePoint[]): Promise<THREE.Group> {
  const group = new THREE.Group();
  if (points.length === 0) return group;

  const totalDistance = points[points.length - 1].distanceMeters;
  const sampler = buildTerrainSampler(points);
  group.add(buildTerrainGround(points, sampler));

  // Cap total scenery instances regardless of route length — spacing grows
  // for very long routes instead of placing tens of thousands of props.
  const maxItems = 450;
  const spacing = Math.max(14, (totalDistance * 2) / maxItems);

  const rand = mulberry32(Math.round(totalDistance * 1000) || 1);
  const trees: Placement[] = [];
  const bushes: Placement[] = [];
  const rocks: Placement[] = [];
  const houses: Placement[] = [];
  const signs: Placement[] = [];
  let nextAt = 0;
  let nextSignAt = 90;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    const rightX = -dz / len;
    const rightZ = dx / len;

    if (p.distanceMeters >= nextSignAt) {
      nextSignAt = p.distanceMeters + 160 + rand() * 120;
      const side = rand() < 0.5 ? -1 : 1;
      const sx = p.x + rightX * 4.2 * side;
      const sz = p.z + rightZ * 4.2 * side;
      signs.push({ x: sx, y: sampler(sx, sz), z: sz, rotY: rand() * Math.PI * 2, scale: 1 });
    }

    if (p.distanceMeters < nextAt) continue;
    nextAt = p.distanceMeters + spacing * (0.7 + rand() * 0.6);

    for (const side of [-1, 1]) {
      if (rand() < 0.35) continue;
      const offset = 6 + rand() * 14;
      const px = p.x + rightX * offset * side;
      const pz = p.z + rightZ * offset * side;
      // Kenney's nature-kit models are authored small (~1 unit tall trees) —
      // PROP_SCALE brings them up to roughly real size; per-item variance on
      // top of that for natural-looking variety.
      const baseScale = (0.85 + rand() * 0.5) * PROP_SCALE;
      const placement: Placement = {
        x: px,
        y: sampler(px, pz),
        z: pz,
        rotY: rand() * Math.PI * 2,
        scale: baseScale,
      };
      const roll = rand();
      if (roll < 0.55) trees.push(placement);
      else if (roll < 0.75) bushes.push(placement);
      else if (roll < 0.92) rocks.push(placement);
      else houses.push({ ...placement, scale: (0.9 + rand() * 0.25) * PROP_SCALE });
    }
  }
  signs.forEach((s) => {
    s.scale = PROP_SCALE;
  });

  const [treeProps, rockProps, bushProps, houseProps, signProps] = await Promise.all([
    loadKenneyProps(TREE_ASSETS),
    loadKenneyProps(ROCK_ASSETS),
    loadKenneyProps(BUSH_ASSETS),
    loadKenneyProps(HOUSE_ASSETS),
    loadKenneyProps(SIGN_ASSETS),
  ]);

  // Nature-kit trees/rocks/bushes/signs ship without a working texture (see
  // assetLoader.ts) — recolor with our own flat palette instead of showing
  // their untextured (wrong-looking) baked material. The suburban houses DO
  // have a working baked texture, so those keep their real material.
  if (!addModelInstances(group, trees, treeProps, LEAF_COLORS[1])) group.add(buildTreeInstancesFallback(trees));
  if (bushes.length > 0 && !addModelInstances(group, bushes, bushProps, 0x40a75a)) {
    group.add(buildBushInstancesFallback(bushes));
  }
  if (rocks.length > 0 && !addModelInstances(group, rocks, rockProps, 0x9a9a94)) {
    group.add(buildRockInstancesFallback(rocks));
  }
  if (houses.length > 0 && !addModelInstances(group, houses, houseProps)) {
    group.add(buildHouseInstancesFallback(houses));
  }
  if (signs.length > 0 && !addModelInstances(group, signs, signProps, 0x8a6a4a)) {
    group.add(buildSignInstancesFallback(signs));
  }

  return group;
}

function applyPlacement(matrix: THREE.Matrix4, p: Placement, localOffsetY: number): void {
  matrix.compose(
    new THREE.Vector3(p.x, p.y + localOffsetY * p.scale, p.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY),
    new THREE.Vector3(p.scale, p.scale, p.scale),
  );
}

// Flat-colored materials for recoloring untextured nature-kit props, keyed
// by hex so identical calls share one material instance instead of creating
// a new one per prop category call.
const recolorMaterialCache = new Map<number, THREE.MeshStandardMaterial>();
function recolorMaterial(hex: number): THREE.MeshStandardMaterial {
  let mat = recolorMaterialCache.get(hex);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.95 });
    recolorMaterialCache.set(hex, mat);
  }
  return mat;
}

/**
 * Builds one InstancedMesh per loaded model variant, splitting `placements`
 * round-robin across whichever variants actually loaded. Returns false (adds
 * nothing) if every variant failed, so the caller can fall back to a
 * procedural shape instead of silently showing nothing.
 *
 * The geometry (and, when not recolored, material) here are the asset
 * loader's cached, shared instances (reused across route changes) —
 * `userData.sharedResource` marks them so CartoonRideScene's teardown skips
 * disposing them.
 */
function addModelInstances(
  group: THREE.Group,
  placements: Placement[],
  props: (LoadedProp | null)[],
  recolorHex?: number,
): boolean {
  const valid = props.filter((p): p is LoadedProp => p !== null);
  if (valid.length === 0 || placements.length === 0) return false;

  const perVariant: Placement[][] = valid.map(() => []);
  placements.forEach((p, i) => perVariant[i % valid.length].push(p));

  const m = new THREE.Matrix4();
  perVariant.forEach((list, vi) => {
    if (list.length === 0) return;
    const source = valid[vi];
    const material = recolorHex !== undefined ? recolorMaterial(recolorHex) : source.material;
    const instanced = new THREE.InstancedMesh(source.geometry, material, list.length);
    instanced.userData.sharedResource = true;
    list.forEach((p, i) => {
      applyPlacement(m, p, 0);
      instanced.setMatrixAt(i, m);
    });
    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);
  });
  return true;
}

// --- Procedural fallbacks (used only if the real asset fetch fails, e.g. offline) ---

function buildTreeInstancesFallback(placements: Placement[]): THREE.Group {
  const group = new THREE.Group();
  if (placements.length === 0) return group;

  const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.24, 1.6, 6);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, flatShading: true, roughness: 1 });
  const trunk = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, placements.length);

  const leafGeometry = new THREE.ConeGeometry(1.05, 2.1, 7);
  const leafMaterial = new THREE.MeshStandardMaterial({ color: LEAF_COLORS[1], flatShading: true, roughness: 0.9 });
  const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, placements.length);

  const m = new THREE.Matrix4();
  placements.forEach((p, i) => {
    applyPlacement(m, p, 0.8);
    trunk.setMatrixAt(i, m);
    applyPlacement(m, p, 2.35);
    leaves.setMatrixAt(i, m);
  });
  trunk.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;

  group.add(trunk, leaves);
  return group;
}

function buildBushInstancesFallback(placements: Placement[]): THREE.InstancedMesh {
  const geometry = new THREE.IcosahedronGeometry(0.55, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0x40a75a, flatShading: true, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const m = new THREE.Matrix4();
  placements.forEach((p, i) => {
    applyPlacement(m, p, 0.5);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function buildRockInstancesFallback(placements: Placement[]): THREE.InstancedMesh {
  const geometry = new THREE.IcosahedronGeometry(0.6, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0x9a9a94, flatShading: true, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const m = new THREE.Matrix4();
  placements.forEach((p, i) => {
    applyPlacement(m, p, 0.25);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function buildHouseInstancesFallback(placements: Placement[]): THREE.Group {
  const group = new THREE.Group();
  if (placements.length === 0) return group;

  const bodyGeometry = new THREE.BoxGeometry(3.2, 2.4, 3.6);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: WALL_COLORS[1],
    flatShading: true,
    roughness: 1,
  });
  const body = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, placements.length);

  const roofGeometry = new THREE.ConeGeometry(2.9, 1.8, 4);
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x8a4a3a, flatShading: true, roughness: 0.9 });
  const roof = new THREE.InstancedMesh(roofGeometry, roofMaterial, placements.length);

  const m = new THREE.Matrix4();
  placements.forEach((p, i) => {
    applyPlacement(m, p, 1.2);
    body.setMatrixAt(i, m);
    applyPlacement(m, p, 3.3);
    roof.setMatrixAt(i, m);
  });
  body.instanceMatrix.needsUpdate = true;
  roof.instanceMatrix.needsUpdate = true;

  group.add(body, roof);
  return group;
}

function buildSignInstancesFallback(placements: Placement[]): THREE.Group {
  const group = new THREE.Group();
  if (placements.length === 0) return group;

  const poleGeometry = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 5);
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.6, metalness: 0.2 });
  const pole = new THREE.InstancedMesh(poleGeometry, poleMaterial, placements.length);

  const signGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.04);
  const signMaterial = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 });
  const sign = new THREE.InstancedMesh(signGeometry, signMaterial, placements.length);

  const m = new THREE.Matrix4();
  placements.forEach((p, i) => {
    applyPlacement(m, p, 0.9);
    pole.setMatrixAt(i, m);
    applyPlacement(m, p, 1.65);
    sign.setMatrixAt(i, m);
  });
  pole.instanceMatrix.needsUpdate = true;
  sign.instanceMatrix.needsUpdate = true;

  group.add(pole, sign);
  return group;
}
