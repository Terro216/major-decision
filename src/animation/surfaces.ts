import * as THREE from 'three';

// Surface colour only: the plate, rings and contact plane stay in mechanism.ts.
// The film leaves a violet centre inside the coloured outer disc in BOTH endings.
export function starSurface(violetCentre = true) {
  const material = new THREE.MeshPhongMaterial({ color: '#b660d0', emissive: '#b660d0', emissiveIntensity: .025, specular: '#211927', shininess: 55 });
  const center = new THREE.Color('#7475ce');
  material.onBeforeCompile = shader => {
    shader.uniforms.starCenter = { value: center };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 starXY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nstarXY = position.xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 starXY; uniform vec3 starCenter;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float centreMask = ${violetCentre ? '1.' : '0.'} * (1. - smoothstep(.53, .55, length(starXY)));
        diffuseColor.rgb = mix(diffuseColor.rgb, starCenter, centreMask);
        vec2 cell = floor(starXY * 520.);
        float grain = fract(sin(dot(cell,vec2(12.9898,78.233))) * 43758.5453);
        diffuseColor.rgb *= .94 + .12 * grain;
      `)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance = mix(totalEmissiveRadiance,starCenter*.10,${violetCentre ? '1.' : '0.'}*(1.-smoothstep(.53,.55,length(starXY))));`);
  };
  material.customProgramCacheKey = () => `major-decision-violet-centre-v4-${violetCentre}`;
  return material;
}

// Subtle object-space grain, never random per frame or tied to screen pixels.
// It preserves backward-seek determinism and does not bake film imagery in.
export function answerSurface(color: string, edge = false) {
  const material = new THREE.MeshPhongMaterial({
    color, specular: edge ? '#808080' : '#242424', shininess: edge ? 52 : 36,
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
  const material = new THREE.MeshPhongMaterial({ color: '#c26bd3', emissive: '#07010e', specular: '#a77fb7', shininess: 85, transparent: true, opacity: .70, side: THREE.FrontSide, depthWrite: false });
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
      float band = smoothstep(.025,.060,abs(pinY));
      float cap = smoothstep(1.10,1.22,abs(pinY));
      float edge = pow(1. - abs(dot(normalize(vNormal), normalize(vViewPosition))), .65);
      diffuseColor.rgb *= mix(.40,1.,edge) * band + .22*(1.-band) + .45*cap;
    `).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float rim = pow(1. - abs(dot(normal, normalize(vViewPosition))), 3.);
      totalEmissiveRadiance += diffuseColor.rgb * rim * .8;
    `);
  };
  material.customProgramCacheKey = () => 'major-decision-pin-bands-v1';
  return material;
}
