import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { answerLetters, answerPaths } from '../answerPaths';
import { pathFor, type Scenario } from './scenario';
import { ballAt, cameraAt, cameraUp, clamp, DURATION, pinContacts, smooth, timing } from './timeline';
import { add, BALL_RADIUS, fields, mix, mul, PIN_HEIGHT, PIN_RADIUS, side, sourcePosition, TARGET, TUBE, targetFrame, tubePoint, tubeTangent, type Outcome } from './mechanism';
import { tubeGeometry, wallSorter } from './tubeGeometry';
import { answerSurface, pinSurface, starSurface, tubeSurface } from './surfaces';
import { backdropGLSL, createBackdrop } from './backdrop';
export type ReviewView = 'film' | 'top' | 'side' | 'mouth';
const COLORS = { yes: '#37bc25', no: '#dc2814', purple: '#b660d0', cyan: '#4bd4fb' };

function createStar(violetCentre = true) {
  const group = new THREE.Group();
  const material = starSurface(violetCentre);
  const bevel = new THREE.MeshPhongMaterial({color: '#763d8b',emissive:'#763d8b',emissiveIntensity:.06,specular:'#747494',shininess:45});
  const triangle = new THREE.Shape().moveTo(-.51, 1.68).lineTo(.51, 1.68).lineTo(0, 2.91).closePath();
  const geometry = new THREE.ExtrudeGeometry(triangle, { depth: .10, bevelEnabled: true, bevelThickness: .06, bevelSize: .065, bevelSegments: 2 });
  for (let i = 0; i < 8; i++) {
    const ray = new THREE.Mesh(geometry, [material,bevel]);
    ray.rotation.z = i * Math.PI / 4;
    group.add(ray);
  }
  // The face is still the shared contact plane z=.20. The bevel rolls away
  // toward the back, so the plate's profile never intrudes into the sphere.
  const profile = [[0,-.03],[1.01,-.03],[1.08,.015],[1.10,.075],[1.075,.14],[1.02,.19],[.94,.20],[0,.20]].map(([r,z])=>new THREE.Vector2(r,z));
  const disc = new THREE.LatheGeometry(profile,64);
  disc.rotateX(Math.PI/2);
  const plate = new THREE.Mesh(disc, material);
  group.add(plate);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.62, .035, 12, 64), material);
  ring.position.z = .21;
  group.add(ring);
  return { group, material, bevel };
}

function createAnswer(outcome: Outcome) {
  const group = new THREE.Group();
  const loader = new SVGLoader();
  const front = answerSurface(outcome === 'yes' ? '#27c02b' : '#dc2c19');
  const edge = answerSurface(outcome === 'yes' ? '#39a925' : '#b52917', true);
  const width = outcome === 'yes' ? 320 : 226;
  for (const { letter, x } of answerLetters[outcome]) {
    const data = loader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${answerPaths[letter]}"/></svg>`);
    for (const shape of SVGLoader.createShapes(data.paths[0])) {
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 12, bevelEnabled: true, bevelSize: 2.0, bevelThickness: 2.0, bevelSegments: 2, curveSegments: 24 });
      geometry.scale(.035, -.035, -.035);
      geometry.translate((x - width / 2) * .035, 1.82, 0);
      group.add(new THREE.Mesh(geometry, [front, edge]));
    }
  }
  group.rotation.set(.055, outcome === 'yes' ? -.065 : .055, 0);
  return group;
}

function orangeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(256, 128);
  let seed = 0x604d;
  const lattice=(x:number,y:number,z:number)=>{
    let n=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647);
    n=Math.imul(n^(n>>>13),1274126177);
    return ((n^(n>>>16))>>>0)/4294967295*2-1;
  };
  const noise=(x:number,y:number,z:number)=>{
    const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
    const fade=(u:number)=>u*u*(3-2*u),a=fade(x-ix),b=fade(y-iy),c=fade(z-iz);
    const blend=(p:number,q:number,t:number)=>p+(q-p)*t;
    const layer=(dz:number)=>blend(blend(lattice(ix,iy,iz+dz),lattice(ix+1,iy,iz+dz),a),blend(lattice(ix,iy+1,iz+dz),lattice(ix+1,iy+1,iz+dz),a),b);
    return blend(layer(0),layer(1),c);
  };
  for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    const longitude=x/255*Math.PI*2, latitude=y/127*Math.PI;
    const sx=Math.sin(latitude)*Math.cos(longitude), sy=Math.cos(latitude), sz=Math.sin(latitude)*Math.sin(longitude);
    const grain = (seed/4294967296-.5)*14*Math.sin(latitude);
    // Sample the cloud in spherical coordinates so the UV seam and poles do
    // not make the diagonal bands visible in the previous close-up.
    const cloud = .65*noise(sx*4+3,sy*4+7,sz*4-2)+.30*noise(sx*9-3,sy*9+1,sz*9+6)+.15*noise(sx*19+8,sy*19-3,sz*19+4);
    const i = (y * 256 + x) * 4;
    pixels.data[i] = 218 + cloud * 40 + grain;
    pixels.data[i + 1] = 127 + cloud * 47 + grain;
    pixels.data[i + 2] = 40 + cloud * 17 + grain*.4;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x080f2c, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  // Blend the luminous ball and the actual glass in linear HDR. Clamping the
  // sphere to an 8-bit framebuffer before both walls made it disappear. This
  // keeps depth, wall opacity and the sphere's full physical size unchanged.
  const radiance = renderer.extensions.has('EXT_color_buffer_float')
    ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }) : null;
  const output = new OutputPass();
  output.renderToScreen = true;
  const scene = new THREE.Scene();
  const backdrop = createBackdrop();
  scene.add(backdrop.mesh);
  const camera = new THREE.PerspectiveCamera(40, 1241 / 688, .1, 2000);
  const ambient = new THREE.AmbientLight('#a59be0', .14);
  const key = new THREE.DirectionalLight('#fff0ef', 2.5);
  key.position.set(-5, 18, -6);
  const fill = new THREE.DirectionalLight('#5670ff', 1.0);
  fill.position.set(9, 3, -10);
  const finalLight = new THREE.PointLight('#ffffff', 80, 40, 2);
  finalLight.position.set(0, 1, 6);
  scene.add(ambient, key, fill, finalLight);
  const world = new THREE.Group();
  scene.add(world);

  const floor = new Reflector(new THREE.PlaneGeometry(10000, 10000), { color: 0x6779ad, textureWidth: 768, textureHeight: 512, clipBias: .003, multisample: 0 });
  if (!radiance) floor.getRenderTarget().texture.type = THREE.UnsignedByteType;
  // One reflecting surface also carries its substrate and light pool. Keeping
  // these in one shader avoids coplanar depth stripes at grazing camera angles.
  const mirror = floor.material as THREE.ShaderMaterial;
  mirror.uniforms.glow = { value: new THREE.Vector2(-1,-5) };
  mirror.uniforms.finish = { value: 0 };
  mirror.uniforms.reveal = backdrop.material.uniforms.reveal;
  mirror.uniforms.resolution = { value: new THREE.Vector2(1,1) };
  mirror.vertexShader = mirror.vertexShader.replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec3 floorView; varying vec3 floorWorld;').replace('vUv = textureMatrix', 'floorView = (modelViewMatrix * vec4(position,1.)).xyz; floorWorld = (modelMatrix * vec4(position,1.)).xyz; vUv = textureMatrix');
  mirror.fragmentShader = mirror.fragmentShader.replace('varying vec4 vUv;', `varying vec4 vUv; varying vec3 floorView; varying vec3 floorWorld; uniform vec2 glow; uniform vec2 resolution; uniform float finish; uniform float reveal; ${backdropGLSL}`).replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );', `
    vec2 delta = floorWorld.xz - glow;
    float pool = exp(-dot(delta,delta)/22.);
    float wash = .5+.5*sin(floorWorld.x*.13+floorWorld.z*.09);
    vec3 substrate = vec3(.035,.027,.46)+wash*vec3(.014,.008,.055)+pool*vec3(.67,.29,.79);
    vec3 radiance = mix(substrate,blendOverlay(base.rgb,color),.50);
    vec3 horizon = backdrop(gl_FragCoord.xy/resolution,finish,reveal);
    gl_FragColor = vec4(mix(horizon,radiance,exp(-length(floorView)/mix(160.,10.,finish))),1.);
  `);
  floor.rotation.x = -Math.PI / 2;
  world.add(floor);
  const pool = new THREE.PointLight('#e59ce9', 1.8, 24, 1.8);
  pool.position.set(-1, 3, -5);
  world.add(pool);

  const source = createStar(false);
  source.material.emissiveIntensity=.70;
  source.group.position.fromArray(sourcePosition('yes'));
  world.add(source.group);
  const targetLamp = new THREE.SpotLight('#ffffff',140,40,.80,.8,2);
  world.add(targetLamp,targetLamp.target);

  const pinGeometry = new THREE.LatheGeometry([[0,0],[.115,0],[PIN_RADIUS,.03],[PIN_RADIUS,PIN_HEIGHT-.035],[.11,PIN_HEIGHT],[0,PIN_HEIGHT]].map(([r,y])=>new THREE.Vector2(r,y-PIN_HEIGHT/2)),24);
  // Bands sit on, never outside, the shared collision radius.
  const branches = (['yes', 'no'] as const).map(outcome => {
    const group = new THREE.Group();
    const pins = fields[outcome].pins.map(pin => {
      const material = pinSurface();
      const mesh = new THREE.Group();
      const body = new THREE.Mesh(pinGeometry, material);
      body.position.y = PIN_HEIGHT / 2;
      mesh.add(body);
      mesh.position.fromArray(pin.position);
      group.add(mesh);
      return { mesh, material };
    });
    const material = tubeSurface();
    const tube = new THREE.Mesh(tubeGeometry(outcome), material);
    const sortWall = wallSorter(tube.geometry), renderDirection = new THREE.Vector3();
    // Runs for both the main view and the Reflector's virtual camera. r180's
    // bindingStates.setup uploads the changed index after onBeforeRender.
    tube.onBeforeRender = (_renderer, _scene, renderCamera) => {
      if (material.opacity < 1) sortWall(renderCamera.getWorldDirection(renderDirection));
    };
    group.add(tube);
    const frame = targetFrame(outcome);
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...frame.right), new THREE.Vector3(...frame.up), new THREE.Vector3(...frame.normal));
    const target = createStar();
    const targetMount = new THREE.Group();
    targetMount.position.fromArray(frame.center);
    targetMount.quaternion.setFromRotationMatrix(basis);
    target.group.scale.setScalar(TARGET.scale);
    targetMount.add(target.group);
    group.add(targetMount);
    // The final camera rises, revealing the answer above the same stationary
    // target. Neither the ball nor the target is swapped, scaled or teleported.
    const answers = (['yes', 'no'] as const).map(result => {
      const mesh = createAnswer(result);
      mesh.position.set(-.10, 13.05, 0);
      mesh.scale.setScalar(1.65);
      targetMount.add(mesh);
      return { result, mesh };
    });
    world.add(group);
    return { outcome, group, pins, tube, material, target, targetMount, answers };
  });
  const texture = orangeTexture();
  const ballMaterial = new THREE.MeshPhongMaterial({ map: texture, emissiveMap: texture, specular: '#6a4d26', shininess: 18 });
  // A luminous sphere during the pulse, as in the reference. Multiplying its
  // green emission by the orange albedo suppressed it inside the real wall.
  // The mesh, depth test, radius and wall opacity are identical in both states.
  const glowingBallMaterial = new THREE.MeshBasicMaterial({ color: '#82ff52' });
  const ball = new THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial | THREE.MeshBasicMaterial>(new THREE.SphereGeometry(BALL_RADIUS, 40, 28), ballMaterial);
  world.add(ball);
  // The travelling pulse illuminates the nearby real wall. This keeps its
  // position legible through dense glass without thinning the distant skins.
  const pulse = new THREE.PointLight('#75ff48', 0, 2.8, 2);
  world.add(pulse);
  let lastTime = 0, lastOutcome: Outcome = 'yes', lastView: ReviewView = 'film', lastOpaque = false, disposed = false;
  let lastScenario: Scenario = 'left';

  function render(time: number, outcome: Outcome, scenario: Scenario, view: ReviewView = 'film', opaque = false) {
    if (disposed) return;
    lastTime = clamp(time, 0, DURATION); lastOutcome = outcome; lastView = view; lastOpaque = opaque;
    lastScenario = scenario;
    const path = pathFor(scenario);
    const t = lastTime, c = cameraAt(t, path), f = targetFrame(path);
    camera.position.set(c[0], c[1], c[2]);
    camera.up.fromArray(cameraUp(c));
    camera.lookAt(c[3], c[4], c[5]);
    camera.fov = c[6];
    const p = ballAt(t, path);
    if (view === 'top') {
      camera.position.set(p[0], p[1] + 17, p[2] + .01);
      camera.up.set(0, 0, -1);
      camera.lookAt(...p); camera.fov = 50;
    } else if (view === 'side') {
      camera.up.set(0, 1, 0);
      camera.position.set(p[0] + 13, p[1] + 2, p[2]);
      camera.lookAt(...p); camera.fov = 50;
    } else if (view === 'mouth') {
      camera.up.set(0, 1, 0);
      const mouth = tubePoint(0, path), axis = tubeTangent(0, path);
      camera.position.fromArray(add(add(mouth, mul(axis, -6)), [0, 2, 2]));
      camera.lookAt(...mouth); camera.fov = 45;
    }
    camera.updateProjectionMatrix();
    source.group.position.fromArray(sourcePosition(path));
    source.group.rotation.z = -2.6 * (t - .4);
    ball.position.fromArray(p);
    ball.visible = t >= timing[path].release;
    ball.rotation.set(t * 2, t * 1.7, t);
    // Ball radius is constant throughout the journey, including the impact.
    const colored = t >= timing[path].entry && t < timing[path].exit;
    ball.material = colored ? glowingBallMaterial : ballMaterial;
    glowingBallMaterial.color.set(outcome === 'yes' ? '#8fff4d' : '#ff3923').multiplyScalar(radiance ? 2.2 : 1);
    ballMaterial.color.set('#ffffff');
    ballMaterial.emissive.set('#ffffff');
    // The impact leaves a luminous orange centre in the film. This is the
    // same full-radius sphere, still tangent to the plate and depth-tested.
    ballMaterial.emissiveIntensity = .055 + .70*smooth((t-TARGET.hit)/.10);
    pulse.position.fromArray(p);
    pulse.color.set(outcome === 'yes' ? '#75ff48' : '#ff5130');
    pulse.intensity = colored ? 3.5 : 0;
    for (const branch of branches) {
      // The route and answer are fixed for the whole run, never frame masks.
      branch.group.visible = branch.outcome === path;
      for (const answer of branch.answers) answer.mesh.visible = answer.result === outcome;
      branch.material.color.set(colored ? COLORS[outcome] : '#c26bd3');
      branch.material.emissive.set(colored ? COLORS[outcome] : '#07010e');
      branch.material.emissiveIntensity = colored ? .012 : 1;
      // The film's colored pulse still reveals the travelling ball. Keep the
      // same glass opacity through the pulse; geometry also passes opaque review.
      branch.material.opacity = opaque ? 1 : .70;
      branch.material.depthWrite = opaque;
      branch.target.material.color.set(t >= TARGET.color ? COLORS[outcome] : COLORS.purple);
      const flash=Math.exp(-(((t-5.865)/.025)**2));
      branch.target.material.emissive.copy(branch.target.material.color).lerp(new THREE.Color('#4768ff'),flash);
      branch.target.material.emissiveIntensity=.025+.55*flash;
      branch.target.bevel.color.copy(branch.target.material.color).multiplyScalar(.6);
      branch.target.bevel.emissive.copy(branch.target.bevel.color);
      branch.target.group.rotation.z = -side(path) * 2.3 * (t - 5.95);
      for (const pin of branch.pins) { pin.material.color.set(COLORS.cyan); pin.material.emissive.set('#09364f'); }
      for (const [hit, index, color] of pinContacts[branch.outcome]) if (t >= hit) {
        branch.pins[index].material.color.set(COLORS[color]);
        branch.pins[index].material.emissive.set(color === 'yes' ? '#062705' : '#300502');
      }
    }
    const sourceFloor = sourcePosition(path);
    const poolTravel = smooth((t-1.1)/3.4);
    pool.position.fromArray(mix([sourceFloor[0],4,sourceFloor[2]+1],[side(path)*TUBE.x,4,TUBE.z],poolTravel));
    mirror.uniforms.glow.value.set(pool.position.x, pool.position.z);
    const finishMix = smooth((t - 5.5) / .5);
    mirror.uniforms.finish.value = finishMix;
    backdrop.material.uniforms.finish.value = finishMix;
    backdrop.material.uniforms.reveal.value = smooth((t - 6.15) / .6);
    const rise = 12.5 * smooth((t - 6.03) / .73);
    // A close lamp above the plate gives the reference's bright upper rays
    // and shaded lower rays. It follows the answer reveal, not camera yaw.
    const reveal = backdrop.material.uniforms.reveal.value;
    finalLight.position.fromArray(add(add(f.center, mul(f.up, rise + 5 - 2*reveal)), mul(f.normal, 3 + 7*reveal)));
    finalLight.intensity = 360 * reveal * finishMix;
    targetLamp.position.fromArray(add(add(f.center,mul(f.up,3)),mul(f.normal,5)));
    targetLamp.target.position.fromArray(add(f.center,mul(f.up,3)));
    targetLamp.target.updateMatrixWorld();
    targetLamp.intensity=140*finishMix*(1-reveal);
    ambient.intensity = .14 - .105 * finishMix;
    key.position.fromArray(mix([-5, 18, -6], add(add(f.center, mul(f.up, rise + 4)), add(mul(f.normal, 10), mul(f.right, -4))), finishMix));
    key.target.position.fromArray(mix([0,0,0], add(f.center, mul(f.up, rise)), finishMix));
    key.target.updateMatrixWorld();
    key.intensity = 2.5 - 2.4 * finishMix;
    fill.intensity = 1.0 - .94 * finishMix;
    renderer.setRenderTarget(radiance);
    renderer.render(scene, camera);
    if (radiance) output.render(renderer, radiance, radiance, 0, false);
  }

  const resize = (draw = true) => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5, Math.sqrt(1_500_000 / (width * height))));
    renderer.setSize(width, height, false);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    radiance?.setSize(size.x, size.y);
    mirror.uniforms.resolution.value.copy(size);
    const reflectionWidth = Math.min(768, Math.max(256, Math.round(size.x * .66)));
    floor.getRenderTarget().setSize(reflectionWidth, Math.round(reflectionWidth * 2 / 3));
    camera.aspect = 1241 / 688;
    if (draw) render(lastTime, lastOutcome, lastScenario, lastView, lastOpaque);
  };
  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas);
  resize(false);
  return {
    render,
    cameraPose: () => ({ position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), projection: camera.projectionMatrix.toArray() }),
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      floor.dispose();
      radiance?.dispose();
      output.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
        }
      });
      geometries.forEach(g => g.dispose());
      // One of these is detached from the mesh at any particular frame.
      materials.add(ballMaterial);
      materials.add(glowingBallMaterial);
      materials.forEach(m => m.dispose());
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
