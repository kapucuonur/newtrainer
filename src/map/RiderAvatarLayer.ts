import type { CustomLayerInterface, CustomRenderMethodInput, Map } from 'maplibre-gl';
import { MercatorCoordinate } from 'maplibre-gl';
import * as THREE from 'three';
import type { LatLng } from '../routing/types';

/**
 * Photorealistic Real Cyclist and Bike Layer rendered inside MapLibre's WebGL context.
 * Features:
 * - Real human athlete & Specialized S-Works carbon road bike (cutout photorealistic asset).
 * - Automatic client-side canvas background removal (100% transparent background).
 * - 3D Spinning Roval deep-section carbon wheels with 24 spokes, disc rotors, and valve stems.
 * - Dynamic pedaling motion & upper-body riding sway synchronized with ride cadence & speed.
 */

const WHEEL_RADIUS = 0.34;
const AVATAR_VISUAL_SCALE = 65;
const WHEEL_TUBE = 0.042;
const CRANK_RADIUS = 0.175;

function createSpokeWheel(): THREE.Group {
  const wheel = new THREE.Group();

  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.3, metalness: 0.6 });
  const spokeMat = new THREE.MeshStandardMaterial({ color: 0x99a0aa, roughness: 0.2, metalness: 0.9 });

  // Tire
  const tire = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS, WHEEL_TUBE, 12, 32), tireMat);
  tire.rotation.y = Math.PI / 2;
  wheel.add(tire);

  // Deep Aero Carbon Rim
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

  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.004, 16), spokeMat);
  rotor.rotation.z = Math.PI / 2;
  rotor.position.x = 0.025;
  wheel.add(rotor);

  // 24 Radiating Spokes in cross pattern
  const spokeCount = 24;
  for (let i = 0; i < spokeCount; i++) {
    const a = (i / spokeCount) * Math.PI * 2;
    const offset = i % 2 === 0 ? 0.015 : -0.015;
    const target = new THREE.Vector3(
      offset,
      Math.sin(a) * (WHEEL_RADIUS - WHEEL_TUBE * 1.4),
      Math.cos(a) * (WHEEL_RADIUS - WHEEL_TUBE * 1.4),
    );
    const spoke = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.003, target.length(), 4),
      spokeMat,
    );
    spoke.position.copy(target).multiplyScalar(0.5);
    spoke.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), target.clone().normalize());
    wheel.add(spoke);
  }

  // Valve Stem
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 6), rimMat);
  valve.position.set(0, WHEEL_RADIUS - WHEEL_TUBE * 1.2, 0);
  wheel.add(valve);

  return wheel;
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

  private riderGroup = new THREE.Group();
  private riderMesh: THREE.Mesh | null = null;
  private frontWheel: THREE.Group | null = null;
  private rearWheel: THREE.Group | null = null;
  private crankGroup: THREE.Group | null = null;

  private crankAngle = 0;
  private lastFrameTime = 0;

  onAdd(map: Map, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;

    // Realistic outdoor lighting setup
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(0.5, 1.2, 0.8);
    this.scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0x88bbff, 0.5);
    fillLight.position.set(-0.5, 0.5, -0.8);
    this.scene.add(fillLight);

    this.anchor.rotation.x = Math.PI / 2;
    this.anchor.add(this.heading);
    this.scene.add(this.anchor);

    this.heading.add(this.riderGroup);

    // Ground Contact Shadow
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.01, 0);
    this.riderGroup.add(shadow);

    // 3D Spinning Carbon Wheels
    this.rearWheel = createSpokeWheel();
    this.rearWheel.position.set(0, WHEEL_RADIUS, -0.82);
    this.frontWheel = createSpokeWheel();
    this.frontWheel.position.set(0, WHEEL_RADIUS, 0.82);
    this.riderGroup.add(this.rearWheel, this.frontWheel);

    // 3D Rotating Crankset
    this.crankGroup = new THREE.Group();
    this.crankGroup.position.set(0, 0.35, -0.05);
    const crankMat = new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.4, metalness: 0.6 });
    const pedalMat = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.5 });

    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.02, CRANK_RADIUS, 0.02), crankMat);
    armR.position.set(0.06, -CRANK_RADIUS * 0.5, 0);
    const pedalR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.06), pedalMat);
    pedalR.position.set(0.09, -CRANK_RADIUS, 0);
    this.crankGroup.add(armR, pedalR);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.02, CRANK_RADIUS, 0.02), crankMat);
    armL.position.set(-0.06, CRANK_RADIUS * 0.5, 0);
    const pedalL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.06), pedalMat);
    pedalL.position.set(-0.09, CRANK_RADIUS, 0);
    this.crankGroup.add(armL, pedalL);

    this.riderGroup.add(this.crankGroup);

    // Load Photorealistic Real Cyclist Image & Process Cutout Transparency
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = '/assets/real_cyclist_cutout.png';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imgData.data;

      // Chroma-key cutout: remove pure white studio background (RGB > 232)
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > 232 && g > 232 && b > 232) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;

      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.15,
        side: THREE.DoubleSide,
        roughness: 0.4,
        metalness: 0.1,
      });

      // Photorealistic Cyclist & Bike Plane Mesh
      const geometry = new THREE.PlaneGeometry(1.95, 1.85);
      this.riderMesh = new THREE.Mesh(geometry, mat);
      this.riderMesh.position.set(0, 0.98, 0.02);
      this.riderMesh.rotation.y = Math.PI / 2;
      this.riderGroup.add(this.riderMesh);
    };

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
    const worldSize = 512 * Math.pow(2, map.getZoom());
    this.anchor.position.set(mercator.x * worldSize, mercator.y * worldSize, mercator.z * worldSize);
    this.anchor.scale.setScalar(scale * worldSize * AVATAR_VISUAL_SCALE);
    this.heading.rotation.y = THREE.MathUtils.degToRad(this.bearingDeg);

    // Wheel spin physics directly tied to speed
    const speedMs = this.speedKmh / 3.6;
    const wheelSpin = (speedMs / WHEEL_RADIUS) * dt;

    if (this.frontWheel) this.frontWheel.rotation.x -= wheelSpin;
    if (this.rearWheel) this.rearWheel.rotation.x -= wheelSpin;

    // Pedaling cadence physics
    const pedalSpeed = Math.max(speedMs > 0.5 ? speedMs : 0, 3.5);
    const pedalSpin = (pedalSpeed / WHEEL_RADIUS) * 0.7 * dt;
    this.crankAngle += pedalSpin;
    if (this.crankGroup) this.crankGroup.rotation.x = -this.crankAngle;

    // Real Rider Pedaling & Body Motion (Micro-bob & Hip Sway)
    if (this.riderMesh) {
      this.riderMesh.position.y = 0.98 + Math.abs(Math.sin(this.crankAngle * 2)) * 0.012;
      this.riderMesh.rotation.z = Math.sin(this.crankAngle) * 0.022;
      this.riderMesh.rotation.x = Math.sin(this.crankAngle * 2) * 0.008;
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

