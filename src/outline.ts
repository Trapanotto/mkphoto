import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export type OutlineMode = 'post-normals' | 'post-depth' | 'hull';

/** Shared outline colour, changed by the time of day. */
export const outlineColor = new THREE.Color('#1a2a3a');
const outlineUniform = { value: outlineColor };

// --- Inverted hull (cheap fallback for weak devices) ---------------------------

const hulls: THREE.Mesh[] = [];
const hullMaterials = new Map<number, THREE.MeshBasicMaterial>();

function hullMaterial(thickness: number) {
  let m = hullMaterials.get(thickness);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uThickness = { value: thickness };
    shader.uniforms.uOutline = outlineUniform;
    shader.vertexShader =
      'uniform float uThickness;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * uThickness;');
    shader.fragmentShader =
      'uniform vec3 uOutline;\n' +
      shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( uOutline, opacity );');
  };
  m.customProgramCacheKey = () => `hull-${thickness}`;
  hullMaterials.set(thickness, m);
  return m;
}

/** Adds a back-face shell around a mesh; only shown on the low quality level. */
export function addHull(mesh: THREE.Mesh, thickness: number) {
  let hull: THREE.Mesh;
  if (mesh instanceof THREE.InstancedMesh) {
    const inst = new THREE.InstancedMesh(mesh.geometry, hullMaterial(thickness), mesh.count);
    inst.instanceMatrix = mesh.instanceMatrix;
    hull = inst;
  } else {
    hull = new THREE.Mesh(mesh.geometry, hullMaterial(thickness));
  }
  hull.visible = false;
  hull.frustumCulled = mesh.frustumCulled;
  mesh.add(hull);
  hulls.push(hull);
}

// --- Post-process outlines ---------------------------------------------------------

const edgeShader = {
  uniforms: {
    tColor: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    texel: { value: new THREE.Vector2() },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 600 },
    useNormals: { value: 1 },
    outlineColor: outlineUniform,
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform vec2 texel;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float useNormals;
    uniform vec3 outlineColor;
    varying vec2 vUv;

    // 1 / view distance: linear in screen space on flat surfaces,
    // so its second derivative is zero there and only real edges show up
    float invDepth(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return 1.0 / max(-perspectiveDepthToViewZ(d, cameraNear, cameraFar), 1e-3);
    }

    vec3 normalAt(vec2 uv) {
      return texture2D(tNormal, uv).xyz * 2.0 - 1.0;
    }

    void main() {
      vec4 color = texture2D(tColor, vUv);
      vec2 dx = vec2(texel.x, 0.0);
      vec2 dy = vec2(0.0, texel.y);

      float c = invDepth(vUv);
      float l = invDepth(vUv - dx);
      float r = invDepth(vUv + dx);
      float u = invDepth(vUv + dy);
      float b = invDepth(vUv - dy);
      // positive only on the near side of a silhouette: the line sits on the object
      float bump = max(0.0, 2.0 * c - l - r) + max(0.0, 2.0 * c - u - b);
      float edge = smoothstep(0.15, 0.4, bump / c);

      if (useNormals > 0.5) {
        vec3 n = normalAt(vUv);
        float crease = max(
          max(1.0 - dot(n, normalAt(vUv - dx)), 1.0 - dot(n, normalAt(vUv + dx))),
          max(1.0 - dot(n, normalAt(vUv + dy)), 1.0 - dot(n, normalAt(vUv - dy)))
        );
        edge = max(edge, smoothstep(0.3, 0.5, crease));
      }

      // lines thin out with distance, like a poster's background
      float dist = 1.0 / c;
      edge *= mix(1.0, 0.3, smoothstep(40.0, 350.0, dist));

      gl_FragColor = vec4(mix(color.rgb, outlineColor, edge), 1.0);
      #include <colorspace_fragment>
    }
  `,
};

/** Renders the scene with the outline style that fits the current quality level. */
export class OutlineRenderer {
  mode: OutlineMode = 'post-normals';
  /** Objects that must not show up in the normal pass (sky, stars). */
  readonly hideInNormalPass: THREE.Object3D[] = [];

  private readonly colorTarget: THREE.WebGLRenderTarget;
  private readonly normalTarget: THREE.WebGLRenderTarget;
  private readonly normalMaterial = new THREE.MeshNormalMaterial();
  private readonly material = new THREE.ShaderMaterial(edgeShader);
  private readonly quad = new FullScreenQuad(this.material);
  private readonly clearColor = new THREE.Color();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const halfFloat =
      renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
    const type = halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.colorTarget = new THREE.WebGLRenderTarget(1, 1, { type, depthTexture: new THREE.DepthTexture(1, 1) });
    this.normalTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType });
    this.material.uniforms.tColor.value = this.colorTarget.texture;
    this.material.uniforms.tDepth.value = this.colorTarget.depthTexture;
    this.material.uniforms.tNormal.value = this.normalTarget.texture;
  }

  setMode(mode: OutlineMode) {
    this.mode = mode;
    for (const h of hulls) h.visible = mode === 'hull';
    this.material.uniforms.useNormals.value = mode === 'post-normals' ? 1 : 0;
  }

  setSize(width: number, height: number) {
    this.colorTarget.setSize(width, height);
    this.normalTarget.setSize(width, height);
    this.material.uniforms.texel.value.set(1 / width, 1 / height);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const r = this.renderer;
    if (this.mode === 'hull') {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }

    r.setRenderTarget(this.colorTarget);
    r.render(scene, camera);

    if (this.mode === 'post-normals') {
      const fog = scene.fog;
      r.getClearColor(this.clearColor);
      const alpha = r.getClearAlpha();
      for (const o of this.hideInNormalPass) o.visible = false;
      scene.fog = null;
      scene.overrideMaterial = this.normalMaterial;
      r.setClearColor(0x8080ff, 1);
      r.setRenderTarget(this.normalTarget);
      r.render(scene, camera);
      scene.overrideMaterial = null;
      scene.fog = fog;
      r.setClearColor(this.clearColor, alpha);
      for (const o of this.hideInNormalPass) o.visible = true;
    }

    this.material.uniforms.cameraNear.value = camera.near;
    this.material.uniforms.cameraFar.value = camera.far;
    r.setRenderTarget(null);
    this.quad.render(r);
  }
}
