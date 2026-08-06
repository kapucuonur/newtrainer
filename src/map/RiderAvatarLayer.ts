import type { CustomLayerInterface, CustomRenderMethodInput, Map } from 'maplibre-gl';
import { MercatorCoordinate } from 'maplibre-gl';
import * as THREE from 'three';
import type { LatLng } from '../routing/types';

/**
 * Realistic 3D bike-and-rider avatar rendered inside MapLibre's WebGL context.
 * Features:
 * - Aero carbon road bike with deep-section rims, spokes, brake rotors, water bottles & full drivetrain.
 * - Dynamic 3D Inverse Kinematics (IK) pedaling legs: thighs, knees, shins, and cycling shoes flex & cycle smoothly with crank rotation.
 * - Wheel spin physics directly tied to speed with visible spokes & valve detailing.
 * - Cadence-synced upper-body hip sway and head motion for true riding realism.
 */

const WHEEL_RADIUS = 0.34;
const AVATAR_VISUAL_SCALE = 15;
const WHEEL_TUBE = 0.042;
const CRANK_RADIUS = 0.175;

// Color Palette & Realistic Materials
const FRAME_COLOR = 0x16181d;      // Stealth carbon
const FRAME_ACCENT = 0x00f0ff;     // Pro cyan racing stripe
const TIRE_COLOR = 0x101215;       // Rubber tire
const RIM_COLOR = 0x22252b;        // Carbon rim
const SPOKE_COLOR = 0x99a0aa;      // Steel spokes
const JERSEY_COLOR = 0x131a29;     // Dark navy kit
const JERSEY_ACCENT = 0x00f0ff;    // Neon cyan highlights
const HELMET_COLOR = 0xf5f5f7;    // Pearl white aero helmet
const CRANK_COLOR = 0x20242b;     // Alloy crank
const SKIN_COLOR = 0xd49b72;      // Warm skin tone
const VISOR_COLOR = 0x08101d;     // Mirrored visor
const PEDAL_COLOR = 0x14171c;     // Clipless pedal
const SHOE_COLOR = 0xeeeeee;      // White road shoe
const BOTTLE_COLOR = 0xe0e6ed;    // White cycling bottle

/** Creates a cylinder mesh scaled to span between `from` and `to`. */
function createStrut(radius: number, material: THREE.Material, radialSegments = 8): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, radialSegments), material);
  return mesh;
}

/** Updates an existing strut mesh to align perfectly from `from` to `to`. */
function updateStrut(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = Math.max(0.001, direction.length());
  mesh.scale.set(1, length, 1);
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
}

function buildWheel(tireMat: THREE.Material, rimMat: THREE.Material, spokeMat: THREE.Material): THREE.Group {
  const wheel = new THREE.Group();

  // Tire
  const tire = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS, WHEEL_TUBE, 12, 32), tireMat);
  tire.rotation.y = Math.PI / 2;
  wheel.add(tire);

  // Deep Aero Rim
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(WHEEL_RADIUS - WHEEL_TUBE * 1.5, WHEEL_TUBE * 0.7, 10, 32),
    rimMat,
  );
  rim.rotation.y = Math.PI / 2;
  wheel.add(rim);

  // Disc Brake Rotor / Hub Center
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 16), rimMat);
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);

  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.004, 16), rimMat);
  rotor.rotation.z = Math.PI / 2;
  rotor.position.x = 0.025;
  wheel.add(rotor);

  // 18 Radiating Spokes in cross pattern
  const spokeCount = 18;
  for (let i = 0; i < spokeCount; i++) {
    const a = (i / spokeCount) * Math.PI * 2;
    const offset = i % 2 === 0 ? 0.015 : -0.015;
    const target = new THREE.Vector3(offset, Math.sin(a) * (WHEEL_RADIUS - WHEEL_TUBE * 1.5), Math.cos(a) * (WHEEL_RADIUS - WHEEL_TUBE * 1.5));
    const spoke = createStrut(0.0035, spokeMat, 4);
    updateStrut(spoke, new THREE.Vector3(offset * 0.5, 0, 0), target);
    wheel.add(spoke);
  }

  // Valve Stem
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 6), rimMat);
  valve.position.set(0, WHEEL_RADIUS - WHEEL_TUBE * 1.2, 0);
  wheel.add(valve);

  return wheel;
}

