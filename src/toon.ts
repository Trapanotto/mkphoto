import * as THREE from 'three';

// Three hard light steps: shadow, mid, light
const ramp = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
ramp.minFilter = THREE.NearestFilter;
ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;

export const toon = (color: THREE.ColorRepresentation) => new THREE.MeshToonMaterial({ color, gradientMap: ramp });

/**
 * Toon material with thin darker lines every `spacing` metres along one object axis
 * (0 = x, 1 = y, 2 = z): boards, shingle rows, stone courses. Lines fade out with distance.
 */
export function striped(color: THREE.ColorRepresentation, axis: 0 | 1 | 2, spacing: number, strength = 0.28, width = 0.14) {
  const m = toon(color);
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float st = vObjPos[${axis}] / ${spacing.toFixed(3)};
        float sw = fwidth(st);
        float sd = abs(fract(st + 0.5) - 0.5);
        float sl = 1.0 - smoothstep(${(width / 2).toFixed(3)} - sw, ${(width / 2).toFixed(3)} + sw, sd);
        sl *= 1.0 - smoothstep(60.0, 160.0, length(vViewPosition));
        diffuseColor.rgb *= 1.0 - ${strength.toFixed(3)} * sl;`,
      );
  };
  m.customProgramCacheKey = () => `striped-${axis}-${spacing}-${strength}-${width}`;
  return m;
}
