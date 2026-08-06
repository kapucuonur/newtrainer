import type { CustomLayerInterface, CustomRenderMethodInput, Map } from 'maplibre-gl';
import { MercatorCoordinate } from 'maplibre-gl';
import * as THREE from 'three';
import type { LatLng } from '../routing/types';

/**
 * Procedural low-poly bike-and-rider avatar rendered inside MapLibre's own
 * WebGL context via a CustomLayerInterface, so it shares the map's real
 * camera (position/zoom/pitch/bearing) instead of being a flat billboard.
 *
 * No external 3D asset — built entirely from primitives (torus wheels, thin
 * cylinder "struts" for frame/limbs, capsule torso) in real-world meters, so
 * `anchor.scale` (mercator units per meter) makes it read at true size next
 * to real buildings/roads.
 */

const WHEEL_RADIUS = 0.34;
/**
 * Visual-only exaggeration so the avatar reads at ride-camera zoom (real
 * scale is sub-pixel there). This scales the model's real-world "meters" —
 * at 26x the ~1.7m bike became a ~44m object, which was fine at the ride
 * camera's original distance/pitch but, once that camera moved closer and
 * flatter (near-horizontal), the same 44m object loomed edge-on like a
 * tower. Tuned down to roughly match the original on-screen size at the
 * new, closer camera.
 */
const AVATAR_VISUAL_SCALE = 15;
const WHEEL_TUBE = 0.045;

const FRAME_COLOR = 0x00e5ff;
const TIRE_COLOR = 0x14181f;
const RIM_COLOR = 0xdfe6ee;
const JERSEY_COLOR = 0xf2f5f8;
const HELMET_COLOR = 0x00c2e0;
const LIMB_COLOR = 0x3a4048;
const VISOR_COLOR = 0x0a0d12;
const PEDAL_COLOR = 0x161a20;

/** Thin cylinder oriented from `from` to `to` — the one reusable "bone" primitive. */
function strut(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = Math.max(0.01, direction.length());
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 6), material);
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function buildWheel(tireMat: THREE.Material, rimMat: THREE.Material): THREE.Group {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS, WHEEL_TUBE, 8, 20), tireMat);
  tire.rotation.y = Math.PI / 2;
  wheel.add(tire);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(WHEEL_RADIUS - WHEEL_TUBE * 1.6, WHEEL_TUBE * 0.4, 6, 20),
    rimMat,
  );
  rim.rotation.y = Math.PI / 2;
  wheel.add(rim);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    wheel.add(
      strut(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, Math.sin(a) * WHEEL_RADIUS * 0.9, Math.cos(a) * WHEEL_RADIUS * 0.9),
        0.008,
        rimMat,
      ),
    );
  }
  return wheel;
}

/** Builds the bike+rider group facing local +Z ("forward"), standing on local Y=0 ("ground"). */
function buildRiderMesh(): { group: THREE.Group; frontWheel: THREE.Group; rearWheel: THREE.Group; crank: THREE.Group } {
  const group = new THREE.Group();

  const tireMat = new THREE.MeshStandardMaterial({ color: TIRE_COLOR, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: RIM_COLOR, roughness: 0.4, metalness: 0.3 });
  const frameMat = new THREE.MeshStandardMaterial({
    color: FRAME_COLOR,
    roughness: 0.35,
    metalness: 0.15,
    emissive: 0x00343d,
    emissiveIntensity: 0.4,
  });
  const jerseyMat = new THREE.MeshStandardMaterial({ color: JERSEY_COLOR, roughness: 0.7 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: HELMET_COLOR, roughness: 0.3 });
  const limbMat = new THREE.MeshStandardMaterial({ color: LIMB_COLOR, roughness: 0.6 });
  const visorMat = new THREE.MeshStandardMaterial({ color: VISOR_COLOR, roughness: 0.2 });
  const pedalMat = new THREE.MeshStandardMaterial({ color: PEDAL_COLOR, roughness: 0.5 });

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
  const bar = new THREE.Vector3(0, 1.02, 0.78);

  group.add(strut(rearHub, seat, 0.02, frameMat));
  group.add(strut(rearHub, bb, 0.022, frameMat));
  group.add(strut(bb, seat, 0.024, frameMat));
  group.add(strut(seat, headTube, 0.02, frameMat));
  group.add(strut(bb, headTube, 0.022, frameMat));
  group.add(strut(headTube, frontHub, 0.02, frameMat));
  group.add(strut(headTube, bar, 0.016, frameMat));
  group.add(
    strut(new THREE.Vector3(-0.22, bar.y, bar.z), new THREE.Vector3(0.22, bar.y, bar.z), 0.014, frameMat),
  );

  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.24), frameMat);
  saddle.position.set(0, seat.y + 0.05, seat.z - 0.02);
  group.add(saddle);

  // Crank: a group at the bottom-bracket whose rotation.x we animate each
  // frame — the two arms/pedals are rigid children, so they swing together.
  const crank = new THREE.Group();
  crank.position.copy(bb);
  const armDirs = [new THREE.Vector3(0, -1, 0.05).normalize(), new THREE.Vector3(0, 1, -0.05).normalize()];
  for (const dir of armDirs) {
    const tip = dir.clone().multiplyScalar(0.17);
    crank.add(strut(new THREE.Vector3(0, 0, 0), tip, 0.016, limbMat));
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.06), pedalMat);
    pedal.position.copy(tip);
    crank.add(pedal);
  }
  group.add(crank);

  // Rider: leaning torso (hip -> shoulder), head, arms to the bar, static legs.
  const hip = new THREE.Vector3(0, seat.y + 0.06, seat.z + 0.03);
  const shoulder = new THREE.Vector3(0, 1.34, 0.28);
  const torsoDir = new THREE.Vector3().subVectors(shoulder, hip);
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.115, Math.max(0.05, torsoDir.length() - 0.23), 4, 8),
    jerseyMat,
  );
  torso.position.copy(hip).addScaledVector(torsoDir, 0.5);
  torso.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), torsoDir.clone().normalize());
  group.add(torso);

  const headPos = shoulder.clone().addScaledVector(torsoDir.clone().normalize(), 0.22);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), helmetMat);
  head.position.copy(headPos);
  group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), visorMat);
  visor.position.copy(headPos).add(new THREE.Vector3(0, -0.01, 0.09));
  group.add(visor);

  group.add(strut(shoulder.clone().add(new THREE.Vector3(-0.14, -0.02, 0)), bar.clone().add(new THREE.Vector3(-0.18, 0, 0)), 0.028, limbMat));
  group.add(strut(shoulder.clone().add(new THREE.Vector3(0.14, -0.02, 0)), bar.clone().add(new THREE.Vector3(0.18, 0, 0)), 0.028, limbMat));

  const kneeL = new THREE.Vector3(-0.1, bb.y + 0.12, bb.z + 0.02);
  const kneeR = new THREE.Vector3(0.1, bb.y + 0.12, bb.z + 0.02);
  group.add(strut(hip.clone().add(new THREE.Vector3(-0.09, 0, 0)), kneeL, 0.032, limbMat));
  group.add(strut(hip.clone().add(new THREE.Vector3(0.09, 0, 0)), kneeR, 0.032, limbMat));
  group.add(strut(kneeL, bb.clone().add(new THREE.Vector3(-0.09, 0, 0)), 0.026, limbMat));
  group.add(strut(kneeR, bb.clone().add(new THREE.Vector3(0.09, 0, 0)), 0.026, limbMat));

  return { group, frontWheel, rearWheel, crank };
}

