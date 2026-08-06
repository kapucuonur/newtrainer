import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { EnrichedRoute } from '../routing/types';
import { buildRoadRibbon } from './RoadRibbon';
import { buildScenery } from './scenery';
import { createToonGradientTexture, buildToonRiderModel, type ToonRiderModel } from './riderModel';
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

    const localPoints: LocalRoutePoint[] = projectRouteToLocal(route.samples);
    const displayDistance = { current: distanceRef.current };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY_COLOR);
    scene.fog = new THREE.Fog(SKY_COLOR, 55, 240);

    scene.add(buildRoadRibbon(localPoints));
    scene.add(buildScenery(localPoints));

    const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 260);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
    sun.position.set(60, 90, 40);
    scene.add(sun);

    const gradientMap = createToonGradientTexture();
    const rider: ToonRiderModel = buildToonRiderModel(gradientMap);
    const headingGroup = new THREE.Group();
    headingGroup.add(rider.group);
    scene.add(headingGroup);

    const cameraPos = new THREE.Vector3();
    const cameraLookAt = new THREE.Vector3();
    let camInit = false;
    // Real GPS/elevation data occasionally has near-duplicate consecutive
    // points (same lat/lng, different elevation) — the horizontal tangent
    // degenerates to ~zero there. Hold the last good heading through those
    // rather than snapping the camera to a straight-up/down look.
    const lastForwardFlat = new THREE.Vector3(0, 0, -1);

    let raf = 0;
    let lastTime = performance.now();

    // The container can report 0×0 for a frame or two right after mount,
    // before the browser has finished layout (especially inside a Suspense
    // boundary swapping in from another view) — sizing the renderer/camera
    // off that would leave the aspect ratio wrong. Skip frames until the
    // container actually has a size.
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

      // Chase camera: behind + above the rider, looking at a point ahead of them.
      // Real elevation samples can be noisy or spaced very close together, which
      // makes the raw 3D `forward` tangent swing toward near-vertical on steep
      // or noisy sections — so aiming uses the horizontal direction only; real
      // climbs/descents still show up naturally via each point's own height.
      // When the horizontal component itself is ~zero (near-duplicate
      // consecutive GPS points), keep the last good heading instead of
      // collapsing to a zero vector, which pointed the camera straight up.
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
      rider.crank.rotation.x -= spin * 1.4;

      // Pulled back further than a literal "just behind the seat" distance —
      // at close range the rider fills most of the frame and hides the road,
      // which read as broken/amateurish rather than a proper chase cam.
      const behind = forwardFlat.clone().multiplyScalar(-1);
      const desiredPos = new THREE.Vector3(x, y, z)
        .addScaledVector(behind, 7.5)
        .add(new THREE.Vector3(0, 3.2, 0));
      const desiredLookAt = new THREE.Vector3(x, y, z)
        .addScaledVector(forwardFlat, 11)
        .add(new THREE.Vector3(0, 1.4, 0));

      if (!camInit) {
        cameraPos.copy(desiredPos);
        cameraLookAt.copy(desiredLookAt);
        camInit = true;
      } else {
        cameraPos.lerp(desiredPos, Math.min(1, dt * 3.2));
        cameraLookAt.lerp(desiredLookAt, Math.min(1, dt * 3.2));
      }
      camera.position.copy(cameraPos);
      camera.lookAt(cameraLookAt);

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
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
