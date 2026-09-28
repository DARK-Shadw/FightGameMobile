// Stylized materials.
//
// Toon: three's Lambert pipeline (so shadows, fog and skinning keep working)
// with our own lighting model injected:
//   - a soft cel terminator instead of the Lambert falloff,
//   - a crisp, vinyl-toy specular spot whose size follows per-vertex gloss,
//   - a rim light that is stronger on the lit side,
//   - per-vertex emissive, hit flash and a dissolve with a glowing edge.
// Outline: inverted hull pushed out along skinned normals, colored from the
// vertex albedo so outlines read as a darker shade of the surface, not black.

import * as THREE from 'three';

export const SHARED = {
  uTime: { value: 0 },
  uRimColor: { value: new THREE.Color('#fff4e0') },
  uShadeTint: { value: new THREE.Color('#6b5fb0') },
  // world-wide frozen time: xz center, wavefront radius, amount
  uStop: { value: new THREE.Vector4(0, 0, 0, 0) },
};

const NOISE_GLSL = /* glsl */`
float tHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float tNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(tHash(i + vec3(0,0,0)), tHash(i + vec3(1,0,0)), f.x), mix(tHash(i + vec3(0,1,0)), tHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(tHash(i + vec3(0,0,1)), tHash(i + vec3(1,0,1)), f.x), mix(tHash(i + vec3(0,1,1)), tHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;

const LIGHT_PARS = /* glsl */`
varying vec3 vViewPosition;
varying vec2 vSurf;
struct LambertMaterial { vec3 diffuseColor; float specularStrength; };
float toonSun = 0.0;
uniform float uTermLo;
uniform float uTermHi;
uniform float uSpecAmount;
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float dotNL = dot( geometryNormal, directLight.direction );
  float ramp = smoothstep( uTermLo, uTermHi, dotNL );
  toonSun += ramp * clamp( dot( directLight.color, vec3( 0.3333 ) ), 0.0, 4.0 );
  reflectedLight.directDiffuse += ramp * directLight.color * BRDF_Lambert( material.diffuseColor );
  vec3 H = normalize( directLight.direction + geometryViewDir );
  float nh = max( dot( geometryNormal, H ), 0.0 );
  float gloss = vSurf.x;
  float gl = clamp( gloss, 0.0, 1.0 );
  float s = pow( nh, mix( 10.0, 160.0, gl ) );
  s = smoothstep( 0.45, 0.6, s ) * gl * sqrt( gl ) * uSpecAmount;
  reflectedLight.directSpecular += s * ramp * directLight.color * 0.55;
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct RE_Direct_Lambert
#define RE_IndirectDiffuse RE_IndirectDiffuse_Lambert
`;

const FRAG_PARS = /* glsl */`
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uDissolve;
uniform vec3 uDissolveColor;
uniform float uEmissive;
uniform vec3 uTint;
uniform float uTintAmount;
uniform float uGhost;
uniform float uGrey;
uniform float uKeep;
uniform vec4 uStop;
uniform float uTime;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
${NOISE_GLSL}
`;

const FRAG_OUT = /* glsl */`
  vec3 albedo = diffuseColor.rgb;
  vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular;
  // rim: brighter on top-facing and sunlit edges
  vec3 vdir = normalize( vViewPosition );
  float fres = 1.0 - clamp( dot( normal, vdir ), 0.0, 1.0 );
  float rim = smoothstep( 0.52, 0.9, fres ) * ( 0.35 + 0.65 * clamp( toonSun, 0.0, 1.0 ) );
  rim *= 0.55 + 0.45 * smoothstep( -0.4, 0.8, vWorldNormal.y );
  outgoingLight += uRimColor * rim * uRimStrength * ( 0.35 + 0.65 * albedo );
  outgoingLight += albedo * vSurf.y * uEmissive;
  outgoingLight = mix( outgoingLight, outgoingLight * uTint * 1.4 + uTint * 0.12, uTintAmount );
  float greyAmt = uGrey;
  if ( uStop.w > 0.001 && uKeep < 0.5 ) {
    // frozen-time wave spreading from the caster; a bright wavefront leads it
    float sd = distance( vWorldPos.xz, uStop.xy );
    greyAmt = max( greyAmt, uStop.w * smoothstep( uStop.z, uStop.z - 2.0, sd ) );
    float wf = ( sd - uStop.z ) * 2.4;
    outgoingLight += vec3( 0.55, 0.75, 1.0 ) * exp( -wf * wf ) * uStop.w * 0.55;
  }
  if ( greyAmt > 0.001 ) {
    float lum = dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) );
    outgoingLight = mix( outgoingLight, vec3( lum ) * vec3( 0.88, 0.96, 1.14 ), greyAmt );
  }
  if ( uDissolve > 0.001 ) {
    float n = tNoise( vWorldPos * 9.0 ) * 0.65 + tNoise( vWorldPos * 23.0 ) * 0.35;
    float edge = n - uDissolve;
    if ( edge < 0.0 ) discard;
    outgoingLight += uDissolveColor * smoothstep( 0.08, 0.0, edge ) * 4.0;
  }
  outgoingLight = mix( outgoingLight, uFlashColor, uFlash );
  if ( uGhost > 0.001 ) {
    diffuseColor.a *= 1.0 - uGhost * 0.75;
    outgoingLight = mix( outgoingLight, uRimColor * fres * 2.0 + outgoingLight * 0.3, uGhost * 0.6 );
  }
