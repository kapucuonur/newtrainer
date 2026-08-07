import * as THREE from 'three';

const WHEEL_RADIUS = 0.34;

function strut(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = Math.max(0.01, direction.length());
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildSpokeWheel(): THREE.Group {
  const wheel = new THREE.Group();
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x2d323c, roughness: 0.3, metalness: 0.8 });
  const spokeMat = new THREE.MeshStandardMaterial({ color: 0xd0d5dd, roughness: 0.1, metalness: 0.95 });

  // Tire
  const tire = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS, 0.045, 12, 32), tireMat);
  tire.rotation.y = Math.PI / 2;
  tire.castShadow = true;
  wheel.add(tire);

  // Deep Aero Carbon Rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS - 0.05, 0.025, 10, 32), rimMat);
  rim.rotation.y = Math.PI / 2;
  wheel.add(rim);

  // Hub Center & Disc Rotor
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 16), rimMat);
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);

  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.003, 16), spokeMat);
  rotor.rotation.z = Math.PI / 2;
  rotor.position.x = 0.025;
  wheel.add(rotor);

  // 16 Radiating Spokes
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const target = new THREE.Vector3(0, Math.sin(angle) * (WHEEL_RADIUS - 0.05), Math.cos(angle) * (WHEEL_RADIUS - 0.05));
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, target.length(), 4), spokeMat);
    spoke.position.copy(target).multiplyScalar(0.5);
    spoke.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), target.clone().normalize());
    wheel.add(spoke);
  }

  return wheel;
}

export type ToonRiderModel = {
  group: THREE.Group;
  frontWheel: THREE.Group;
  rearWheel: THREE.Group;
  crank: THREE.Group;
  thighL: THREE.Mesh;
  thighR: THREE.Mesh;
  shinL: THREE.Mesh;
  shinR: THREE.Mesh;
};

export function buildToonRiderModel(_gradientMap?: THREE.Texture): ToonRiderModel {
  const group = new THREE.Group();

  // Premium Materials
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.2, metalness: 0.9 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.1, metalness: 0.5 });
  const jerseyMat = new THREE.MeshStandardMaterial({ color: 0x00d9ff, roughness: 0.5 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: 0x12151c, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0a982, roughness: 0.6 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.4 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: 0.1, metalness: 0.95 });
  const saddleMat = new THREE.MeshStandardMaterial({ color: 0x12151c, roughness: 0.6 });
  const pedalMat = new THREE.MeshStandardMaterial({ color: 0x222630, roughness: 0.4, metalness: 0.8 });

  // Wheels
  const rearWheel = buildSpokeWheel();
  rearWheel.position.set(0, WHEEL_RADIUS, -0.82);
  const frontWheel = buildSpokeWheel();
  frontWheel.position.set(0, WHEEL_RADIUS, 0.82);
  group.add(rearWheel, frontWheel);

  // Carbon Frame Geometry
  const rearHub = new THREE.Vector3(0, WHEEL_RADIUS, -0.82);
  const frontHub = new THREE.Vector3(0, WHEEL_RADIUS, 0.82);
  const bb = new THREE.Vector3(0, 0.32, -0.05);
  const seat = new THREE.Vector3(0, 0.92, -0.28);
  const headTube = new THREE.Vector3(0, 0.92, 0.62);
  const bar = new THREE.Vector3(0, 1.02, 0.78);

  // Main Carbon Tubes
  group.add(strut(rearHub, seat, 0.022, frameMat));
  group.add(strut(rearHub, bb, 0.024, frameMat));
  group.add(strut(bb, seat, 0.035, frameMat));
  group.add(strut(seat, headTube, 0.032, accentMat));
  group.add(strut(bb, headTube, 0.042, frameMat));
  group.add(strut(headTube, frontHub, 0.024, frameMat));
  group.add(strut(headTube, bar, 0.028, frameMat));

  // Drop Handlebars
  const barCross = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.44, 12), saddleMat);
  barCross.rotation.z = Math.PI / 2;
  barCross.position.copy(bar);
  group.add(barCross);

  // Saddle
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.28), saddleMat);
  saddle.position.set(0, seat.y + 0.05, seat.z - 0.02);
  saddle.castShadow = true;
  group.add(saddle);

  // Crankset & Pedals
  const crank = new THREE.Group();
  crank.position.copy(bb);
  const armDirs = [new THREE.Vector3(0, -1, 0.05).normalize(), new THREE.Vector3(0, 1, -0.05).normalize()];
  for (const dir of armDirs) {
    const tip = dir.clone().multiplyScalar(0.175);
    crank.add(strut(new THREE.Vector3(0, 0, 0), tip, 0.018, pedalMat));
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.07), pedalMat);
    pedal.position.copy(tip);
    crank.add(pedal);
  }
  group.add(crank);

  // Cyclist Body & Torso
  const hip = new THREE.Vector3(0, seat.y + 0.08, seat.z + 0.03);
  const shoulder = new THREE.Vector3(0, 1.38, 0.28);
  const torsoDir = new THREE.Vector3().subVectors(shoulder, hip);
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.16, Math.max(0.05, torsoDir.length() - 0.28), 8, 16),
    jerseyMat,
  );
  torso.position.copy(hip).addScaledVector(torsoDir, 0.5);
  torso.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), torsoDir.clone().normalize());
  torso.castShadow = true;
  group.add(torso);

  // Head & Helmet
  const headPos = shoulder.clone().addScaledVector(torsoDir.clone().normalize(), 0.28);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 14), skinMat);
  head.position.copy(headPos);
  head.castShadow = true;
  group.add(head);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.65), helmetMat);
  helmet.position.copy(headPos).add(new THREE.Vector3(0, 0.015, 0));
  helmet.castShadow = true;
  group.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.06), visorMat);
  visor.position.copy(headPos).add(new THREE.Vector3(0, -0.02, 0.12));
  group.add(visor);

  // Arms
  group.add(strut(shoulder.clone().add(new THREE.Vector3(-0.16, -0.02, 0)), bar.clone().add(new THREE.Vector3(-0.18, 0, 0)), 0.038, jerseyMat));
  group.add(strut(shoulder.clone().add(new THREE.Vector3(0.16, -0.02, 0)), bar.clone().add(new THREE.Vector3(0.18, 0, 0)), 0.038, jerseyMat));

  // Thighs & Shins
  const kneeLPos = new THREE.Vector3(-0.11, bb.y + 0.16, bb.z + 0.04);
  const kneeRPos = new THREE.Vector3(0.11, bb.y + 0.16, bb.z + 0.04);
  const thighL = strut(hip.clone().add(new THREE.Vector3(-0.09, 0, 0)), kneeLPos, 0.048, shortsMat);
  const thighR = strut(hip.clone().add(new THREE.Vector3(0.09, 0, 0)), kneeRPos, 0.048, shortsMat);
  const shinL = strut(kneeLPos, bb.clone().add(new THREE.Vector3(-0.09, 0, 0)), 0.038, skinMat);
  const shinR = strut(kneeRPos, bb.clone().add(new THREE.Vector3(0.09, 0, 0)), 0.038, skinMat);

  group.add(thighL, thighR, shinL, shinR);

  return { group, frontWheel, rearWheel, crank, thighL, thighR, shinL, shinR };
}
