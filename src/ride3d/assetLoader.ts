import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Self-hosted CC0 low-poly props (Kenney "Nature Kit" / "City Kit Suburban",
 * see public/assets/ride3d/LICENSE.txt) — replaces the hand-built primitive
 * shapes with real, if simple, modeled trees/rocks/bushes/houses.
 */

const loader = new GLTFLoader();
const cache = new Map<string, Promise<LoadedProp>>();

export type LoadedProp = {
  geometry: THREE.BufferGeometry;
  /** The loaded model's own material — some (e.g. the suburban houses) have a working baked texture; nature-kit trees/rocks don't and are meant to be recolored by the caller. */
  material: THREE.Material;
};

function resolveAssetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return new URL(`${base}assets/ride3d/${relativePath}`, window.location.origin).href;
}

/**
 * Loads a Kenney GLB and merges every mesh in it into one geometry (each
 * part's own transform baked in first) — some of these models are two nodes
 * (e.g. trunk + foliage), and using only the first one silently dropped the
 * rest. Cached by path so repeated placements/route changes don't refetch.
 */
export function loadKenneyProp(relativePath: string): Promise<LoadedProp> {
  let cached = cache.get(relativePath);
  if (!cached) {
    const url = resolveAssetUrl(relativePath);
    cached = loader.loadAsync(url).then((gltf) => {
      const meshes: THREE.Mesh[] = [];
      gltf.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });
      if (meshes.length === 0) throw new Error(`No mesh found in ${relativePath}`);

      gltf.scene.updateWorldMatrix(true, true);
      const geometries = meshes.map((mesh) => {
        const g = mesh.geometry.clone();
        g.applyMatrix4(mesh.matrixWorld);
        return g;
      });
      const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
      if (!merged) throw new Error(`Failed to merge geometry for ${relativePath}`);
      merged.computeVertexNormals();

      return { geometry: merged, material: meshes[0].material as THREE.Material };
    });
    cache.set(relativePath, cached);
  }
  return cached;
}

/** Loads several props in parallel; resolves per-slot to null (not rejects) on individual failure so one bad/offline asset doesn't sink the whole batch. */
export async function loadKenneyProps(relativePaths: string[]): Promise<(LoadedProp | null)[]> {
  return Promise.all(
    relativePaths.map((p) =>
      loadKenneyProp(p).catch((err) => {
        console.warn(`[ride3d] failed to load asset ${p}:`, err);
        return null;
      }),
    ),
  );
}
