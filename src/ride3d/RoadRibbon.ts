import * as THREE from 'three';
import type { LocalRoutePoint } from './routeProjection';

const ROAD_WIDTH = 5.6;

/** Builds a paved asphalt road ribbon (+ white border lines + yellow dashed center line) following the real route's shape. */
export function buildRoadRibbon(points: LocalRoutePoint[]): THREE.Group {
  const group = new THREE.Group();
  if (points.length < 2) return group;

  const up = new THREE.Vector3(0, 1, 0);
  const positions: number[] = [];
  const shoulderPositions: number[] = [];
  const lineLeftPositions: number[] = [];
  const lineRightPositions: number[] = [];
  const dirs: THREE.Vector3[] = [];

  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    const prevPt = points[Math.max(0, i - 1)];
    const nextPt = points[Math.min(points.length - 1, i + 1)];
    const dirIn = new THREE.Vector3(cur.x - prevPt.x, 0, cur.z - prevPt.z);
    const dirOut = new THREE.Vector3(nextPt.x - cur.x, 0, nextPt.z - cur.z);
    const hasIn = dirIn.lengthSq() > 1e-8;
    const hasOut = dirOut.lengthSq() > 1e-8;
    if (hasIn) dirIn.normalize();
    if (hasOut) dirOut.normalize();

    let dir: THREE.Vector3;
    if (hasIn && hasOut) {
      dir = dirIn.dot(dirOut) < -0.15 ? dirOut.clone() : dirIn.clone().add(dirOut);
    } else if (hasOut) {
      dir = dirOut.clone();
    } else if (hasIn) {
      dir = dirIn.clone();
    } else {
      dir = new THREE.Vector3(0, 0, -1);
    }
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1);
    dir.normalize();
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    dirs.push(dir);

    const p = cur;
    const halfW = ROAD_WIDTH * 0.5;

    // Asphalt Main Surface
    const lx = p.x + right.x * halfW;
    const lz = p.z + right.z * halfW;
    const rx = p.x - right.x * halfW;
    const rz = p.z - right.z * halfW;
    positions.push(lx, p.y + 0.02, lz, rx, p.y + 0.02, rz);

    // White Edge Lines
    const llx1 = p.x + right.x * (halfW - 0.05);
    const llz1 = p.z + right.z * (halfW - 0.05);
    const llx2 = p.x + right.x * (halfW - 0.22);
    const llz2 = p.z + right.z * (halfW - 0.22);
    lineLeftPositions.push(llx1, p.y + 0.03, llz1, llx2, p.y + 0.03, llz2);

    const rrx1 = p.x - right.x * (halfW - 0.05);
    const rrz1 = p.z - right.z * (halfW - 0.05);
    const rrx2 = p.x - right.x * (halfW - 0.22);
    const rrz2 = p.z - right.z * (halfW - 0.22);
    lineRightPositions.push(rrx1, p.y + 0.03, rrz1, rrx2, p.y + 0.03, rrz2);

    // Grass / Terrain Shoulder
    const slx = p.x + right.x * (halfW + 4.5);
    const slz = p.z + right.z * (halfW + 4.5);
    const srx = p.x - right.x * (halfW + 4.5);
    const srz = p.z - right.z * (halfW + 4.5);
    shoulderPositions.push(slx, p.y - 0.04, slz, srx, p.y - 0.04, srz);
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

  // Grass Shoulder
  const shoulderMesh = new THREE.Mesh(
    buildStripGeometry(shoulderPositions),
    new THREE.MeshStandardMaterial({ color: 0x364a27, roughness: 0.95, flatShading: true }),
  );
  shoulderMesh.receiveShadow = true;
  group.add(shoulderMesh);

  // Dark Asphalt Road
  const roadMesh = new THREE.Mesh(
    buildStripGeometry(positions),
    new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.82, flatShading: false }),
  );
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // White Edge Border Lines
  const whiteLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lineLeftMesh = new THREE.Mesh(buildStripGeometry(lineLeftPositions), whiteLineMat);
  const lineRightMesh = new THREE.Mesh(buildStripGeometry(lineRightPositions), whiteLineMat);
  group.add(lineLeftMesh, lineRightMesh);

  // Yellow Dashed Center Line
  const totalDistance = points[points.length - 1]?.distanceMeters ?? 0;
  const dashLength = 3.5;
  const gapLength = 4.0;
  const dashPeriod = dashLength + gapLength;
  const dashCount = Math.floor(totalDistance / dashPeriod);

  if (dashCount > 0) {
    const dashGeo = new THREE.PlaneGeometry(0.18, dashLength);
    dashGeo.rotateX(-Math.PI / 2);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffcb2b, side: THREE.DoubleSide });

    const instancedMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
    const dummy = new THREE.Object3D();
    let idx = 0;

    let pIdx = 0;
    for (let d = 2.0; d < totalDistance - dashLength; d += dashPeriod) {
      if (idx >= dashCount) break;
      while (pIdx < points.length - 1 && points[pIdx + 1].distanceMeters < d) {
        pIdx++;
      }
      const a = points[pIdx];
      const b = points[Math.min(points.length - 1, pIdx + 1)];
      const span = b.distanceMeters - a.distanceMeters || 1;
      const t = (d - a.distanceMeters) / span;

      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t + 0.04;
      const z = a.z + (b.z - a.z) * t;

      const dir = dirs[Math.min(dirs.length - 1, pIdx)];
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
      dummy.updateMatrix();

      instancedMesh.setMatrixAt(idx++, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    group.add(instancedMesh);
  }

  return group;
}
