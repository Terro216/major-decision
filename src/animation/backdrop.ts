import * as THREE from 'three';

// The observed distant light edge, reconstructed on the real floor. These
// are illumination parameters, not recovered camera or scenery coordinates.
// The split YES frame 17 is excluded from the complete-pose observations.
export const openingFloorEdge = {
  yes: [
    [0,-40.198652206,-.116245782], [.4,-40.198652206,-.116245782],
    [14/30,-35.651268124,.027126046], [.5,-35.728526889,.033220588],
    [16/30,-35.728526889,.033220588], [.6,-40.473646466,.063595621],
    [.95,-41,0],
  ],
  no: [
    [0,-42.003005133,.212281672], [14/30,-42.003005133,.212281672],
    [.5,-37.257781509,.073966469], [16/30,-37.257781509,.073966469],
    [17/30,-36.907027080,.040509304], [.6,-43.823508195,-.046112579],
    [.95,-41,0],
  ],
} as const;

// Shared by the distant floor and the sky so atmospheric falloff has no seam
// at the horizon. Values are linear light; OutputPass handles display encoding.
export const backdropGLSL = `
  uniform float flightDark;
  vec3 backdrop(vec2 uv, float finish, float reveal, float routeSide) {
    vec3 openingBlue = vec3(.0015,.0023,.009)
      + vec3(.0008,.0022,.022)*smoothstep(.5,1.,uv.y)
      + vec3(.003,.004,.003)*(uv.x-.5);
    vec3 opening = mix(max(openingBlue,vec3(0.)),vec3(.0015),flightDark);
    vec2 upper = (uv-vec2(.52,.94))*vec2(1.25,1.);
    vec3 target = vec3(.0007,.001,.002) + vec3(.010,.025,.15)*exp(-dot(upper,upper)*6.);
    vec2 lower = (uv-vec2(.51,-.05))*vec2(1.6,1.);
    // Clear final background patches, including the letter gaps, constrain
    // two smooth light pools. There are no letter masks or film textures.
    float leftRoute = (routeSide+1.)*.5;
    vec2 centre = uv-mix(vec2(.566287,.523828),vec2(.501533,.529191),leftRoute);
    vec2 centreFalloff = mix(vec2(29.333726,14.188509),vec2(20.248225,13.957055),leftRoute);
    vec3 base = mix(vec3(.002488,.004011,.053309),vec3(.001154,.007251,.065415),leftRoute);
    vec3 middle = mix(vec3(.043582,.051559,.150937),vec3(.022318,.057317,.212225),leftRoute);
    vec3 pool = mix(vec3(.034397,.036729,.181974),vec3(.028943,.035143,.216929),leftRoute);
    vec3 slope = mix(vec3(-.000871,.001521,.001534),vec3(.003060,.003512,-.007114),leftRoute);
    vec3 answer = max(vec3(0.),base + middle*exp(-dot(centre*centre,centreFalloff)) + pool*exp(-dot(lower,lower)*18.) + slope*(uv.x-.5));
    return mix(opening,mix(target,answer,reveal),finish);
  }
`;

export function createBackdrop() {
  const material = new THREE.ShaderMaterial({
    uniforms: { finish: { value: 0 }, reveal: { value: 0 }, routeSide: { value: 1 }, flightDark: { value: 0 } },
    depthWrite: false, depthTest: false,
    vertexShader: 'varying vec2 screenUV; void main(){ screenUV=uv; gl_Position=vec4(position.xy,1.,1.); }',
    fragmentShader: `varying vec2 screenUV; uniform float finish; uniform float reveal; uniform float routeSide; ${backdropGLSL}
      void main(){ gl_FragColor=vec4(backdrop(screenUV,finish,reveal,routeSide),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2,2), material);
  mesh.frustumCulled=false;
  mesh.renderOrder=-10000;
  return {mesh,material};
}
