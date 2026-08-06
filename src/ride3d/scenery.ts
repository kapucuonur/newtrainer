import * as THREE from 'three';
import type { LocalRoutePoint } from './routeProjection';

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

type Placement = { x: number; y: number; z: number; rotY: number; scale: number };

/**
 * Scatters low-poly trees/bushes along both shoulders of the route using
 * InstancedMesh (a handful of draw calls total, regardless of how many
 * thousand trees a long route needs) plus a large ground plane so the road
 * doesn't float in a void. Deterministic (seeded) so the same route always
 * scatters the same way. A naive one-mesh-per-tree approach caused
 * thousands of draw calls on real multi-km routes — this replaces it.
 */
export function buildScenery(points: LocalRoutePoint[]): THREE.Group {
  const group = new THREE.Group();
  if (points.length === 0) return group;

  const totalDistance = points[points.length - 1].distanceMeters;
  const groundSize = Math.max(400, totalDistance * 1.4);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x6fbf6a, flatShading: true, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(points[0].x, -0.15, points[0].z);
  group.add(ground);

  // Cap total scenery instances regardless of route length — spacing grows
  // for very long routes instead of placing tens of thousands of trees.
  const maxItems = 450;
  const spacing = Math.max(14, (totalDistance * 2) / maxItems);

  const rand = mulberry32(Math.round(totalDistance * 1000) || 1);
  const trees: Placement[] = [];
  const bushes: Placement[] = [];
  let nextAt = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.distanceMeters < nextAt) continue;
    nextAt = p.distanceMeters + spacing * (0.7 + rand() * 0.6);

    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    const rightX = -dz / len;
    const rightZ = dx / len;

    for (const side of [-1, 1]) {
      if (rand() < 0.35) continue;
      const offset = 6 + rand() * 14;
      const placement: Placement = {
        x: p.x + rightX * offset * side,
        y: p.y,
        z: p.z + rightZ * offset * side,
        rotY: rand() * Math.PI * 2,
        scale: 0.75 + rand() * 0.7,
      };
      if (rand() < 0.7) trees.push(placement);
      else bushes.push(placement);
    }
  }

  group.add(buildTreeInstances(trees));
  if (bushes.length > 0) group.add(buildBushInstances(bushes));

  return group;
}

function applyPlacement(matrix: THREE.Matrix4, p: Placement, localOffsetY: number): void {
  matrix.compose(
    new THREE.Vector3(p.x, p.y + localOffsetY * p.scale, p.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY),
    new THREE.Vector3(p.scale, p.scale, p.scale),
  );
}

function buildTreeInstances(placements: Placement[]): THREE.Group {
  const group = new THREE.Group();
  if (placements.length === 0) return group;

  const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.24, 1.6, 6);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, flatShading: true, roughness: 1 });
  const trunk = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, placements.length);

  const leafGeometry = new THREE.ConeGeometry(1.05, 2.1, 7);
  // A single averaged leaf color (not per-tree) keeps this to one instanced
  // draw call instead of one per color variant.
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

function buildBushInstances(placements: Placement[]): THREE.InstancedMesh {
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
