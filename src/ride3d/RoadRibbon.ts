import * as THREE from 'three';
import type { LocalRoutePoint } from './routeProjection';

const ROAD_WIDTH = 6;
const ROAD_COLOR = 0x4a4f58;
const LINE_COLOR = 0xffd23f;
const SHOULDER_COLOR = 0x6b7078;

/** Builds a stylized paved road ribbon (+ dashed center line) following the real route's shape. */
export function buildRoadRibbon(points: LocalRoutePoint[]): THREE.Group {
  const group = new THREE.Group();
  if (points.length < 2) return group;

  const up = new THREE.Vector3(0, 1, 0);
  const positions: number[] = [];
  const shoulderPositions: number[] = [];
  const dirs: THREE.Vector3[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dir = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1);
    dir.normalize();
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    dirs.push(dir);

    const p = points[i];
    const lx = p.x + right.x * ROAD_WIDTH * 0.5;
    const lz = p.z + right.z * ROAD_WIDTH * 0.5;
    const rx = p.x - right.x * ROAD_WIDTH * 0.5;
    const rz = p.z - right.z * ROAD_WIDTH * 0.5;
    positions.push(lx, p.y + 0.02, lz, rx, p.y + 0.02, rz);

    const slx = p.x + right.x * ROAD_WIDTH * 0.9;
    const slz = p.z + right.z * ROAD_WIDTH * 0.9;
    const srx = p.x - right.x * ROAD_WIDTH * 0.9;
    const srz = p.z - right.z * ROAD_WIDTH * 0.9;
    shoulderPositions.push(slx, p.y, slz, srx, p.y, srz);
  }

  const buildStripGeometry = (verts: number[]): THREE.BufferGeometry => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const indices: number[] = [];
    const rowCount = verts.length / 6;
    for (let i = 0; i < rowCount - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  };

  const shoulderMesh = new THREE.Mesh(
    buildStripGeometry(shoulderPositions),
    new THREE.MeshStandardMaterial({ color: SHOULDER_COLOR, flatShading: true, roughness: 1 }),
  );
  group.add(shoulderMesh);

  const roadMesh = new THREE.Mesh(
    buildStripGeometry(positions),
    new THREE.MeshStandardMaterial({ color: ROAD_COLOR, flatShading: true, roughness: 0.95 }),
  );
  group.add(roadMesh);

  // Dashed center line — one InstancedMesh, however many dashes a long
  // route needs, instead of a separate draw call per dash (a real ~2.5km
  // test route alone produced 300+ individual dash meshes; a 50km route
  // would produce thousands, which crashed the WebGL context).
  const totalDistance = points[points.length - 1]?.distanceMeters ?? 0;
  const dashSpacing = Math.max(8, totalDistance / 600);
  const dashTransforms: { x: number; y: number; z: number; rotY: number }[] = [];
  let nextDashAt = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.distanceMeters < nextDashAt) continue;
    nextDashAt = p.distanceMeters + dashSpacing;
    const dir = dirs[i];
    dashTransforms.push({ x: p.x, y: p.y + 0.04, z: p.z, rotY: Math.atan2(dir.x, dir.z) });
  }

  if (dashTransforms.length > 0) {
    const dashGeometry = new THREE.BoxGeometry(0.35, 0.03, 2.2);
    const dashMaterial = new THREE.MeshStandardMaterial({ color: LINE_COLOR, roughness: 0.6 });
    const dashes = new THREE.InstancedMesh(dashGeometry, dashMaterial, dashTransforms.length);
    const m = new THREE.Matrix4();
    dashTransforms.forEach((d, i) => {
      m.compose(
        new THREE.Vector3(d.x, d.y, d.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rotY),
        new THREE.Vector3(1, 1, 1),
      );
      dashes.setMatrixAt(i, m);
    });
    dashes.instanceMatrix.needsUpdate = true;
    group.add(dashes);
  }

  return group;
}
