import type { CustomLayerInterface, CustomRenderMethodInput, Map } from 'maplibre-gl';
import { MercatorCoordinate } from 'maplibre-gl';
import * as THREE from 'three';
import type { LatLng } from '../routing/types';

/**
 * Rider position marker rendered inside MapLibre's WebGL context: a
 * navigation-style arrow lying flat on the road, pointing along the direction
 * of travel, over a soft glow. The ride map is seen from above, so a flat
 * marker reads as "on the road" — the previous upright photo cut-out looked
 * like a sticker hovering over the satellite image at any scale.
 */

/** Marker size in metres per model unit — large enough to read at ride zoom (~16.5). */
const MARKER_SCALE = 9;
const ARROW_COLOR = 0x00f0ff;

export const RIDER_AVATAR_LAYER_ID = 'rider-avatar-3d';

/** Arrow outline in model units, tip toward +Y (rotated to point north / +Z). */
function arrowShape(scale = 1): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.25 * scale);
  shape.lineTo(0.85 * scale, -0.85 * scale);
  shape.lineTo(0, -0.4 * scale);
  shape.lineTo(-0.85 * scale, -0.85 * scale);
  shape.closePath();
  return shape;
}

/** Flat arrow lying in the ground plane, tip toward local +Z (= north before heading). */
function flatArrow(scale: number, color: number, lift: number): THREE.Mesh {
  const geometry = new THREE.ShapeGeometry(arrowShape(scale));
  geometry.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.position.y = lift;
  return mesh;
}

/** Soft radial glow so the marker stays visible on dark or busy imagery. */
function buildGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0,240,255,0.55)');
    gradient.addColorStop(0.6, 'rgba(0,240,255,0.18)');
    gradient.addColorStop(1, 'rgba(0,240,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

export class RiderAvatarLayer implements CustomLayerInterface {
  id = RIDER_AVATAR_LAYER_ID;
  type = 'custom' as const;
  renderingMode = '3d' as const;

  visible = false;
  position: LatLng | null = null;
  bearingDeg = 0;
  speedKmh = 0;
  /** Current rider elevation (metres ASL); kept for RouteMap — the map is drawn flat. */
  elevationMeters = 0;

  private map: Map | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly anchor = new THREE.Group();
  private readonly heading = new THREE.Group();

  onAdd(map: Map, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;

    // Model Y is up; MapLibre's mercator space is Z-up.
    this.anchor.rotation.x = Math.PI / 2;
    this.anchor.add(this.heading);
    this.scene.add(this.anchor);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 4.2),
      new THREE.MeshBasicMaterial({ map: buildGlowTexture(), transparent: true, depthWrite: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.01;
    this.heading.add(glow);

    // White rim under the coloured arrow keeps it legible on bright roads.
    this.heading.add(flatArrow(1.18, 0xffffff, 0.02));
    this.heading.add(flatArrow(1, ARROW_COLOR, 0.03));
  }

  render(_gl: WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const map = this.map;
    const renderer = this.renderer;
    if (!map || !renderer || !this.visible || !this.position) return;

    const canvas = map.getCanvas();
    renderer.setSize(canvas.width, canvas.height, false);

    const mercator = MercatorCoordinate.fromLngLat([this.position.lng, this.position.lat], 0);
    const scale = mercator.meterInMercatorCoordinateUnits();
    const worldSize = 512 * Math.pow(2, map.getZoom());
    this.anchor.position.set(mercator.x * worldSize, mercator.y * worldSize, mercator.z * worldSize);
    this.anchor.scale.setScalar(scale * worldSize * MARKER_SCALE);
    this.heading.rotation.y = THREE.MathUtils.degToRad(this.bearingDeg);

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
        // Material.dispose() does not free its texture (the glow canvas).
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
