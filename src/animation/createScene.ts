import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { answerLetters, answerPaths } from '../answerPaths';
import { pathFor, type Scenario } from './scenario';
import { ballAt, cameraAt, cameraUp, clamp, DURATION, pinColorEvents, reached, revealRise, smooth, sourceAngleAt, targetAngleAt, timing, track } from './timeline';
import { add, BALL_RADIUS, fields, mix, mul, PIN_HEIGHT, PIN_RADIUS, side, SOURCE_SCALE, sourcePosition, STAR_RING, TARGET, TUBE, targetFrame, tubePoint, tubeTangent, type Outcome } from './mechanism';
import { tubeGeometry, wallSorter } from './tubeGeometry';
import { answerSurface, ballSurface, pinSurface, starEdgeSurface, starSurface, tubeSurface } from './surfaces';
import { ballRadiance } from './ballRadiance';
import { backdropGLSL, createBackdrop, openingFloorEdge } from './backdrop';
import type { FreestyleRun } from './freestyle';
export type ReviewView = 'film' | 'top' | 'side' | 'mouth';
const COLORS = { yes: '#37bc25', no: '#dc2814', purple: '#b660d0', cyan: '#65aaee' };

function createStar(violetCentre = true) {
  const group = new THREE.Group();
  const material = starSurface(violetCentre);
  const bevel = starEdgeSurface();
  // Invert Three.js's sqrt(2)-limited corner offsets to narrow the bevel
  // without moving any outer triangle vertex. A plain line offset grows tips.
  const [bevelSize,half,base,tip]=violetCentre
    ? [.035,.5452101565862036,1.6563298759110106,2.952426406871193]
    : [.065,.51,1.68,2.91];
  const triangle = new THREE.Shape().moveTo(-half,base).lineTo(half,base).lineTo(0,tip).closePath();
  // Keep the bevel angle and both axial bounds as its width narrows.
  const bevelThickness=.06*bevelSize/.065;
  const geometry = new THREE.ExtrudeGeometry(triangle, { depth: .22-2*bevelThickness, bevelEnabled: true, bevelThickness, bevelSize, bevelSegments: 2 });
  geometry.translate(0,0,bevelThickness-.06);
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
  const ringMaterial = violetCentre
    ? new THREE.MeshPhongMaterial({color:'#b660d0',emissive:'#b660d0',emissiveIntensity:.04,specular:'#514665',shininess:70})
    : material;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(STAR_RING.radius, STAR_RING.radial, 16, 64), ringMaterial);
  ring.scale.z=STAR_RING.axial/STAR_RING.radial;
  ring.position.z = STAR_RING.z;
  group.add(ring);
  return { group, material, bevel, ringMaterial };
}

