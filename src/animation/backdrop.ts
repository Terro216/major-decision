import * as THREE from 'three';

// Shared by the distant floor and the sky so atmospheric falloff has no seam
// at the horizon. Values are linear light; OutputPass handles display encoding.
export const backdropGLSL = `
  vec3 backdrop(vec2 uv, float finish, float reveal) {
    vec3 opening = mix(vec3(.003,.004,.017),vec3(.002,.003,.012),uv.y);
    vec2 upper = (uv-vec2(.52,.94))*vec2(1.25,1.);
    vec3 target = vec3(.0007,.001,.002) + vec3(.010,.025,.15)*exp(-dot(upper,upper)*6.);
    vec2 centre = (uv-vec2(.52,.55))*vec2(1.45,1.);
    vec2 lower = (uv-vec2(.51,-.05))*vec2(1.6,1.);
    vec3 answer = vec3(.002,.006,.035) + vec3(.006,.015,.085)*exp(-dot(centre,centre)*4.) + vec3(.028,.030,.115)*exp(-dot(lower,lower)*18.);
    return mix(opening,mix(target,answer,reveal),finish);
  }
`;

export function createBackdrop() {
  const material = new THREE.ShaderMaterial({
    uniforms: { finish: { value: 0 }, reveal: { value: 0 } },
    depthWrite: false, depthTest: false,
    vertexShader: 'varying vec2 screenUV; void main(){ screenUV=uv; gl_Position=vec4(position.xy,1.,1.); }',
    fragmentShader: `varying vec2 screenUV; uniform float finish; uniform float reveal; ${backdropGLSL}
      void main(){ gl_FragColor=vec4(backdrop(screenUV,finish,reveal),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2,2), material);
  mesh.frustumCulled=false;
  mesh.renderOrder=-10000;
  return {mesh,material};
}