export const RIDER_AVATAR_LAYER_ID = 'rider-avatar-3d';

export class RiderAvatarLayer implements CustomLayerInterface {
  id = RIDER_AVATAR_LAYER_ID;
  type = 'custom' as const;
  renderingMode = '3d' as const;

  /** Mutable external state — RouteMap writes these each tick, render() reads them each frame. */
  visible = false;
  position: LatLng | null = null;
  bearingDeg = 0;
  speedKmh = 0;

  private map: Map | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly anchor = new THREE.Group();
  private readonly heading = new THREE.Group();
  private frontWheel: THREE.Group | null = null;
  private rearWheel: THREE.Group | null = null;
  private crank: THREE.Group | null = null;
  private lastFrameTime = 0;

  onAdd(map: Map, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(0.4, 1, 0.6);
    this.scene.add(sun);

    // Three.js is Y-up; mercator/map space is Z-up. This fixed rotation
    // corrects that once; `heading` (child) then rotates around what is now
    // the map's vertical axis to face the real travel bearing each frame.
    this.anchor.rotation.x = Math.PI / 2;
    this.anchor.add(this.heading);
    this.scene.add(this.anchor);

    const { group, frontWheel, rearWheel, crank } = buildRiderMesh();
    this.heading.add(group);
    this.frontWheel = frontWheel;
    this.rearWheel = rearWheel;
    this.crank = crank;
    this.lastFrameTime = performance.now();
  }

  render(_gl: WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const map = this.map;
    const renderer = this.renderer;
    if (!map || !renderer || !this.visible || !this.position) return;

    const now = performance.now();
    const dt = Math.min(0.25, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    const canvas = map.getCanvas();
    renderer.setSize(canvas.width, canvas.height, false);

    const mercator = MercatorCoordinate.fromLngLat([this.position.lng, this.position.lat], 0);
    const scale = mercator.meterInMercatorCoordinateUnits();
    // modelViewProjectionMatrix operates in MapLibre's "world" pixel space
    // (mercator fraction × worldSize), not the raw 0..1 MercatorCoordinate —
    // without this the model sits many orders of magnitude off-position.
    const worldSize = 512 * Math.pow(2, map.getZoom());
    this.anchor.position.set(mercator.x * worldSize, mercator.y * worldSize, mercator.z * worldSize);
    // At true 1:1 scale a ~1.7m bike is sub-pixel at typical ride-camera
    // zoom (~1.5m/px at z16.2) — invisible, not broken. Boost it well past
    // real size, same legibility trade-off Zwift/RGT avatars make.
    this.anchor.scale.setScalar(scale * worldSize * AVATAR_VISUAL_SCALE);
    this.heading.rotation.y = THREE.MathUtils.degToRad(this.bearingDeg);

    const speedMs = this.speedKmh / 3.6;
    const spin = (speedMs / WHEEL_RADIUS) * dt;
    if (this.frontWheel) this.frontWheel.rotation.x -= spin;
    if (this.rearWheel) this.rearWheel.rotation.x -= spin;
    if (this.crank) this.crank.rotation.x -= spin * 1.4;

    this.camera.projectionMatrix.fromArray(options.modelViewProjectionMatrix);

    renderer.resetState();
    renderer.render(this.scene, this.camera);
    map.triggerRepaint();
  }

  onRemove(): void {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }
}
