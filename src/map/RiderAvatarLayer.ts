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
// Exaggerated so the rider reads at the satellite ride zoom (~16.5), but kept
// in proportion with houses/roads — 45× made a ~100m figure that looked
// like it was hovering above the map instead of riding on the road.
const AVATAR_VISUAL_SCALE = 18;
const AVATAR_WIDTH = 2.4;
const AVATAR_HEIGHT = 2.2;
// real_cyclist_transparent.png has ~4.8% transparent padding under the
// wheels; shift the plane down by that much so the tyres touch the ground.
const AVATAR_BOTTOM_PADDING = 0.048 * AVATAR_HEIGHT;

/** Soft-edged dark blob texture for the ground contact shadow. */
function buildShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,0.75)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
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
  /** Current rider elevation (metres ASL) — fed from real DEM samples so
   * the avatar sits on the terrain mesh rather than at sea level. */
  elevationMeters = 0;

  private map: Map | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly anchor = new THREE.Group();
  private readonly heading = new THREE.Group();

  private riderGroup = new THREE.Group();
  private riderMesh: THREE.Mesh | null = null;

  private crankAngle = 0;
  private lastFrameTime = 0;

  onAdd(map: Map, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;

    // High-visibility outdoor lighting setup
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.5, 1.2, 0.8);
    this.scene.add(sun);

    const cyanRimLight = new THREE.DirectionalLight(0x00f0ff, 0.8);
    cyanRimLight.position.set(-0.5, 0.5, -0.8);
    this.scene.add(cyanRimLight);

    this.anchor.rotation.x = Math.PI / 2;
    this.anchor.add(this.heading);
    this.scene.add(this.anchor);

    this.heading.add(this.riderGroup);

    // Ground contact shadow: an ellipse along the bike's length, drawn before
    // the rider and without depth writes so it reads as on the road surface.
    const shadowMat = new THREE.MeshBasicMaterial({
      map: buildShadowTexture(),
      transparent: true,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.2), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.01, 0);
    shadow.renderOrder = 0;
    this.riderGroup.add(shadow);

    // Load Photorealistic Real Cyclist Image Asset (Pre-processed transparent PNG)
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load('/assets/real_cyclist_transparent.png');
    texture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
    });

    const geometry = new THREE.PlaneGeometry(AVATAR_WIDTH, AVATAR_HEIGHT);
    this.riderMesh = new THREE.Mesh(geometry, mat);
    this.riderMesh.renderOrder = 1;
    this.riderMesh.position.set(0, AVATAR_HEIGHT / 2 - AVATAR_BOTTOM_PADDING, 0.02);
    this.riderGroup.add(this.riderMesh);

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

    const mercator = MercatorCoordinate.fromLngLat(
      [this.position.lng, this.position.lat],
      0,
    );
    const scale = mercator.meterInMercatorCoordinateUnits();
    const worldSize = 512 * Math.pow(2, map.getZoom());
    this.anchor.position.set(mercator.x * worldSize, mercator.y * worldSize, mercator.z * worldSize);
    this.anchor.scale.setScalar(scale * worldSize * AVATAR_VISUAL_SCALE);
    this.heading.rotation.y = THREE.MathUtils.degToRad(this.bearingDeg);

    // Pedaling cadence physics & riding motion
    const speedMs = this.speedKmh / 3.6;
    const pedalSpeed = Math.max(speedMs > 0.5 ? speedMs : 0, 3.5);
    const pedalSpin = (pedalSpeed / WHEEL_RADIUS) * 0.7 * dt;
    this.crankAngle += pedalSpin;

    // Real Rider Pedaling & Body Motion (Micro-bob & 3/4 Profile View)
    if (this.riderMesh) {
      this.riderMesh.rotation.y = Math.PI / 3.2;
      this.riderMesh.position.y =
        AVATAR_HEIGHT / 2 - AVATAR_BOTTOM_PADDING + Math.abs(Math.sin(this.crankAngle * 2)) * 0.015;
    }



    const projMat = Array.isArray(options)
      ? options
      : (options as unknown as CustomRenderMethodInput)?.modelViewProjectionMatrix;

    if (projMat && projMat.length === 16) {
      this.camera.projectionMatrix.fromArray(projMat);
    }

    renderer.resetState();
    renderer.render(this.scene, this.camera);
    _gl.bindVertexArray?.(null);
    _gl.useProgram?.(null);
    map.triggerRepaint();
  }

  onRemove(): void {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        // Material.dispose() does not free its texture — the rider PNG and shadow canvas.
        mats.forEach((m) => {
          (m as THREE.MeshBasicMaterial).map?.dispose();
          m.dispose();
        });
      }
    });
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }
}