interface RiderMeshResult {
  group: THREE.Group;
  frontWheel: THREE.Group;
  rearWheel: THREE.Group;
  crankGroup: THREE.Group;
  pedalL: THREE.Group;
  pedalR: THREE.Group;
  // Dynamic Leg Struts for IK
  thighL: THREE.Mesh;
  shinL: THREE.Mesh;
  shoeL: THREE.Mesh;
  thighR: THREE.Mesh;
  shinR: THREE.Mesh;
  shoeR: THREE.Mesh;
  upperBodyGroup: THREE.Group;
  hipPos: THREE.Vector3;
  bbPos: THREE.Vector3;
}

function buildRiderMesh(): RiderMeshResult {
  const group = new THREE.Group();

  // Materials
  const tireMat = new THREE.MeshStandardMaterial({ color: TIRE_COLOR, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: RIM_COLOR, roughness: 0.3, metalness: 0.6 });
  const spokeMat = new THREE.MeshStandardMaterial({ color: SPOKE_COLOR, roughness: 0.2, metalness: 0.8 });
  const frameMat = new THREE.MeshStandardMaterial({ color: FRAME_COLOR, roughness: 0.25, metalness: 0.5 });
  const accentMat = new THREE.MeshStandardMaterial({ color: FRAME_ACCENT, roughness: 0.3, metalness: 0.4 });
  const jerseyMat = new THREE.MeshStandardMaterial({ color: JERSEY_COLOR, roughness: 0.7 });
  const jerseyAccentMat = new THREE.MeshStandardMaterial({ color: JERSEY_ACCENT, roughness: 0.6 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: HELMET_COLOR, roughness: 0.25, metalness: 0.2 });
  const crankMat = new THREE.MeshStandardMaterial({ color: CRANK_COLOR, roughness: 0.4, metalness: 0.6 });
  const skinMat = new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.65 });
  const visorMat = new THREE.MeshStandardMaterial({ color: VISOR_COLOR, roughness: 0.1, metalness: 0.9 });
  const pedalMat = new THREE.MeshStandardMaterial({ color: PEDAL_COLOR, roughness: 0.5 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: SHOE_COLOR, roughness: 0.3 });
  const bottleMat = new THREE.MeshStandardMaterial({ color: BOTTLE_COLOR, roughness: 0.4 });

  // Wheels
  const rearWheel = buildWheel(tireMat, rimMat, spokeMat);
  rearWheel.position.set(0, WHEEL_RADIUS, -0.82);
  const frontWheel = buildWheel(tireMat, rimMat, spokeMat);
  frontWheel.position.set(0, WHEEL_RADIUS, 0.82);
  group.add(rearWheel, frontWheel);

  // Key Frame Nodes
  const rearHub = new THREE.Vector3(0, WHEEL_RADIUS, -0.82);
  const frontHub = new THREE.Vector3(0, WHEEL_RADIUS, 0.82);
  const bbPos = new THREE.Vector3(0, 0.30, -0.05);
  const seatPos = new THREE.Vector3(0, 0.92, -0.28);
  const headTubeBottom = new THREE.Vector3(0, 0.78, 0.60);
  const headTubeTop = new THREE.Vector3(0, 0.94, 0.64);
  const stemBar = new THREE.Vector3(0, 1.01, 0.76);

  // Bike Frame Tubes (Main Triangle + Rear Stays)
  // Down Tube (Aero tapered)
  const downTube = createStrut(0.032, frameMat, 8);
  updateStrut(downTube, bbPos, headTubeBottom);
  group.add(downTube);

  // Top Tube
  const topTube = createStrut(0.026, frameMat, 8);
  updateStrut(topTube, seatPos, headTubeTop);
  group.add(topTube);

  // Seat Tube
  const seatTube = createStrut(0.028, frameMat, 8);
  updateStrut(seatTube, bbPos, seatPos);
  group.add(seatTube);

  // Head Tube
  const headTube = createStrut(0.03, frameMat, 8);
  updateStrut(headTube, headTubeBottom, headTubeTop);
  group.add(headTube);

  // Front Fork Blades (Left & Right)
  const forkL = createStrut(0.018, frameMat, 6);
  updateStrut(forkL, headTubeBottom, frontHub.clone().add(new THREE.Vector3(-0.04, 0, 0)));
  const forkR = createStrut(0.018, frameMat, 6);
  updateStrut(forkR, headTubeBottom, frontHub.clone().add(new THREE.Vector3(0.04, 0, 0)));
  group.add(forkL, forkR);

  // Seat Stays (Left & Right)
  const seatStayL = createStrut(0.014, frameMat, 6);
  updateStrut(seatStayL, seatPos, rearHub.clone().add(new THREE.Vector3(-0.04, 0, 0)));
  const seatStayR = createStrut(0.014, frameMat, 6);
  updateStrut(seatStayR, seatPos, rearHub.clone().add(new THREE.Vector3(0.04, 0, 0)));
  group.add(seatStayL, seatStayR);

  // Chain Stays (Left & Right)
  const chainStayL = createStrut(0.018, frameMat, 6);
  updateStrut(chainStayL, bbPos.clone().add(new THREE.Vector3(-0.03, 0, 0)), rearHub.clone().add(new THREE.Vector3(-0.04, 0, 0)));
  const chainStayR = createStrut(0.018, frameMat, 6);
  updateStrut(chainStayR, bbPos.clone().add(new THREE.Vector3(0.03, 0, 0)), rearHub.clone().add(new THREE.Vector3(0.04, 0, 0)));
  group.add(chainStayL, chainStayR);

  // Frame Accent Stripes
  const stripe = createStrut(0.027, accentMat, 8);
  updateStrut(stripe, seatPos.clone().add(new THREE.Vector3(0, -0.1, 0.12)), seatPos.clone().add(new THREE.Vector3(0, -0.15, 0.18)));
  group.add(stripe);

  // Handlebars (Drop Bar geometry)
  const stem = createStrut(0.016, frameMat, 6);
  updateStrut(stem, headTubeTop, stemBar);
  group.add(stem);

  // Bar top
  const barTop = createStrut(0.014, frameMat, 6);
  updateStrut(barTop, stemBar.clone().add(new THREE.Vector3(-0.21, 0, 0)), stemBar.clone().add(new THREE.Vector3(0.21, 0, 0)));
  group.add(barTop);

  // Drop curves & Hoods
  const hoodL = stemBar.clone().add(new THREE.Vector3(-0.21, -0.02, 0.12));
  const hoodR = stemBar.clone().add(new THREE.Vector3(0.21, -0.02, 0.12));
  const dropBarL = createStrut(0.013, frameMat, 6);
  updateStrut(dropBarL, stemBar.clone().add(new THREE.Vector3(-0.21, 0, 0)), hoodL);
  const dropBarR = createStrut(0.013, frameMat, 6);
  updateStrut(dropBarR, stemBar.clone().add(new THREE.Vector3(0.21, 0, 0)), hoodR);
  group.add(dropBarL, dropBarR);

  // Brake Levers
  const leverL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.08, 0.01), crankMat);
  leverL.position.copy(hoodL).add(new THREE.Vector3(0, -0.04, 0.01));
  const leverR = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.08, 0.01), crankMat);
  leverR.position.copy(hoodR).add(new THREE.Vector3(0, -0.04, 0.01));
  group.add(leverL, leverR);

  // Saddle & Seatpost
  const seatPost = createStrut(0.015, frameMat, 6);
  updateStrut(seatPost, seatPos, seatPos.clone().add(new THREE.Vector3(0, 0.08, -0.02)));
  group.add(seatPost);

  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.27), frameMat);
  saddle.position.copy(seatPos).add(new THREE.Vector3(0, 0.09, -0.02));
  group.add(saddle);

  // Water Bottle & Cage
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 12), bottleMat);
  bottle.position.copy(bbPos).add(new THREE.Vector3(0, 0.22, 0.22));
  bottle.rotation.x = -Math.PI / 4;
  group.add(bottle);

  // Drivetrain: Chainring & Cassette
  const chainring = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.006, 20), crankMat);
  chainring.rotation.z = Math.PI / 2;
  chainring.position.copy(bbPos).add(new THREE.Vector3(0.04, 0, 0));
  group.add(chainring);

  const cassette = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.04, 0.025, 16), crankMat);
  cassette.rotation.z = Math.PI / 2;
  cassette.position.copy(rearHub).add(new THREE.Vector3(0.035, 0, 0));
  group.add(cassette);

  // Rotating Crankset & Pedals Group
  const crankGroup = new THREE.Group();
  crankGroup.position.copy(bbPos);

  const crankArmR = createStrut(0.016, crankMat, 6);
  updateStrut(crankArmR, new THREE.Vector3(0.05, 0, 0), new THREE.Vector3(0.05, 0, CRANK_RADIUS));
  crankGroup.add(crankArmR);

  const crankArmL = createStrut(0.016, crankMat, 6);
  updateStrut(crankArmL, new THREE.Vector3(-0.05, 0, 0), new THREE.Vector3(-0.05, 0, -CRANK_RADIUS));
  crankGroup.add(crankArmL);

  const pedalR = new THREE.Group();
  pedalR.position.set(0.09, 0, CRANK_RADIUS);
  const pedalBodyR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.075), pedalMat);
  pedalR.add(pedalBodyR);
  crankGroup.add(pedalR);

  const pedalL = new THREE.Group();
  pedalL.position.set(-0.09, 0, -CRANK_RADIUS);
  const pedalBodyL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.075), pedalMat);
  pedalL.add(pedalBodyL);
  crankGroup.add(pedalL);

  group.add(crankGroup);

  // Upper Body Group (Hip, Torso, Head, Arms)
  const upperBodyGroup = new THREE.Group();
  const hipPos = seatPos.clone().add(new THREE.Vector3(0, 0.10, -0.01));
  const shoulderPos = new THREE.Vector3(0, 1.34, 0.28);
  const torsoDir = new THREE.Vector3().subVectors(shoulderPos, hipPos);

  // Torso / Pro Jersey
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.13, Math.max(0.05, torsoDir.length() - 0.22), 12, 16),
    jerseyMat,
  );
  torso.position.copy(hipPos).addScaledVector(torsoDir, 0.5);
  torso.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), torsoDir.clone().normalize());
  upperBodyGroup.add(torso);

  // Jersey Accent Stripe
  const jerseyStripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.18), jerseyAccentMat);
  jerseyStripe.position.copy(hipPos).addScaledVector(torsoDir, 0.7);
  jerseyStripe.quaternion.copy(torso.quaternion);
  upperBodyGroup.add(jerseyStripe);

  // Head & Helmet
  const headPos = shoulderPos.clone().addScaledVector(torsoDir.clone().normalize(), 0.18);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.108, 16, 14), helmetMat);
  head.position.copy(headPos);

  // Helmet Vents / Visor
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.05, 0.06), visorMat);
  visor.position.copy(headPos).add(new THREE.Vector3(0, -0.02, 0.095));
  head.add(visor);
  upperBodyGroup.add(head);

  // Arms to Handlebar Hoods
  const shoulderL = shoulderPos.clone().add(new THREE.Vector3(-0.16, -0.02, 0));
  const shoulderR = shoulderPos.clone().add(new THREE.Vector3(0.16, -0.02, 0));
  const elbowL = shoulderL.clone().add(new THREE.Vector3(-0.04, -0.14, 0.22));
  const elbowR = shoulderR.clone().add(new THREE.Vector3(0.04, -0.14, 0.22));

  // Left Arm (Upper + Forearm)
  const bicepL = createStrut(0.028, skinMat, 6);
  updateStrut(bicepL, shoulderL, elbowL);
  const forearmL = createStrut(0.026, skinMat, 6);
  updateStrut(forearmL, elbowL, hoodL);
  upperBodyGroup.add(bicepL, forearmL);

  // Right Arm (Upper + Forearm)
  const bicepR = createStrut(0.028, skinMat, 6);
  updateStrut(bicepR, shoulderR, elbowR);
  const forearmR = createStrut(0.026, skinMat, 6);
  updateStrut(forearmR, elbowR, hoodR);
  upperBodyGroup.add(bicepR, forearmR);

  group.add(upperBodyGroup);

  // Dynamic IK Leg Struts (Thighs, Shins, Shoes)
  const thighL = createStrut(0.038, skinMat, 8);
  const shinL = createStrut(0.030, skinMat, 8);
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.045, 0.22), shoeMat);
  group.add(thighL, shinL, shoeL);

  const thighR = createStrut(0.038, skinMat, 8);
  const shinR = createStrut(0.030, skinMat, 8);
  const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.045, 0.22), shoeMat);
  group.add(thighR, shinR, shoeR);

  return {
    group,
    frontWheel,
    rearWheel,
    crankGroup,
    pedalL,
    pedalR,
    thighL,
    shinL,
    shoeL,
    thighR,
    shinR,
    shoeR,
    upperBodyGroup,
    hipPos,
    bbPos,
  };
}

