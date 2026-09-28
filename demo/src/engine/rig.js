// Turning sculpted meshes into rigged, drawable objects.

import * as THREE from 'three';
import { meshSDF } from './mesher.js';
import { toonMaterial, outlineMaterial } from './toon.js';

export function geometryFrom(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.color, 3));
  g.setAttribute('surf', new THREE.BufferAttribute(m.surf, 2));
  if (m.skinIndex) {
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinWeight, 4));
  }
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// spec: ordered { name: { parent, pos:[x,y,z] } } with parents first.
export function buildSkeleton(spec) {
  const bones = {};
  const list = [];
  let root = null;
  for (const [name, b] of Object.entries(spec)) {
    const bone = new THREE.Bone();
    bone.name = name;
    const pp = b.parent ? spec[b.parent].pos : [0, 0, 0];
    bone.position.set(b.pos[0] - pp[0], b.pos[1] - pp[1], b.pos[2] - pp[2]);
    bone.userData.rest = bone.position.clone();
    bone.userData.restQ = bone.quaternion.clone();
    if (b.cloth !== undefined) bone.userData.clothScale = b.cloth; // -1 for parts that hang down
    if (b.parent) bones[b.parent].add(bone);
    else root = bone;
    bones[name] = bone;
    list.push(bone);
  }
  return { bones, list, root, skeleton: new THREE.Skeleton(list), names: list.map(b => b.name) };
}

// Builds a skinned, outlined character body from an SDF.
export function skinnedModel(sdfRoot, rig, opts = {}) {
  const m = meshSDF(sdfRoot, { ...opts.mesh, bones: rig.names });
  return { ...skinnedFromGeometry(geometryFrom(m), rig, opts), stats: m.stats };
}

// Same, from an already meshed geometry (instances share geometry).
export function skinnedFromGeometry(geo, rig, opts = {}) {
  const group = new THREE.Group();
  group.add(rig.root);
  const material = toonMaterial(opts.material);
  const body = new THREE.SkinnedMesh(geo, material);
  body.castShadow = true;
  body.receiveShadow = true;
  body.frustumCulled = false;
  group.add(body);
  group.updateMatrixWorld(true);
  body.bind(rig.skeleton);
  let outline = null;
  if (opts.outline !== false) {
    outline = new THREE.SkinnedMesh(geo, outlineMaterial(opts.outlineOpts));
    outline.frustumCulled = false;
    group.add(outline);
    outline.bind(rig.skeleton, body.bindMatrix);
  }
  return { group, body, outline, material, geometry: geo };
}

// Rigid (non-skinned) sculpted prop with outline.
export function staticModel(sdfRoot, opts = {}) {
  const m = meshSDF(sdfRoot, opts.mesh || {});
  const geo = geometryFrom(m);
  const group = new THREE.Group();
  const material = opts.sharedMaterial || toonMaterial(opts.material);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = opts.castShadow ?? true;
  mesh.receiveShadow = opts.receiveShadow ?? true;
  group.add(mesh);
  let outline = null;
  if (opts.outline !== false) {
    outline = new THREE.Mesh(geo, opts.sharedOutline || outlineMaterial(opts.outlineOpts));
    group.add(outline);
  }
  return { group, mesh, outline, material, geometry: geo, stats: m.stats };
}

// ── Eyes ────────────────────────────────────────────────────────────────
// One shader draws sclera, iris, pupil, two highlights and the eyelid, so
// eyes can look around and blink without textures.
const EYE_VERT = /* glsl */`
varying vec3 vLocal;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  vLocal = normalize(position);
  vNormalV = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const EYE_FRAG = /* glsl */`
uniform vec3 uIris, uIris2, uLid, uSclera, uLash;
uniform vec2 uLook;
uniform float uBlink, uIrisSize, uPupilSize, uAngry, uGlow, uLidRest;
varying vec3 vLocal;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  vec3 p = vLocal;
  vec3 look = normalize(vec3(uLook.x, uLook.y, 1.0));
  float a = acos(clamp(dot(p, look), -1.0, 1.0));
  // sclera, shaded by the lid from above
  vec3 col = uSclera * mix(0.78, 1.0, smoothstep(0.75, 0.1, p.y));
  // iris with a darker ring and lighter bottom
  float iris = smoothstep(uIrisSize + 0.025, uIrisSize - 0.025, a);
  vec3 irisCol = mix(uIris2, uIris, smoothstep(uIrisSize * 0.95, uIrisSize * 0.2, a));
  irisCol = mix(irisCol, irisCol * 1.5 + 0.06, smoothstep(0.0, -0.5, p.y - look.y) * 0.6);
  col = mix(col, irisCol, iris);
  float pupil = smoothstep(uPupilSize + 0.025, uPupilSize - 0.025, a);
  col = mix(col, vec3(0.02, 0.015, 0.035), pupil);
  col += uIris * uGlow * iris * 1.6;
  // highlights (fixed up-left, like a studio softbox)
  vec3 h1 = normalize(vec3(-0.3, 0.38, 0.87));
  vec3 h2 = normalize(vec3(0.24, -0.26, 0.93));
  float s1 = smoothstep(0.24, 0.2, acos(clamp(dot(p, h1), -1.0, 1.0)));
  float s2 = smoothstep(0.1, 0.08, acos(clamp(dot(p, h2), -1.0, 1.0)));
  col = mix(col, vec3(1.0), max(s1, s2 * 0.9));
  // eyelid from the top (rest position + blink), angry tilts it inward
  float lidLine = mix(1.0 - uLidRest, -1.05, uBlink) - uAngry * p.x * 0.7;
  float lid = smoothstep(lidLine - 0.015, lidLine + 0.015, p.y);
  float lash = smoothstep(0.075, 0.02, abs(p.y - lidLine)) * (1.0 - step(0.97, uBlink));
  col = mix(col, uLid, lid);
  col = mix(col, uLash, lash);
  // cartoon outline around the eye
  float rimL = smoothstep(0.42, 0.26, p.z);
  col = mix(col, uLash, rimL);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const lin = c => new THREE.Color(c);
let eyeGeo = null;
export function makeEye(opts = {}) {
  eyeGeo ||= new THREE.SphereGeometry(1, 28, 20);
  const mat = new THREE.ShaderMaterial({
    vertexShader: EYE_VERT,
    fragmentShader: EYE_FRAG,
    uniforms: {
      uIris: { value: lin(opts.iris ?? '#3fa8ff') },
      uIris2: { value: lin(opts.iris2 ?? '#10307a') },
      uLid: { value: lin(opts.lid ?? '#f2b999') },
      uSclera: { value: lin(opts.sclera ?? '#ffffff') },
      uLash: { value: lin(opts.lash ?? '#2a1a2a') },
      uLook: { value: new THREE.Vector2(0, 0) },
      uBlink: { value: 0 },
      uAngry: { value: opts.angry ?? 0 },
      uIrisSize: { value: opts.irisSize ?? 0.58 },
      uLidRest: { value: opts.lidRest ?? 0.12 },
      uPupilSize: { value: opts.pupilSize ?? 0.3 },
      uGlow: { value: opts.glow ?? 0 },
    },
  });
  const mesh = new THREE.Mesh(eyeGeo, mat);
  mesh.scale.set(...(opts.scale ?? [0.06, 0.075, 0.035]));
  mesh.position.set(...(opts.pos ?? [0, 0, 0]));
  if (opts.rot) mesh.rotation.set(...opts.rot);
  mesh.castShadow = false;
  mesh.userData.u = mat.uniforms;
  return mesh;
}
