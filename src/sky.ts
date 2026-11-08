import * as THREE from 'three';

/** Gradient sky dome with a sun disc and stars. Follows the camera. */
export class Sky {
  readonly group = new THREE.Group();
  readonly top = new THREE.Color();
  readonly horizon = new THREE.Color();
  readonly sunColor = new THREE.Color();
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  readonly dome: THREE.Mesh;
  readonly stars: THREE.Points;
  private readonly starMaterial: THREE.PointsMaterial;

  constructor() {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: this.top },
        horizon: { value: this.horizon },
        sunColor: { value: this.sunColor },
        sunDir: { value: this.sunDir },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 sunColor;
        uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          vec3 dir = normalize(vDir);
          // two hard bands plus a soft blend: painted, not photographic
          float h = smoothstep(0.0, 0.5, dir.y);
          vec3 col = mix(horizon, top, h);
          float s = dot(dir, normalize(sunDir));
          col = mix(col, sunColor, smoothstep(0.9990, 0.9993, s));
          col = mix(col, sunColor, 0.18 * smoothstep(0.96, 1.0, s));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), material);
    this.dome.renderOrder = -2;
    this.dome.frustumCulled = false;

    // stars on the upper half, fixed pattern
    const positions: number[] = [];
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 400; i++) {
      const y = 0.08 + rand() * 0.92;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      positions.push(Math.cos(a) * r * 440, y * 440, Math.sin(a) * r * 440);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.starMaterial = new THREE.PointsMaterial({
      color: '#ffffff',
      size: 2,
      sizeAttenuation: false,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(geo, this.starMaterial);
    this.stars.renderOrder = -1;
    this.stars.frustumCulled = false;

    this.group.add(this.dome, this.stars);
  }

  set starOpacity(v: number) {
    this.starMaterial.opacity = v;
    this.stars.visible = v > 0.01;
  }

  follow(camera: THREE.Camera) {
    this.group.position.copy(camera.position);
  }
}