export const RIDER_AVATAR_LAYER_ID = 'rider-avatar-3d';

export class RiderAvatarLayer implements CustomLayerInterface {
  id = RIDER_AVATAR_LAYER_ID;
  type = 'custom' as const;
  renderingMode = '3d' as const;

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
  private crankGroup: THREE.Group | null = null;
  private upperBodyGroup: THREE.Group | null = null;

  // Dynamic IK references
  private thighL: THREE.Mesh | null = null;
  private shinL: THREE.Mesh | null = null;
  private shoeL: THREE.Mesh | null = null;

  private thighR: THREE.Mesh | null = null;
  private shinR: THREE.Mesh | null = null;
  private shoeR: THREE.Mesh | null = null;

  private hipPos = new THREE.Vector3();
  private bbPos = new THREE.Vector3();

  private crankAngle = 0;
  private lastFrameTime = 0;

  onAdd(map: Map, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;

    // Realistic outdoor lighting setup
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(0.5, 1.2, 0.8);
    this.scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0x88bbff, 0.4);
    fillLight.position.set(-0.5, 0.5, -0.8);
    this.scene.add(fillLight);

    this.anchor.rotation.x = Math.PI / 2;
    this.anchor.add(this.heading);
    this.scene.add(this.anchor);

    const res = buildRiderMesh();
    this.heading.add(res.group);

