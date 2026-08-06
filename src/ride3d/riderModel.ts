import * as THREE from 'three';

const WHEEL_RADIUS = 0.34;

/** 4-step gradient so MeshToonMaterial gets visible cel-shading bands instead of a smooth default. */
export function createToonGradientTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const shades = [70, 130, 190, 255];
    for (let i = 0; i < shades.length; i++) {
      ctx.fillStyle = `rgb(${shades[i]},${shades[i]},${shades[i]})`;
      ctx.fillRect(i, 0, 1, 1);
    }
  }
  const texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

function strut(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = Math.max(0.01, direction.length());
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 6), material);
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function buildWheel(tireMat: THREE.Material, rimMat: THREE.Material): THREE.Group {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS, 0.05, 8, 16), tireMat);
  tire.rotation.y = Math.PI / 2;
  wheel.add(tire);
  const rim = new THREE.Mesh(new THREE.CircleGeometry(WHEEL_RADIUS - 0.06, 12), rimMat);
  rim.rotation.y = Math.PI / 2;
  wheel.add(rim);
  const rimBack = rim.clone();
  rimBack.rotation.y = -Math.PI / 2;
  wheel.add(rimBack);
  return wheel;
}

export type ToonRiderModel = {
  group: THREE.Group;
  frontWheel: THREE.Group;
  rearWheel: THREE.Group;
  crank: THREE.Group;
};

/**
 * A deliberately simplified, slightly oversized-proportions cyclist —
 * cartoon readability over anatomical accuracy, meant to be seen large and
 * close in a chase camera (unlike the tiny map-marker version).
 */
export function buildToonRiderModel(gradientMap: THREE.Texture): ToonRiderModel {
  const group = new THREE.Group();

  const tireMat = new THREE.MeshToonMaterial({ color: 0x1c1f24, gradientMap });
  const rimMat = new THREE.MeshToonMaterial({ color: 0xe8edf2, gradientMap });
  const frameMat = new THREE.MeshToonMaterial({ color: 0x00d9ff, gradientMap });
  const jerseyMat = new THREE.MeshToonMaterial({ color: 0xff5a3c, gradientMap });
  const shortsMat = new THREE.MeshToonMaterial({ color: 0x1c1f24, gradientMap });
  const skinMat = new THREE.MeshToonMaterial({ color: 0xf2b48c, gradientMap });
  const helmetMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap });
  const visorMat = new THREE.MeshToonMaterial({ color: 0x0a0d12, gradientMap });
  const limbMat = skinMat;
  const pedalMat = new THREE.MeshToonMaterial({ color: 0x14181f, gradientMap });

  const rearWheel = buildWheel(tireMat, rimMat);
  rearWheel.position.set(0, WHEEL_RADIUS, -0.82);
  const frontWheel = buildWheel(tireMat, rimMat);
  frontWheel.position.set(0, WHEEL_RADIUS, 0.82);
  group.add(rearWheel, frontWheel);

  const rearHub = new THREE.Vector3(0, WHEEL_RADIUS, -0.82);
  const frontHub = new THREE.Vector3(0, WHEEL_RADIUS, 0.82);
  const bb = new THREE.Vector3(0, 0.3, -0.05);
  const seat = new THREE.Vector3(0, 0.92, -0.28);
  const headTube = new THREE.Vector3(0, 0.92, 0.62);
  const bar = new THREE.Vector3(0, 1.04, 0.8);

  group.add(strut(rearHub, seat, 0.03, frameMat));
  group.add(strut(rearHub, bb, 0.032, frameMat));
  group.add(strut(bb, seat, 0.034, frameMat));
  group.add(strut(seat, headTube, 0.03, frameMat));
  group.add(strut(bb, headTube, 0.032, frameMat));
  group.add(strut(headTube, frontHub, 0.03, frameMat));
  group.add(strut(headTube, bar, 0.024, frameMat));
  group.add(
    strut(new THREE.Vector3(-0.24, bar.y, bar.z), new THREE.Vector3(0.24, bar.y, bar.z), 0.02, frameMat),
  );

  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.28), new THREE.MeshToonMaterial({ color: 0x14181f, gradientMap }));
  saddle.position.set(0, seat.y + 0.06, seat.z - 0.02);
  group.add(saddle);

  const crank = new THREE.Group();
  crank.position.copy(bb);
  const armDirs = [new THREE.Vector3(0, -1, 0.05).normalize(), new THREE.Vector3(0, 1, -0.05).normalize()];
  for (const dir of armDirs) {
    const tip = dir.clone().multiplyScalar(0.18);
    crank.add(strut(new THREE.Vector3(0, 0, 0), tip, 0.02, limbMat));
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.07), pedalMat);
    pedal.position.copy(tip);
    crank.add(pedal);
  }
  group.add(crank);

  // Rider: slightly oversized head/torso for cartoon readability at close camera range.
  const hip = new THREE.Vector3(0, seat.y + 0.08, seat.z + 0.03);
  const shoulder = new THREE.Vector3(0, 1.4, 0.3);
  const torsoDir = new THREE.Vector3().subVectors(shoulder, hip);
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.16, Math.max(0.05, torsoDir.length() - 0.32), 4, 8),
    jerseyMat,
  );
  torso.position.copy(hip).addScaledVector(torsoDir, 0.5);
  torso.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), torsoDir.clone().normalize());
  group.add(torso);

  const headPos = shoulder.clone().addScaledVector(torsoDir.clone().normalize(), 0.3);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skinMat);
  head.position.copy(headPos);
  group.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), helmetMat);
  helmet.position.copy(headPos).add(new THREE.Vector3(0, 0.015, 0));
  group.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.03), visorMat);
  visor.position.copy(headPos).add(new THREE.Vector3(0, -0.02, 0.14));
  group.add(visor);

  group.add(
    strut(
      shoulder.clone().add(new THREE.Vector3(-0.17, -0.02, 0)),
      bar.clone().add(new THREE.Vector3(-0.19, 0, 0)),
      0.045,
      jerseyMat,
    ),
  );
  group.add(
    strut(
      shoulder.clone().add(new THREE.Vector3(0.17, -0.02, 0)),
      bar.clone().add(new THREE.Vector3(0.19, 0, 0)),
      0.045,
      jerseyMat,
    ),
  );

  const kneeL = new THREE.Vector3(-0.11, bb.y + 0.14, bb.z + 0.02);
  const kneeR = new THREE.Vector3(0.11, bb.y + 0.14, bb.z + 0.02);
  group.add(strut(hip.clone().add(new THREE.Vector3(-0.1, 0, 0)), kneeL, 0.05, shortsMat));
  group.add(strut(hip.clone().add(new THREE.Vector3(0.1, 0, 0)), kneeR, 0.05, shortsMat));
  group.add(strut(kneeL, bb.clone().add(new THREE.Vector3(-0.09, 0, 0)), 0.04, limbMat));
  group.add(strut(kneeR, bb.clone().add(new THREE.Vector3(0.09, 0, 0)), 0.04, limbMat));

  return { group, frontWheel, rearWheel, crank };
}