function createAnswer(outcome: Outcome) {
  const group = new THREE.Group();
  const loader = new SVGLoader();
  // Reconstruct the painted fronts and lamp from flat interior patches in
  // the two endings; the polished bevel remains a separate real surface.
  const front = answerSurface(outcome === 'yes' ? '#27832d' : '#841808');
  const frontSpecular = outcome === 'yes' ? .000437122 : .004406102;
  front.specular.setRGB(frontSpecular,frontSpecular,frontSpecular);
  const edge = answerSurface(outcome === 'yes' ? '#328526' : '#961d0b', true);
  if (outcome === 'no') edge.specular.set('#181818');
  const width = outcome === 'yes' ? 320 : 226;
  for (const { letter, x, y, sx, sy } of answerLetters[outcome]) {
    const data = loader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${answerPaths[letter]}"/></svg>`);
    for (const shape of SVGLoader.createShapes(data.paths[0])) {
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 12, bevelEnabled: true, bevelSize: 2.0, bevelThickness: 2.0, bevelSegments: 2, curveSegments: 24 });
      geometry.scale(.035*sx, -.035*sy, -.035);
      geometry.translate((x - width / 2) * .035, 1.82-y*.035, 0);
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
    const mottle = Math.max(0,noise(sx*2.4-4,sy*2.4+2,sz*2.4+9));
    const i = (y * 256 + x) * 4;
    pixels.data[i] = 225 + cloud * 25 - mottle * 32 + grain;
    pixels.data[i + 1] = 145 + cloud * 28 - mottle * 20 + grain;
    pixels.data[i + 2] = 50 + cloud * 16 - mottle * 7 + grain*.4;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
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
  key.position.set(-5, 12, -12);
  const fill = new THREE.DirectionalLight('#5670ff', 1.0);
  fill.position.set(9, 3, -10);
  const finalLight = new THREE.PointLight('#ffffff', 80, 40, 2);
  finalLight.position.set(0, 1, 6);
  scene.add(ambient, key, fill, finalLight);
  const world = new THREE.Group();
  scene.add(world);

  const floor = new Reflector(new THREE.PlaneGeometry(10000, 10000), { color: 0x6779ad, textureWidth: 768, textureHeight: 512, clipBias: .003, multisample: 0 });
  if (!radiance) floor.getRenderTarget().texture.type = THREE.UnsignedByteType;
  floor.getRenderTarget().texture.generateMipmaps = true;
  floor.getRenderTarget().texture.minFilter = THREE.LinearMipmapLinearFilter;
  // One reflecting surface also carries its substrate and light pool. Keeping
  // these in one shader avoids coplanar depth stripes at grazing camera angles.
  const mirror = floor.material as THREE.ShaderMaterial;
  mirror.uniforms.glow = { value: new THREE.Vector2(-1,-5) };
  mirror.uniforms.coilGlow = { value: new THREE.Vector2(TUBE.x,TUBE.z) };
  mirror.uniforms.coilFloorLight = { value: 0 };
  mirror.uniforms.finish = { value: 0 };
  mirror.uniforms.openingCut = { value: 1 };
  mirror.uniforms.openingLight = { value: 1 };
  mirror.uniforms.openingPoolStrength = { value: .60 };
  mirror.uniforms.openingBoundary = { value: new THREE.Vector2(-41,0) };
  mirror.uniforms.farShade = { value: 0 };
  mirror.uniforms.flightDark = backdrop.material.uniforms.flightDark;
  mirror.uniforms.lightBoundary = { value: new THREE.Vector4(0,-7.46,0,.2) };
  mirror.uniforms.latePanelColor = { value: 0 };
  mirror.uniforms.routeSide = { value: 1 };
  mirror.uniforms.reveal = backdrop.material.uniforms.reveal;
  mirror.uniforms.resolution = { value: new THREE.Vector2(1,1) };
  mirror.uniforms.reflectionLod = { value: 4.0 };
  mirror.vertexShader = mirror.vertexShader.replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec3 floorView; varying vec3 floorWorld;').replace('vUv = textureMatrix', 'floorView = (modelViewMatrix * vec4(position,1.)).xyz; floorWorld = (modelMatrix * vec4(position,1.)).xyz; vUv = textureMatrix');
  // A rough reflecting floor softens the actual reflected scene. It does not
  // substitute a second star, remove objects or change the glass/sphere.
  mirror.fragmentShader = mirror.fragmentShader.replace('vec4 base = texture2DProj( tDiffuse, vUv );', `
    vec2 reflectionUV = vUv.xy / vUv.w;
    vec4 base = texture2DLodEXT(tDiffuse,reflectionUV,reflectionLod);
  `);
  mirror.fragmentShader = mirror.fragmentShader.replace('varying vec4 vUv;', `varying vec4 vUv; varying vec3 floorView; varying vec3 floorWorld; uniform vec2 glow; uniform vec2 coilGlow; uniform float coilFloorLight; uniform vec2 resolution; uniform float reflectionLod; uniform float finish; uniform float reveal; uniform float openingCut; uniform float openingLight; uniform float openingPoolStrength; uniform vec2 openingBoundary; uniform float farShade; uniform vec4 lightBoundary; uniform float latePanelColor; uniform float routeSide; ${backdropGLSL}`).replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );', `
    vec2 delta = floorWorld.xz - glow;
    vec2 poolWidth = mix(vec2(4.5,4.5/.22),vec2(2.85*2.85,6.1*6.1),openingLight);
    float pool = exp(-dot(delta*delta,1./poolWidth));
    float poolCore = exp(-delta.x*delta.x/(1.5*1.5)-delta.y*delta.y/(3.75*3.75))*openingLight;
    vec2 coilDelta = floorWorld.xz-coilGlow;
    float coilPool = exp(-dot(coilDelta,coilDelta)/120.);
    float edge = 1.-smoothstep(lightBoundary.x-.035,lightBoundary.x+.035,floorWorld.z);
    float corner = 1.-lightBoundary.z*smoothstep(lightBoundary.y-.035,lightBoundary.y+.035,routeSide*floorWorld.x+floorWorld.z);
    float panel = edge*corner*lightBoundary.w;
    float warm = smoothstep(-6.,3.,routeSide*floorWorld.x);
    float poolPanel = edge*corner*openingPoolStrength;
    vec3 panelColor = mix(vec3(.008+.05*warm,.008+.025*warm,.13+.15*warm),
      vec3(.143620,.105083,.230267)+vec3(.041430,-.009799,-.008534)*clamp(floorWorld.x,-2.,5.),latePanelColor);
    vec3 substrate = mix(vec3(.010,.008,.145),vec3(.010,.008,.195),(routeSide+1.)*.5)+panel*panelColor+poolPanel*(pool*mix(vec3(.50,.23,.65),vec3(.741582,.305187,.731300),openingLight)+poolCore*vec3(.279249,.456447,0.));
    // One fixed mirrored light pool beneath the coil, reconstructed from
    // clear floor samples in both clips. It rises after entry, independently
    // of the answer color, and illuminates the actual reflecting surface.
    vec2 localPoolDelta = vec2(routeSide*floorWorld.x,floorWorld.z)-vec2(6.5,-2.5);
    float localPool = exp(-dot(localPoolDelta,localPoolDelta)/12.25);
    substrate += localPool*vec3(.526258,.329015,.281640)*coilFloorLight;
    vec3 radiance = substrate + base.rgb*.52 + coilPool*vec3(.065,.030,.28);
    vec3 horizon = backdrop(gl_FragCoord.xy/resolution,finish,reveal,routeSide);
    // The final approach reveals a hard dark region with a fixed world-space
    // boundary. Its lighting transition is inferred from source frames;
    // neither the floor geometry nor the camera follows the ball's silhouette.
    float farEdge = 1.-farShade*smoothstep(50.169273,50.269273,routeSide*floorWorld.x-.461612929*floorWorld.z);
    float farLightWidth = mix(.05,.9,openingLight);
    float farLight = smoothstep(openingBoundary.x-farLightWidth,openingBoundary.x+farLightWidth,
      floorWorld.z-openingBoundary.y*floorWorld.x);
    gl_FragColor = vec4(mix(horizon,radiance,(1.-finish)*farEdge*exp(-length(floorView)/mix(100.,10.,finish))*(1.-openingCut*(1.-farLight))),1.);
  `);
  floor.rotation.x = -Math.PI / 2;
  world.add(floor);
  const pool = new THREE.PointLight('#e59ce9', .6, 24, 1.8);
  pool.position.set(-1, 3, -5);
  world.add(pool);

  const source = createStar(false);
  source.group.scale.setScalar(SOURCE_SCALE);
  source.material.color.set('#bd4dc2').multiplyScalar(.15);
  source.material.emissive.set('#bd4dc2');
  source.material.emissiveIntensity=.90;
  source.material.specular.set('#b2b7c5');
  source.material.shininess=110;
  source.bevel.color.set('#9f6aae');
  source.bevel.emissive.set('#a45fd5');
  source.bevel.emissiveIntensity=.50;
  source.bevel.specular.set('#b2c3d4');
  source.bevel.shininess=60;
  // One local lamp produces both the outer plate and inner ring glints.
  const sourceLamp=new THREE.PointLight('#fff4fb',30,30,2);
  world.add(sourceLamp);
  const coilLight = new THREE.PointLight('#ffffff',140,50,2);
  // The neutral glass has white glints over its magenta body. Keep that
  // lamp local to the coil so it does not recolour the distant target.
  const coilNeutral = new THREE.SpotLight('#ffffff',0,50,.70,.35,2);
  const coilNeutralColor = new THREE.Color('#e294ee').multiply(new THREE.Color(.7,.9,.5));
  const coilNeutralEmission = new THREE.Color('#32164a').multiply(new THREE.Color(2.4,3,2.4));
  world.add(coilNeutral,coilNeutral.target);
  const coilPulse = new THREE.SpotLight('#ffffff',0,30,.75,.9,2);
  world.add(coilPulse,coilPulse.target);
  world.add(coilLight);
  const coilBlue = new THREE.DirectionalLight('#2144ff', 0);
  world.add(coilBlue, coilBlue.target);
  // The outer pin rows and their floor patch are brighter in the inlet
  // views. A fixed local lamp reaches these stems without flattening the
  // opening field or lighting the upper coil from the camera.
  const pinFill = new THREE.SpotLight('#f6eaff',100,18,.60,.65,2);
  world.add(pinFill,pinFill.target);
  source.group.position.fromArray(sourcePosition('yes'));
  world.add(source.group);
  const targetLamp = new THREE.SpotLight('#ffffff',140,40,.80,.8,2);
  world.add(targetLamp,targetLamp.target);
  // Light parallel to the plate reaches its bevels without filling the
  // shadowed front faces of the lower rays.
  const targetEdgeLamp=new THREE.DirectionalLight('#ffffff',1.8);
  world.add(targetEdgeLamp,targetEdgeLamp.target);
  const targetBlue = new THREE.SpotLight('#244dff',12,25,.494403,.157272,2);
  world.add(targetBlue,targetBlue.target);

  const pinGeometry = new THREE.LatheGeometry([[0,0],[.115,0],[PIN_RADIUS,.03],[PIN_RADIUS,PIN_HEIGHT-.035],[.11,PIN_HEIGHT],[0,PIN_HEIGHT]].map(([r,y])=>new THREE.Vector2(r,y-PIN_HEIGHT/2)),24);
  // Bands sit on, never outside, the shared collision radius.
  const branches = (['yes', 'no'] as const).map(outcome => {
    const group = new THREE.Group();
    const pins = fields[outcome].pins.map(pin => {
      const material = pinSurface();
      const openingLight = sourcePosition(outcome);
      material.userData.sourceLight.value.set(openingLight[0],4,openingLight[2]+1);
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
    target.material.userData.lightFrame.value.copy(basis)
      .scale(new THREE.Vector3(TARGET.scale,TARGET.scale,TARGET.scale))
      .setPosition(...frame.center).invert();
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
      // Same final framing as the old 18-unit camera, now at a fixed 11-unit
      // depth throughout the reveal. The letters no longer shrink on entry.
      mesh.position.set(-.10*11/18, 9.7+.55*11/18, 0);
      mesh.scale.setScalar(1.65*11/18);
      targetMount.add(mesh);
      return { result, mesh };
    });
    world.add(group);
    return { outcome, group, pins, tube, material, target, targetMount, answers };
  });
  const texture = orangeTexture();
  const ballMaterial = ballSurface(texture);
  // A warm luminous sphere stays visible through the real wall without
  // disclosing the answer. Its radius and depth test remain unchanged.
  const glowingBallMaterial = new THREE.MeshBasicMaterial({ color: '#ffc568' });
  const ball = new THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial | THREE.MeshBasicMaterial>(new THREE.SphereGeometry(BALL_RADIUS, 40, 28), ballMaterial);
  world.add(ball);
  // The travelling pulse illuminates the nearby real wall. This keeps its
  // position legible through dense glass without thinning the distant skins.
  const pulse = new THREE.PointLight('#ffc568', 0, 2.8, 2);
  world.add(pulse);
  const guides = new THREE.Group();
  world.add(guides);
  const guideMaterial = new THREE.MeshPhongMaterial({ color: '#4079a0', specular: '#c0e7f3', shininess: 75 });
  let guideRun: FreestyleRun | null = null;
  const guideRail = (points: THREE.Vector3[]) => guides.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(8, points.length), .10, 8, false), guideMaterial));
  function updateGuides(run: FreestyleRun | null, path: Outcome) {
    if (run === guideRun) return;
    for (const child of guides.children) (child as THREE.Mesh).geometry.dispose();
    guides.clear(); guideRun = run;
    if (!run) return;
    const s = side(path), clearance = BALL_RADIUS + .10;
    for (const x of [-10.5 - clearance, 7.5 + clearance]) guideRail([
      new THREE.Vector3(s*x,BALL_RADIUS,-9.5-clearance), new THREE.Vector3(s*x,BALL_RADIUS,6.5),
    ]);
    guideRail([new THREE.Vector3(s*(-10.5-clearance),BALL_RADIUS,-9.5-clearance),new THREE.Vector3(s*(7.5+clearance),BALL_RADIUS,-9.5-clearance)]);
    for (const side of [-1, 1]) {
      const rail = Array.from({ length: 97 }, (_, i) => {
        const d = run.guideLength*i/96, p = new THREE.Vector3(...run.guidePoint(d));
        const a = new THREE.Vector3(...run.guidePoint(Math.max(0,d-.01)));
        const b = new THREE.Vector3(...run.guidePoint(Math.min(run.guideLength,d+.01)));
        const normal = b.sub(a).cross(new THREE.Vector3(0,1,0)).normalize();
        return p.addScaledVector(normal,side*clearance);
      });
      guideRail(rail);
    }
  }
  let lastTime = 0, lastOutcome: Outcome = 'yes', lastView: ReviewView = 'film', lastOpaque = false, disposed = false;
  let lastScenario: Scenario = 'left';
  let lastFreestyle: FreestyleRun | null = null;

  function render(time: number, outcome: Outcome, scenario: Scenario, view: ReviewView = 'film', opaque = false, freestyle: FreestyleRun | null = null) {
    if (disposed) return;
    lastTime = clamp(time, 0, freestyle?.duration ?? DURATION); lastOutcome = outcome; lastView = view; lastOpaque = opaque;
    lastScenario = scenario;
    lastFreestyle = freestyle;
    const path = pathFor(scenario);
    updateGuides(freestyle, path);
    const t = freestyle?.filmTime(lastTime) ?? lastTime, c = freestyle?.cameraAt(lastTime) ?? cameraAt(t, path), f = targetFrame(path);
    camera.position.set(c[0], c[1], c[2]);
    camera.up.fromArray(cameraUp(c));
    camera.lookAt(c[3], c[4], c[5]);
    camera.fov = c[6];
    const p = freestyle?.ballAt(lastTime) ?? ballAt(t, path);
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
    source.group.rotation.z = sourceAngleAt(t, path);
    ball.position.fromArray(p);
    ball.visible = reached(t,timing[path].release);
    if (freestyle) ball.quaternion.copy(freestyle.rotationAt(lastTime));
    else ball.rotation.set(t * 2, t * 1.7, t);
    // Ball radius is constant throughout the journey, including the impact.
    const inTube = reached(t,timing[path].pulseStart) && !reached(t,timing[path].pulseEnd);
    // The source holds a dim entry pose for three left-route frames and two
    // right-route frames. Light rises as the unchanged sphere enters the wall.
    const entryGlow = smooth((t-timing[path].pulseStart-(path==='yes'?2:1)/30)*30);
    ball.material = inTube ? glowingBallMaterial : ballMaterial;
    glowingBallMaterial.color.set('#ffc568')
      .multiplyScalar(THREE.MathUtils.lerp(.7,radiance?1.8:1,entryGlow));
    ballMaterial.color.set('#ffffff');
    ballMaterial.emissive.set('#ffffff');
    // Keep the warm orange fill through the unlit flight, then leave the
    // luminous centre seen at impact. This remains the same full-radius,
    // depth-tested sphere, tangent to the plate after contact.
    ballMaterial.emissiveIntensity = .42 - .41*smooth((t-1.2)/.6) + .43*smooth((t-timing[path].pulseEnd)/.10) + .16*smooth((t-timing[path].hit)/.10);
    if (freestyle) ballMaterial.emissiveIntensity = Math.max(.16,ballMaterial.emissiveIntensity);
    const surfaceRadiance = track(ballRadiance[path],t);
    for (let i=0; i<ballMaterial.userData.radiance.value.length; i++) ballMaterial.userData.radiance.value[i].fromArray(surfaceRadiance,i*3);
    ballMaterial.userData.radianceAmount.value = freestyle ? 0 : 1-smooth((t-(timing[path].color-1/30))/(1/30));
    pulse.position.fromArray(p);
    pulse.color.set('#ffc568');
    pulse.intensity = inTube ? 3 : 0;
    for (const branch of branches) {
      // The route and answer are fixed for the whole run, never frame masks.
      branch.group.visible = branch.outcome === path;
      // The answer belongs to the result phase. Before then its reflection
      // must not reveal a word beneath the distant target during the inlet shot.
      for (const answer of branch.answers) answer.mesh.visible = answer.result === outcome && reached(t,timing[path].color);
      // Glass and travelling light never reveal the future answer. Only the
      // target and lettering receive YES/NO colors after the actual impact.
      branch.material.userData.pulseScatter.value.set(p[0],p[1],p[2],0);
      branch.material.color.copy(coilNeutralColor);
      branch.material.userData.neutralTint.value = 1;
      branch.material.emissive.copy(coilNeutralEmission);
      branch.material.emissiveIntensity = 1;
      branch.material.shininess = 260;
      branch.material.specular.setRGB(.04,.04,.04);
      branch.material.opacity = opaque ? 1 : .82;
      branch.material.depthWrite = opaque;
      branch.material.blending = opaque ? THREE.NoBlending : THREE.NormalBlending;
      const coloredTarget=reached(t,timing[path].color);
      // Only the left route has a blue precolor frame; the right route keeps
      // its violet plate in both held frames before the red result.
      const flash=coloredTarget||path==='no'?0:Math.exp(-(((t-(timing[path].color-1/30))/.012)**2));
      branch.target.material.color.set(coloredTarget ? (outcome==='yes'?'#42bc42':'#dc3020') : COLORS.purple);
      if (!coloredTarget) branch.target.material.color.multiply(new THREE.Color(1.029735,1.226228,.924010));
      branch.target.material.userData.centerColor.set(coloredTarget?(outcome==='yes'?'#645398':'#9a5396'):'#9843ae');
      branch.target.material.userData.centerAmount.value = coloredTarget ? 1 : flash;
      branch.target.material.userData.flash.value = flash;
      const distantFill=1-smooth((t-(timing[path].hit-.3))/.3);
      branch.target.material.userData.plateFill.value = reached(t,timing[path].color) ? (outcome==='yes'?.88:.56) : .50*distantFill;
      // Blue-violet rays remain distinct from the pink plate until the
      // measured result-colour frame, including the close impact view.
      branch.target.material.userData.rayCool.value = reached(t,timing[path].color) ? 0 : 1;
      branch.target.material.emissive.copy(branch.target.material.color).lerp(new THREE.Color('#4768ff'),flash);
      branch.target.material.emissiveIntensity=coloredTarget?.001:.025*(1-flash);
      if (coloredTarget) branch.target.ringMaterial.color.copy(branch.target.material.color);
      else branch.target.ringMaterial.color.set(COLORS.purple);
      branch.target.ringMaterial.color.lerp(new THREE.Color('#93cfff'),flash);
      branch.target.ringMaterial.emissive.copy(branch.target.ringMaterial.color);
      branch.target.ringMaterial.emissive.r*=1+.22*distantFill;
      branch.target.ringMaterial.emissive.g*=1+.04*distantFill;
      branch.target.ringMaterial.emissive.b*=1-.04*distantFill;
      branch.target.ringMaterial.emissiveIntensity=(coloredTarget?(outcome==='yes'?.75:.36):.24+.38*distantFill)*(1-flash);
      branch.target.ringMaterial.specular.set(coloredTarget?'#8996b5':'#66537d');
      if (!coloredTarget) branch.target.ringMaterial.specular.multiplyScalar(.45);
      branch.target.ringMaterial.specular.lerp(new THREE.Color('#c6dfff'),flash);
      branch.target.ringMaterial.shininess=30;
      if(coloredTarget) branch.target.bevel.color.copy(branch.target.material.color).multiplyScalar(.6);
      else branch.target.bevel.color.set('#8d5ac9');
      branch.target.bevel.specular.set(coloredTarget?'#747494':'#ad8cff');
      branch.target.bevel.shininess=coloredTarget?45:60;
      branch.target.bevel.emissive.copy(branch.target.bevel.color);
      branch.target.bevel.emissiveIntensity=coloredTarget?.012:.020;
      branch.target.group.rotation.z = targetAngleAt(t,path);
      for (const pin of branch.pins) { pin.material.color.set(COLORS.cyan); pin.material.emissive.set('#254c8e'); pin.material.specular.set('#528fc0'); pin.material.userData.colored.value=0; }
      const pinEvents = freestyle ? freestyle.contacts.map(c => [c.time,c.index,c.color] as const) : pinColorEvents[branch.outcome];
      for (const [change, index, color] of pinEvents) if (reached(freestyle ? lastTime : t,change)) {
        branch.pins[index].material.color.set(COLORS[color]);
        branch.pins[index].material.userData.colored.value=1;
        branch.pins[index].material.emissive.set(color === 'yes' ? '#062705' : '#300502');
        branch.pins[index].material.specular.set(COLORS[color]).multiplyScalar(.3);
      }
    }
    const sourceFloor = sourcePosition(path);
    sourceLamp.position.set(sourceFloor[0]+side(path)*8,sourceFloor[1],sourceFloor[2]+8);
    // The film has hard moving illumination boundaries, not one broad pink
    // pool following the ball. These measured floor intersections are a light
    // reconstruction; no extra collidable platform or screen mask is implied.
    const floorClock=t-(path==='no'?2/30:0);
    const boundary=track([[0,0,-7.46,0,.2],[.70,-3,-7.46,0,.65],[.95,-6.70,-7.46,0,1],[1.20,-10.61,-7.46,0,1],[1.50,-13.93,-7.46,0,1],[1.90,-8.6,-7.8,1,1],[2.00,-8.42,-7.46,1,1],[2.50,-8.5,-8.5,1,.8],[3.20,-10,-10,1,0]],floorClock);
    mirror.uniforms.lightBoundary.value.fromArray(boundary);
    // The right-route light rectangle continues across the late field. Its
    // two world-space boundaries were measured independently of the pin/ball
    // camera fits; mirroring the left route lost this visible pink wedge.
    const latePanel = path==='no'?smooth((t-2)/.15):0;
    const lateBoundary = track([[2,-8.522,-7.496604],[68/30,-7.20,-6.718798],
      [2.5,-6.026067,-6.814204],[83/30,-4.386449,-6.690632],
      [3,5,-3.358361]],t);
    mirror.uniforms.lightBoundary.value.x=THREE.MathUtils.lerp(boundary[0],lateBoundary[0],latePanel);
    mirror.uniforms.lightBoundary.value.y=THREE.MathUtils.lerp(boundary[1],lateBoundary[1],latePanel);
    mirror.uniforms.lightBoundary.value.w=THREE.MathUtils.lerp(boundary[3],1-smooth((t-3.1)/.13),latePanel);
    mirror.uniforms.latePanelColor.value=latePanel;
    mirror.uniforms.routeSide.value=side(path);
    backdrop.material.uniforms.routeSide.value=side(path);
    mirror.uniforms.openingCut.value=1-smooth((t-.70)/.40)+smooth((t-(timing[path].pulseEnd-.13))/.13);
    mirror.uniforms.farShade.value=smooth((t-(path==='yes'?158/30:161/30))/(1/30));
    backdrop.material.uniforms.flightDark.value=mirror.uniforms.farShade.value;
    // Shared world-space halo/core fitted to both opening views. The changing
    // floor intersection is inferred illumination, not an original lamp rig.
    const openingLight=1-smooth((floorClock-.80)/.20);
    const openingEdge=track(openingFloorEdge[path],t);
    mirror.uniforms.openingBoundary.value.set(
      THREE.MathUtils.lerp(-41,openingEdge[0],openingLight),openingEdge[1]*openingLight);
    const openingZ=track([[0,path==='yes'?3.3:4.4],[.4,path==='yes'?3.7:4.8],[.5,4.4],[.73,0],[.95,1]],floorClock)[0];
    const openingX=track([[0,path==='yes'?.16:0],[.4,0],[.5,-.4]],floorClock)[0];
    mirror.uniforms.openingLight.value=openingLight;
    // The opening reflection is diffuse; the later inlet shots retain clear
    // reflected turns. Filter the same scene along the deterministic timeline.
    mirror.uniforms.reflectionLod.value = Math.max(0,1.8+2.2*openingLight
      + Math.log2(floor.getRenderTarget().width/768));
    // Early source illumination is steady while the broader floor panel rises.
    mirror.uniforms.openingPoolStrength.value=THREE.MathUtils.lerp(path==='yes'?.60:.55,boundary[3],smooth((floorClock-.4)/.2));
    pool.position.set(sourceFloor[0]+side(path)*openingX*openingLight,4,sourceFloor[2]+1+(openingZ-1)*openingLight);
    mirror.uniforms.glow.value.set(pool.position.x, pool.position.z);
    mirror.uniforms.coilGlow.value.set(side(path)*TUBE.x,TUBE.z);
    mirror.uniforms.coilFloorLight.value = smooth((t-timing[path].pulseStart-.10)/.25);
    // A side lamp leaves the inlet face blue while lighting the far-facing
    // upper turns pink after the orbit. The position is a reconstruction
    // from these views; it stays in world space rather than following camera.
    coilLight.position.set(side(path)*(TUBE.x+18),11,TUBE.z+7);
    coilNeutral.position.copy(coilLight.position);
    coilNeutral.target.position.set(side(path)*TUBE.x,TUBE.y+TUBE.rise/2,TUBE.z);
    coilNeutral.target.updateMatrixWorld();
    coilPulse.position.set(side(path)*(TUBE.x-1.8),4.4,TUBE.z+7.96);
    coilPulse.target.position.set(side(path)*(TUBE.x-1),3.8,TUBE.z+5);
    coilPulse.target.updateMatrixWorld();
    coilBlue.position.set(side(path)*(TUBE.x+18),0,TUBE.z+8);
    coilBlue.target.position.set(side(path)*TUBE.x,3,TUBE.z);
    coilBlue.target.updateMatrixWorld();
    const finishMix = smooth((t - (timing[path].hit-.3)) / .3);
    pinFill.position.set(side(path)*8,3.5,4);
    pinFill.target.position.set(side(path)*3.5,.5,-.5);
    pinFill.target.updateMatrixWorld();
    pinFill.intensity=100*(1-finishMix);
    const backgroundFinish = smooth((t-(timing[path].hit-2/30))/(2/30));
    mirror.uniforms.finish.value = backgroundFinish;
    backdrop.material.uniforms.finish.value = backgroundFinish;
    // The lower pool is already visible while the word enters the film frame.
    // Its timing is independent of the lamps illuminating the rising letters.
    backdrop.material.uniforms.reveal.value = smooth((t - 6.03) / .30);
    const rise = revealRise(t,path);
    // The answer's broad lower/front lamp produces the observed letter
    // gradients. Its reveal follows the same world-space rise, not camera yaw.
    const reveal = smooth((t - 6.15) / .6);
    const answerLamp = outcome === 'yes'
      ? [-.734107,-.101153,4.104722] : [1.212373,-.492924,6.822341];
    finalLight.position.fromArray(add(add(add(f.center,
      mul(f.up,rise+THREE.MathUtils.lerp(5,answerLamp[1],reveal))),
      mul(f.normal,THREE.MathUtils.lerp(3,answerLamp[2],reveal))),
      mul(f.right,answerLamp[0]*reveal)));
    finalLight.intensity = (outcome==='yes'?145:360) * reveal * finishMix;
    const targetLampHeight=reached(t,timing[path].color)?3:4.530548;
    const targetLampDistance=reached(t,timing[path].color)?5:5.268488;
    targetLamp.position.fromArray(add(add(f.center,mul(f.up,targetLampHeight)),mul(f.normal,targetLampDistance)));
    targetLamp.target.position.fromArray(add(f.center,mul(f.up,targetLampHeight)));
    targetLamp.target.updateMatrixWorld();
    coilLight.intensity=0;
    coilNeutral.intensity=300*(1-finishMix);
    coilPulse.intensity=0;
    coilBlue.intensity=.5*smooth((t-1.8)/.3)*(1-finishMix);
    targetLamp.intensity=(reached(t,timing[path].color)?60:114.356012)*finishMix*(1-reveal);
    targetEdgeLamp.position.fromArray(add(f.center,mul(f.up,10)));
    targetEdgeLamp.target.position.fromArray(f.center);
    targetEdgeLamp.target.updateMatrixWorld();
    targetEdgeLamp.intensity=1.8*finishMix*(1-reveal)*(reached(t,timing[path].color)?0:1);
    // A wider neutral cone reaches the upper lateral rays. Their dark lower
    // faces come from the same fixed lamp, not a constant blue emission.
    targetLamp.angle=reached(t,timing[path].color)?.80:1.10;
    targetBlue.position.fromArray(add(add(f.center,mul(f.up,-2)),mul(f.normal,4.5)));
    targetBlue.target.position.fromArray(add(f.center,mul(f.up,-.759815)));
    targetBlue.target.updateMatrixWorld();
    targetBlue.intensity=28.591933*finishMix*(!reached(t,timing[path].color)?1:0);
    ambient.intensity = .14 - .130 * finishMix;
    key.position.fromArray(mix(mix([-5,18,-6],[-5,12,-12],smooth((t-1.2)/.6)), add(add(f.center, mul(f.up, rise + 4)), add(mul(f.normal, 10), mul(f.right, -4))), finishMix));
    key.target.position.fromArray(mix([0,0,0], add(f.center, mul(f.up, rise)), finishMix));
    key.target.updateMatrixWorld();
    key.intensity = 2.5 - 2.48 * finishMix;
    fill.intensity = 1.0 - .99 * finishMix;
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
    if (draw) render(lastTime, lastOutcome, lastScenario, lastView, lastOpaque, lastFreestyle);
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
      materials.add(guideMaterial);
      materials.forEach(m => m.dispose());
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