    this.frontWheel = res.frontWheel;
    this.rearWheel = res.rearWheel;
    this.crankGroup = res.crankGroup;
    this.upperBodyGroup = res.upperBodyGroup;

    this.thighL = res.thighL;
    this.shinL = res.shinL;
    this.shoeL = res.shoeL;

    this.thighR = res.thighR;
    this.shinR = res.shinR;
    this.shoeR = res.shoeR;

    this.hipPos.copy(res.hipPos);
    this.bbPos.copy(res.bbPos);

    this.lastFrameTime = performance.now();
  }

  /**
   * Calculates the 3D Knee position via Inverse Kinematics (IK) for a given Hip and Pedal position.
   */
  private solveKneeIK(hip: THREE.Vector3, pedal: THREE.Vector3, isLeft: boolean): THREE.Vector3 {
    const thighLength = 0.43;
    const shinLength = 0.41;

    const vec = new THREE.Vector3().subVectors(pedal, hip);
    const dist = Math.max(0.1, Math.min(thighLength + shinLength - 0.01, vec.length()));
    vec.normalize();

    // Angle at hip from law of cosines
    const cosAngle = Math.max(-1, Math.min(1, (thighLength * thighLength + dist * dist - shinLength * shinLength) / (2 * thighLength * dist)));
    const angle = Math.acos(cosAngle);

    // Forward (+Z) knee flare direction with slight outward offset (+X / -X)
    const sideSign = isLeft ? -1 : 1;
    const forward = new THREE.Vector3(sideSign * 0.12, 0.25, 0.95).normalize();

    // Knee vector orthogonal component
    const ortho = new THREE.Vector3().crossVectors(vec, forward).cross(vec).normalize();
    if (ortho.lengthSq() < 0.001) ortho.set(sideSign * 0.2, 0, 1).normalize();

    const kneeDir = vec.clone().multiplyScalar(Math.cos(angle)).addScaledVector(ortho, Math.sin(angle)).normalize();
    return hip.clone().addScaledVector(kneeDir, thighLength);
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
    const worldSize = 512 * Math.pow(2, map.getZoom());
    this.anchor.position.set(mercator.x * worldSize, mercator.y * worldSize, mercator.z * worldSize);
    this.anchor.scale.setScalar(scale * worldSize * AVATAR_VISUAL_SCALE);
    this.heading.rotation.y = THREE.MathUtils.degToRad(this.bearingDeg);

    // Wheel spin & Crank pedal rotation physics
    const speedMs = this.speedKmh / 3.6;
    const wheelSpin = (speedMs / WHEEL_RADIUS) * dt;

    if (this.frontWheel) this.frontWheel.rotation.x -= wheelSpin;
    if (this.rearWheel) this.rearWheel.rotation.x -= wheelSpin;

    // Pedaling cadence (scaled so pedaling is active even at low/moderate speeds)
    const pedalCadenceSpeed = Math.max(speedMs > 0.5 ? speedMs : 0, 3.5);
    const pedalSpin = (pedalCadenceSpeed / WHEEL_RADIUS) * 0.7 * dt;
    this.crankAngle += pedalSpin;
    if (this.crankGroup) this.crankGroup.rotation.x = -this.crankAngle;

    // Synchronized Upper Body Hip/Torso Sway
    if (this.upperBodyGroup) {
      this.upperBodyGroup.rotation.z = Math.sin(this.crankAngle) * 0.025;
      this.upperBodyGroup.position.y = Math.abs(Math.sin(this.crankAngle * 2)) * 0.008;
    }

    // Dynamic 3D IK Leg Calculation (Left & Right Legs)
    const hipL = this.hipPos.clone().add(new THREE.Vector3(-0.11, 0, 0));
    const hipR = this.hipPos.clone().add(new THREE.Vector3(0.11, 0, 0));

    // Pedal positions in world model coordinates
    const pedalOffsetY = -Math.sin(this.crankAngle) * CRANK_RADIUS;
    const pedalOffsetZ = Math.cos(this.crankAngle) * CRANK_RADIUS;

    const pedalR = this.bbPos.clone().add(new THREE.Vector3(0.09, pedalOffsetY, pedalOffsetZ));
    const pedalL = this.bbPos.clone().add(new THREE.Vector3(-0.09, -pedalOffsetY, -pedalOffsetZ));

    // Solve 3D Knee Joints
    const kneeL = this.solveKneeIK(hipL, pedalL, true);
    const kneeR = this.solveKneeIK(hipR, pedalR, false);

    // Update Left Leg (Thigh, Shin, Shoe)
    if (this.thighL && this.shinL && this.shoeL) {
      updateStrut(this.thighL, hipL, kneeL);
      updateStrut(this.shinL, kneeL, pedalL);
      this.shoeL.position.copy(pedalL).add(new THREE.Vector3(0, 0.02, 0.03));
      this.shoeL.rotation.x = -Math.sin(this.crankAngle) * 0.2;
    }

    // Update Right Leg (Thigh, Shin, Shoe)
    if (this.thighR && this.shinR && this.shoeR) {
      updateStrut(this.thighR, hipR, kneeR);
      updateStrut(this.shinR, kneeR, pedalR);
      this.shoeR.position.copy(pedalR).add(new THREE.Vector3(0, 0.02, 0.03));
      this.shoeR.rotation.x = Math.sin(this.crankAngle) * 0.2;
    }

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

