// Renderer, camera, lights and post-processing.
//
// Scene renders into a 4x MSAA half-float target, then bloom, then one final
// pass that does tone mapping, grading and the big screen-space moments
// (time stop, flashes, chromatic punch, vignette).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SHARED } from './toon.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uExposure: { value: 1.0 },
    uSaturation: { value: 1.2 },
    uContrast: { value: 0.18 },
    uVignette: { value: 0.32 },
    uLift: { value: new THREE.Vector3(0.012, 0.004, 0.03) },
    uGain: { value: new THREE.Vector3(1.03, 1.0, 0.97) },
    uTimeStop: { value: 0 },        // 0..1 amount of the frozen-time look
    uTimeStopCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uTimeStopRing: { value: 0 },    // expanding ripple radius (0..~1.5)
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uChroma: { value: 0 },
    uAspect: { value: 16 / 9 },
    uRewind: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintAmount: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uExposure, uSaturation, uContrast, uVignette, uTimeStop, uTimeStopRing, uFlash, uChroma, uAspect, uRewind, uTintAmount;
    uniform vec3 uLift, uGain, uFlashColor, uTint;
    uniform vec2 uTimeStopCenter;
    varying vec2 vUv;

    vec3 tonemap(vec3 c) {
      c *= uExposure;
      // extended Reinhard per channel (white = 2.6): keeps colors punchy
      const float W2 = 6.76;
      return c * (1.0 + c / W2) / (1.0 + c);
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 toSRGB(vec3 c) {
      c = max(c, 0.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }

    void main() {
      vec2 uv = vUv;
      vec2 d = uv - uTimeStopCenter; d.x *= uAspect;
      float r = length(d);
      // time-stop ripple bends the image along the expanding ring
      float ringBand = exp(-pow((r - uTimeStopRing) * 18.0, 2.0)) * step(0.001, uTimeStopRing);
      uv -= normalize(d + 1e-5) * ringBand * 0.012 * vec2(1.0 / uAspect, 1.0);
      // rewind: horizontal tape wobble
      uv.x += uRewind * (sin(uv.y * 90.0 + uTime * 40.0) * 0.0025 + (hash(vec2(floor(uv.y * 60.0), floor(uTime * 20.0))) - 0.5) * 0.006);

      vec3 col;
      if (uChroma > 0.001) {
        vec2 off = (uv - 0.5) * uChroma * 0.012;
        col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }
      col = tonemap(col);

      // grade: lift / gain, contrast, saturation
      col = col * uGain + uLift * (1.0 - col);
      col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);

      // frozen time: desaturated, cooled, inverted inside the ring's wake
      if (uTimeStop > 0.001) {
        float inside = smoothstep(uTimeStopRing, uTimeStopRing - 0.08, r);
        vec3 frozen = mix(col, vec3(l), 0.5) * vec3(0.9, 0.95, 1.1) + vec3(0.0, 0.01, 0.04);
        col = mix(col, frozen, uTimeStop * max(inside, step(1.4, uTimeStopRing)));
        col += vec3(0.6, 0.8, 1.0) * ringBand * 0.35;
      }
      col = mix(col, col * uTint * 1.3, uTintAmount);
      if (uRewind > 0.001) {
        float scan = step(0.5, fract(uv.y * 240.0)) * 0.06;
        col = mix(col, vec3(l) * vec3(1.05, 0.95, 0.8) - scan, uRewind * 0.55);
      }

      // vignette
      vec2 v = vUv - 0.5; v.x *= uAspect * 0.8;
      col *= 1.0 - uVignette * smoothstep(0.35, 0.95, length(v));
      col = mix(col, uFlashColor, uFlash);

      col = toSRGB(col);
      // a touch of film grain hides banding in the gradients
      col += (hash(vUv * 1000.0 + fract(uTime)) - 0.5) / 255.0;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Stage {
  constructor(canvas, opts = {}) {
    this.opts = opts;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: !!opts.capture,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio ?? 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#7fb7d9');
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(opts.fov ?? 36, 1, 0.1, 200);
    this.camera = camera;

    // Lighting: warm sun from the upper left, cool sky fill.
    const hemi = new THREE.HemisphereLight('#cfe6ff', '#8a7a5a', 1.35);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff0d8', 2.6);
    sun.position.set(-6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(opts.shadowSize ?? 2048, opts.shadowSize ?? 2048);
    const sc = sun.shadow.camera;
    sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 50;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    this.hemi = hemi;

    // Post chain
    const size = new THREE.Vector2(1, 1);
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: opts.msaa ?? 4 });
    const composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    composer.addPass(this.renderPass);
    this.renderer.info.autoReset = false; // count every pass of a frame
    this.bloom = new UnrealBloomPass(size, opts.bloomStrength ?? 0.42, 0.35, 1.2);
    composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    composer.addPass(this.final);
    this.composer = composer;
    this.fx = this.final.uniforms;
    this.time = 0;
    this.resize();
  }

  // 0 full, 1 lighter resolution, 2 smaller shadows and MSAA, 3 no bloom, no MSAA
  setQuality(level) {
    this.quality = level;
    const base = Math.min(window.devicePixelRatio || 1, this.opts.maxPixelRatio ?? 2);
    this.renderer.setPixelRatio([base, Math.min(base, 1.3), Math.min(base, 1), Math.min(base, 0.8)][level]);
    const sm = level >= 2 ? 1024 : (this.opts.shadowSize ?? 2048);
    if (this.sun.shadow.mapSize.x !== sm) { this.sun.shadow.mapSize.set(sm, sm); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    const samples = [4, 4, 2, 0][level];
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) if (rt.samples !== samples) { rt.samples = samples; rt.dispose(); }
    this.bloom.enabled = level < 3;
    this.resize();
  }

  resize(w, h) {
    const canvas = this.renderer.domElement;
    w = w ?? canvas.clientWidth ?? canvas.width;
    h = h ?? canvas.clientHeight ?? canvas.height;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.uAspect.value = w / h;
  }

  // Render a different scene/camera (menus) through the same post chain.
  setView(scene, camera) { this.renderPass.scene = scene; this.renderPass.camera = camera; }

  // Keep the shadow frustum centered on what the camera looks at.
  followShadow(target) {
    const s = this.sun;
    s.target.position.copy(target);
    s.position.copy(target).add(new THREE.Vector3(-6, 14, 8));
  }

  render(dt = 1 / 60) {
    this.time += dt;
    SHARED.uTime.value = this.time;
    this.fx.uTime.value = this.time;
    this.renderer.info.reset();
    this.composer.render(dt);
  }
}