`;

let serial = 0;

// opts: { rim, emissive, termLo, termHi, spec, transparent }
export function toonMaterial(opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: opts.vertexColors ?? true, color: opts.color ?? 0xffffff, transparent: !!opts.transparent });
  const u = {
    uRimColor: SHARED.uRimColor,
    uTime: SHARED.uTime,
    uRimStrength: { value: opts.rim ?? 0.55 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uDissolve: { value: 0 },
    uDissolveColor: { value: new THREE.Color('#ffb347') },
    uEmissive: { value: opts.emissive ?? 2.2 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintAmount: { value: 0 },
    uGhost: { value: 0 },
    uGrey: { value: 0 },
    uKeep: { value: 0 },
    uStop: SHARED.uStop,
    uTermLo: { value: opts.termLo ?? -0.05 },
    uTermHi: { value: opts.termHi ?? 0.16 },
    uSpecAmount: { value: opts.spec ?? 1 },
  };
  mat.userData.u = u;
  const hk = opts.hooks || {};
  if (hk.uniforms) Object.assign(u, hk.uniforms);
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${hk.vertexPars || ''}
attribute vec2 surf;
uniform float uTime;
varying vec2 vSurf;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
${hk.vertexTransform || ''}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
${hk.vertexMain || ''}
vSurf = surf;
#ifdef USE_INSTANCING
  vec4 tWorld = modelMatrix * instanceMatrix * vec4( transformed, 1.0 );
  vWorldNormal = normalize( mat3( modelMatrix * instanceMatrix ) * objectNormal );
#else
  vec4 tWorld = modelMatrix * vec4( transformed, 1.0 );
  vWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );
#endif
vWorldPos = tWorld.xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_lambert_pars_fragment>', LIGHT_PARS)
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS + (hk.fragPars || ''))
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (hk.fragColor || ''))
      .replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;', FRAG_OUT);
  };
  mat.customProgramCacheKey = () => 'toon-v1-' + (hk.key || '');
  mat.userData.id = serial++;
  return mat;
}

// Inverted hull outline. `width` is a fraction of the view distance, so the
// line stays the same on screen whatever the zoom.
export function outlineMaterial(opts = {}) {
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(opts.color ?? '#3a2a4a'),
    side: THREE.BackSide,
    vertexColors: opts.vertexColors ?? true,
    transparent: !!opts.transparent,
  });
  const u = { uWidth: { value: opts.width ?? 0.0022 }, uOutlineAlpha: { value: 1 }, uDissolve: { value: 0 } };
  mat.userData.u = u;
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWidth;\nvarying vec3 vOWorld;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
#ifdef USE_SKINNING
  vec3 oN = normalize( objectNormal );
#else
  vec3 oN = normalize( normal );
#endif
#ifdef USE_INSTANCING
  vec4 oView = modelViewMatrix * instanceMatrix * vec4( transformed, 1.0 );
#else
  vec4 oView = modelViewMatrix * vec4( transformed, 1.0 );
#endif
  transformed += oN * uWidth * max( -oView.z, 1.0 );
#ifdef USE_INSTANCING
  vOWorld = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
#else
  vOWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
#endif`);
    // albedo * color gives a darker, tinted version of the surface color
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uOutlineAlpha;\nuniform float uDissolve;\nvarying vec3 vOWorld;\n' + NOISE_GLSL)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
gl_FragColor.a *= uOutlineAlpha;
if ( uDissolve > 0.001 && tNoise( vOWorld * 9.0 ) * 0.65 + tNoise( vOWorld * 23.0 ) * 0.35 < uDissolve + 0.02 ) discard;`);
  };
  mat.customProgramCacheKey = () => 'outline-v2';
  return mat;
}

// Soft contact shadow blob (Brawl Stars style) under characters.
let blobTex = null;
export function blobShadow(radius = 0.5, opacity = 0.35) {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(20,10,40,1)');
    grd.addColorStop(0.55, 'rgba(20,10,40,0.75)');
    grd.addColorStop(1, 'rgba(20,10,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(c);
    blobTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}
