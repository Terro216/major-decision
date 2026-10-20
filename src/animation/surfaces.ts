import * as THREE from 'three';

// Surface colour only: the plate, rings and contact plane stay in mechanism.ts.
// The film leaves a violet centre inside the coloured outer disc in BOTH endings.
export function starSurface() {
  const material = new THREE.MeshPhongMaterial({ color: '#b660d0', emissive: '#b660d0', emissiveIntensity: .18, specular: '#4d3d57', shininess: 70 });
  const center = new THREE.Color('#b660d0');
  material.onBeforeCompile = shader => {
    shader.uniforms.starCenter = { value: center };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 starXY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nstarXY = position.xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 starXY; uniform vec3 starCenter;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float centreMask = 1. - smoothstep(.53, .55, length(starXY));
        diffuseColor.rgb = mix(diffuseColor.rgb, starCenter, centreMask);
      `)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = mix(totalEmissiveRadiance,starCenter*.18,1.-smoothstep(.53,.55,length(starXY)));');
  };
  material.customProgramCacheKey = () => 'major-decision-violet-centre-v2';
  return material;
}

// Subtle object-space grain, never random per frame or tied to screen pixels.
// It preserves backward-seek determinism and does not bake film imagery in.
export function answerSurface(color: string, edge = false) {
  const material = new THREE.MeshPhongMaterial({
    color, specular: edge ? '#b5c3a2' : '#596545', shininess: edge ? 52 : 36,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 surfacePoint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nsurfacePoint = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 surfacePoint;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 cell = floor(surfacePoint * 145.);
        float grain = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        diffuseColor.rgb *= .96 + .08 * grain;
      `);
  };
  material.customProgramCacheKey = () => 'major-decision-answer-grain-v1';
  return material;
}

// View-angle attenuation applies to every layer of the hollow wall. A near
// sphere crosses one skin; distant geometry crosses both skins of each turn.
// No object IDs, camera times or visibility masks enter this material.
export function tubeSurface() {
  const material = new THREE.MeshPhongMaterial({ color: '#b861cd', emissive: '#2a0d36', specular: '#785985', shininess: 75, transparent: true, opacity: .70, side: THREE.FrontSide, depthWrite: false });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float grazing = 1. - abs(dot(normal, normalize(vViewPosition)));
      diffuseColor.a = min(1., opacity + .23 * grazing * grazing);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => 'major-decision-glass-fresnel-v1';
  return material;
}

export function pinSurface() {
  const material = new THREE.MeshPhongMaterial({ color: '#4bd4fb', emissive: '#09364f', specular: '#a9efff', shininess: 100 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float pinY;').replace('#include <begin_vertex>', '#include <begin_vertex>\npinY = position.y;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float pinY;').replace('#include <color_fragment>', `#include <color_fragment>
      float band = smoothstep(.012,.035,abs(pinY));
      float cap = smoothstep(1.10,1.22,abs(pinY));
      diffuseColor.rgb *= mix(.62,1.,smoothstep(-.36,.20,pinY)) * band + .25*(1.-band) + .18*cap;
    `);
  };
  material.customProgramCacheKey = () => 'major-decision-pin-bands-v1';
  return material;
}
