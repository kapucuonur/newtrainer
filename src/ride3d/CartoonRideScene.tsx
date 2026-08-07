import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { EnrichedRoute } from '../routing/types';
import { buildRoadRibbon } from './RoadRibbon';
import { buildScenery, buildSatellitePatch } from './scenery';
import { buildToonRiderModel, type ToonRiderModel } from './riderModel';
import { localPointAtDistance, projectRouteToLocal, type LocalRoutePoint } from './routeProjection';

type Props = {
  route: EnrichedRoute | null;
  distanceMeters: number;
  speedKmh: number;
};

const SKY_COLOR = 0x9fd8ff;
const WHEEL_RADIUS = 0.34;

/**
 * Full-screen, self-contained Three.js scene — no MapLibre involved. Renders
 * a stylized "cartoon" ride: a paved road ribbon following the real route's
 * real turns/hills, scattered low-poly scenery, and a toon-shaded rider in a
 * close third-person chase camera. Mounts/unmounts with the route it's
 * built for (a ride doesn't change route mid-ride).
 */
export function CartoonRideScene({ route, distanceMeters, speedKmh }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const distanceRef = useRef(distanceMeters);
  const speedRef = useRef(speedKmh);

  useEffect(() => {
    distanceRef.current = distanceMeters;
  }, [distanceMeters]);

  useEffect(() => {
    speedRef.current = speedKmh;
  }, [speedKmh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !route || route.samples.length < 2) return;
    let cancelled = false;

    const localPoints: LocalRoutePoint[] = projectRouteToLocal(route.samples);
    const displayDistance = { current: distanceRef.current };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY_COLOR);
    scene.fog = new THREE.Fog(SKY_COLOR, 55, 240);

    scene.add(buildRoadRibbon(localPoints));
    // Scenery loads real (CC0) GLB models over the network — don't block the
    // rest of the scene (camera/avatar/render loop) on that; it pops in
    // a moment later instead.
    void buildScenery(localPoints).then((sceneryGroup) => {
      if (!cancelled) scene.add(sceneryGroup);
    });

    // Real satellite imagery only reads as detail at a small scale — draping
    // one texture over the whole route made it too low-res to resolve even
    // the road. Instead keep a ~320m high-res patch centered on wherever the
    // rider currently is, refetched as they move past its edge.
    const originLat = route.samples[0].lat;
    const originLng = route.samples[0].lng;
    let satellitePatch: THREE.Mesh | null = null;
    let patchCenterDistance = -Infinity;
    let patchRebuildInFlight = false;
    const disposePatch = (mesh: THREE.Mesh) => {
      mesh.geometry.dispose();
      const material = mesh.material as THREE.MeshStandardMaterial;
      // Disposing a material does NOT dispose its texture map — that's a
      // separate GPU resource. Each rebuild allocates a brand-new
      // CanvasTexture (up to ~1792x1792px); missing this leaked one full-size
      // GPU texture per rebuild (every ~100m of travel) until VRAM ran out
      // and crashed the WebGL context entirely.
      material.map?.dispose();
      material.dispose();
    };
    const requestPatchRebuild = (centerDistance: number, cx: number, cy: number, cz: number) => {
      patchRebuildInFlight = true;
      patchCenterDistance = centerDistance;
      void buildSatellitePatch(originLat, originLng, cx, cy, cz)
        .then((mesh) => {
          if (cancelled) {
            if (mesh) disposePatch(mesh);
            return;
          }
          if (mesh) {
            if (satellitePatch) {
              scene.remove(satellitePatch);
              disposePatch(satellitePatch);
            }
            satellitePatch = mesh;
            scene.add(mesh);
          }
        })
        .finally(() => {
          patchRebuildInFlight = false;
        });
    };

    const camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.2, 350);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Warm Natural Outdoor Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const sun = new THREE.DirectionalLight(0xfff5e6, 1.4);
    sun.position.set(40, 70, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 150;
    sun.shadow.camera.left = -25;
    sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 25;
    sun.shadow.camera.bottom = -25;
    scene.add(sun);

    const cyanRim = new THREE.DirectionalLight(0x00f0ff, 0.4);
    cyanRim.position.set(-30, 40, -40);
    scene.add(cyanRim);

    const rider: ToonRiderModel = buildToonRiderModel();
    const headingGroup = new THREE.Group();
    headingGroup.add(rider.group);
    scene.add(headingGroup);

    const cameraPos = new THREE.Vector3();
    const cameraLookAt = new THREE.Vector3();
    let camInit = false;
    let crankAngle = 0;
    const lastForwardFlat = new THREE.Vector3(0, 0, -1);

    let raf = 0;
    let lastTime = performance.now();

    const resize = (): boolean => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 2 || h < 2) return false;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      return true;
    };
    let sized = resize();
    const resizeObserver = new ResizeObserver(() => {
      sized = resize();
    });
    resizeObserver.observe(container);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!sized) {
        sized = resize();
        if (!sized) return;
      }

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const target = distanceRef.current;
      displayDistance.current += (target - displayDistance.current) * Math.min(1, dt * 4);

      const { x, y, z, forward } = localPointAtDistance(localPoints, displayDistance.current);
      headingGroup.position.set(x, y, z);

      if (!patchRebuildInFlight && Math.abs(displayDistance.current - patchCenterDistance) > 100) {
        requestPatchRebuild(displayDistance.current, x, y, z);
      }

      const horizLen = Math.hypot(forward.x, forward.z);
      const forwardFlat =
        horizLen > 0.05
          ? new THREE.Vector3(forward.x / horizLen, 0, forward.z / horizLen)
          : lastForwardFlat;
      lastForwardFlat.copy(forwardFlat);

      headingGroup.rotation.y = Math.atan2(forwardFlat.x, forwardFlat.z);

      const speedMs = speedRef.current / 3.6;
      const spin = (speedMs / WHEEL_RADIUS) * dt;
      rider.frontWheel.rotation.x -= spin;
      rider.rearWheel.rotation.x -= spin;
      
      const pedalSpeed = Math.max(speedMs > 0.5 ? speedMs : 0, 3.2);
      crankAngle += (pedalSpeed / WHEEL_RADIUS) * 0.7 * dt;
      rider.crank.rotation.x = -crankAngle;

      // Realistic 3.rd Person Chase Camera (Ground Level)
      const behind = forwardFlat.clone().multiplyScalar(-1);
      const desiredPos = new THREE.Vector3(x, y, z)
        .addScaledVector(behind, 4.8)
        .add(new THREE.Vector3(0, 2.1, 0));
      const desiredLookAt = new THREE.Vector3(x, y, z)
        .addScaledVector(forwardFlat, 9.0)
        .add(new THREE.Vector3(0, 1.2, 0));

      if (!camInit) {
        cameraPos.copy(desiredPos);
        cameraLookAt.copy(desiredLookAt);
        camInit = true;
      } else {
        cameraPos.lerp(desiredPos, Math.min(1, dt * 3.8));
        cameraLookAt.lerp(desiredLookAt, Math.min(1, dt * 3.8));
      }
      camera.position.copy(cameraPos);
      camera.lookAt(cameraLookAt);

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.dispose();
      scene.traverse((obj) => {
        // Real-asset InstancedMeshes reference the asset loader's cached,
        // shared geometry/material (reused across route changes) — disposing
        // them here would corrupt the cache for the next ride.
        if (obj instanceof THREE.Mesh && !obj.userData.sharedResource) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      container.removeChild(renderer.domElement);
    };
  }, [route]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}
