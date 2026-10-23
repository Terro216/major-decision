import * as THREE from 'three';
import { BALL_RADIANCE_TERMS, ballRadianceGLSL } from './ballRadianceBasis';
import { targetRadianceGLSL } from './targetRadiance';

export function ballSurface(texture: THREE.Texture) {
  const material = new THREE.MeshPhongMaterial({ map: texture, emissiveMap: texture, specular: '#291a0b', shininess: 6 });
  const coefficients = { value: Array.from({length:BALL_RADIANCE_TERMS}, () => new THREE.Vector3()) };
  const amount = { value: 0 };
  material.userData.radiance = coefficients;
  material.userData.radianceAmount = amount;
  material.onBeforeCompile = shader => {
    shader.uniforms.ballRadiance = coefficients;
    shader.uniforms.ballRadianceAmount = amount;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 ballRadiance[${BALL_RADIANCE_TERMS}]; uniform float ballRadianceAmount;\n${ballRadianceGLSL}`)
      .replace('#include <opaque_fragment>', `
        vec3 n = inverseTransformDirection(normal, viewMatrix);
        vec3 fitted = ballLight(n);
        // Preserve the orange albedo at the fit's dark/occluded boundary.
        // Independent channel fits must not invent cyan zero-crossing bands.
        fitted = max(fitted,vec3(.012,.004,.004));
        fitted.r = max(fitted.r,max(fitted.g*.97,fitted.b*1.18));
        float grain = clamp(diffuseColor.r/.74,.85,1.15);
        outgoingLight = mix(outgoingLight,clamp(fitted,vec3(0.),vec3(1.))*grain,ballRadianceAmount);
        #include <opaque_fragment>
      `);
  };
  material.customProgramCacheKey = () => 'major-decision-ball-radiance-v3';
  return material;
}

// Surface colour only: the plate, rings and contact plane stay in mechanism.ts.
// The film leaves a violet centre inside the coloured outer disc in BOTH endings.
export function starSurface(violetCentre = true) {
  const material = new THREE.MeshPhongMaterial({ color: '#b660d0', emissive: '#b660d0', emissiveIntensity: .025, specular: '#211927', shininess: 55 });
  const center = new THREE.Color('#b56ecf');
  material.userData.centerColor = center;
  const centerAmount = { value: violetCentre ? 1 : 0 };
  const plateFill = { value: 0 };
  const rayCool = { value: 0 };
  const flash = { value: 0 };
  const lightFrame = { value: new THREE.Matrix4() };
  material.userData.lightFrame = lightFrame;
  material.userData.plateFill = plateFill;
  material.userData.rayCool = rayCool;
  material.userData.flash = flash;
  material.userData.centerAmount = centerAmount;
  material.onBeforeCompile = shader => {
    shader.uniforms.starCenter = { value: center };
    shader.uniforms.starCenterAmount = centerAmount;
    shader.uniforms.starPlateFill = plateFill;
    shader.uniforms.starRayCool = rayCool;
    shader.uniforms.starFlash = flash;
    shader.uniforms.starFlashColor = { value: new THREE.Color('#446dcf') };
    shader.uniforms.starLightFrame = lightFrame;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 starXY; varying float starFront; varying vec3 starLightPosition; varying vec3 starLightNormal; uniform mat4 starLightFrame;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nstarXY = position.xy; starFront = max(0.,normal.z); starLightPosition = (starLightFrame * modelMatrix * vec4(position,1.)).xyz; starLightNormal = normalize(mat3(starLightFrame * modelMatrix)*normal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 starXY; varying float starFront; varying vec3 starLightPosition; varying vec3 starLightNormal; uniform vec3 starCenter; uniform float starCenterAmount; uniform float starPlateFill; uniform float starRayCool; uniform float starFlash; uniform vec3 starFlashColor;\n${targetRadianceGLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float centreMask = starCenterAmount * (1. - smoothstep(.53, .55, length(starXY)));
        diffuseColor.rgb = mix(diffuseColor.rgb, starCenter, centreMask);
        diffuseColor.rgb = mix(diffuseColor.rgb,starFlashColor,
          starFlash*(1.-centreMask)*(1.-smoothstep(1.12,1.15,length(starXY))));
        // The distant reference plate is pink while its separate rays are
        // blue-violet. Keep that material contrast on the same reflected mesh.
        diffuseColor.rgb *= mix(vec3(1.),vec3(.263955,.928924,2.159377),starRayCool*smoothstep(1.4,1.6,length(starXY)));
        vec2 cell = floor(starXY * 520.);
        float grain = fract(sin(dot(cell,vec2(12.9898,78.233))) * 43758.5453);
        diffuseColor.rgb *= .94 + .12 * grain;
      `)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance = mix(totalEmissiveRadiance,starCenter*.45,starCenterAmount*(1.-smoothstep(.53,.55,length(starXY))));
        totalEmissiveRadiance = mix(totalEmissiveRadiance,vec3(.0015,.0015,.018),starRayCool*smoothstep(1.4,1.6,length(starXY)));
        totalEmissiveRadiance += diffuseColor.rgb * starPlateFill * mix(vec3(1.),vec3(1.22,1.04,.96),starRayCool)
          * mix(.16,1.,pow(starFront,1.5)) * (1.-smoothstep(1.12,1.15,length(starXY)));
      `)
      .replace('#include <opaque_fragment>', `
        // A smooth field extends over the rounded front without introducing
        // a separate bright contour. The back retains ordinary lighting.
        float plateLight = starRayCool * (1.-starFlash)
          * (1.-smoothstep(1.12,1.15,length(starXY)))
          * step(-.01,starLightNormal.z);
        vec3 measuredLight = targetLight(starLightPosition,normalize(starLightNormal));
        vec3 plateSpecular = reflectedLight.directSpecular+reflectedLight.indirectSpecular;
        outgoingLight = mix(outgoingLight,measuredLight*(.99+.02*grain)+plateSpecular,plateLight);
        #include <opaque_fragment>
      `);
  };
  if (!violetCentre) {
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      // The source plate and ring are glossy; the separate ray faces are matte.
      shader.fragmentShader = shader.fragmentShader.replace('#include <specularmap_fragment>',
        '#include <specularmap_fragment>\nspecularStrength *= 1. - .97 * smoothstep(1.4,1.6,length(starXY));');
      // The source rays have less red than its disc in both opening clips.
      // This is a surface tint on the real rays, including their reflection.
      const sourceTint = 'mix(vec3(1.),vec3(.75,1.10,.96),smoothstep(1.4,1.6,length(starXY)))';
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= ${sourceTint};`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance *= ${sourceTint};`);
    };
  }
  material.customProgramCacheKey = () => `major-decision-violet-centre-v16-${violetCentre?'target':'source'}`;
  return material;
}

export function starEdgeSurface() {
  const material = new THREE.MeshPhongMaterial({color:'#763d8b',emissive:'#763d8b',emissiveIntensity:.06,specular:'#747494',shininess:45});
  // The dark painted thickness and polished front bevel share the same mesh.
  // Object-space normals identify those surfaces independently of the camera.
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float starEdgeNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nstarEdgeNormal = abs(normal.z);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float starEdgeNormal;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat bevelFace = smoothstep(.08,.55,starEdgeNormal); diffuseColor.rgb *= mix(.16,1.,bevelFace);')
      .replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\nspecularStrength *= mix(.08,1.,bevelFace);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(.25,1.,bevelFace);');
  };
  material.customProgramCacheKey = () => 'major-decision-star-edge-v1';
  return material;
}

// Subtle object-space grain, never random per frame or tied to screen pixels.
// It preserves backward-seek determinism and does not bake film imagery in.
export function answerSurface(color: string, edge = false) {
  const material = new THREE.MeshPhongMaterial({
    color, specular: edge ? '#383838' : '#242424', shininess: edge ? 52 : 36,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 surfacePoint; varying float answerEdgeNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nsurfacePoint = position; answerEdgeNormal = abs(normal.z);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 surfacePoint; varying float answerEdgeNormal;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 cell = floor(surfacePoint * 145.);
        float grain = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        diffuseColor.rgb *= .96 + .08 * grain;
      `);
    if (edge) {
      // Painted extrusion sides stay dark; the real sloped bevel catches
      // light. This distinction follows the mesh normal in every view.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat answerBevel = smoothstep(.08,.65,answerEdgeNormal); diffuseColor.rgb *= mix(.16,1.,answerBevel);')
        .replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\nspecularStrength *= mix(.06,1.,answerBevel);');
    }
  };
  material.customProgramCacheKey = () => `major-decision-answer-grain-v2-${edge?'edge':'front'}`;
  return material;
}

// View-angle attenuation applies to every layer of the hollow wall. A near
// sphere crosses one skin; distant geometry crosses both skins of each turn.
// No object IDs, camera times or visibility masks enter this material.
export function tubeSurface() {
  const material = new THREE.MeshPhongMaterial({ color: '#e294ee', emissive: '#07010e', specular: '#564e66', shininess: 130, transparent: true, opacity: .70, side: THREE.FrontSide, depthWrite: false });
  // During the pulse each skin absorbs the other colour channels. Scalar
  // alpha alone passed the blue floor through red glass as a purple stripe.
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = THREE.ConstantColorFactor;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  const neutralTint = { value: 1 };
  const pulseScatter = { value: new THREE.Vector4() };
  material.userData.neutralTint = neutralTint;
  material.userData.pulseScatter = pulseScatter;
  material.onBeforeCompile = shader => {
    shader.uniforms.tubeNeutralTint = neutralTint;
    shader.uniforms.tubePulseScatter = pulseScatter;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 tubeWorldNormal; varying vec3 tubeWorldPosition; attribute float wallThickness; attribute float innerSurface; varying float tubeWallThickness; varying float tubeInterior;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntubeWorldNormal = normalize(mat3(modelMatrix)*normal); tubeWorldPosition = (modelMatrix*vec4(position,1.)).xyz; tubeWallThickness = wallThickness; tubeInterior = innerSurface;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 tubeWorldNormal; varying vec3 tubeWorldPosition; varying float tubeWallThickness; varying float tubeInterior; uniform float tubeNeutralTint; uniform vec4 tubePulseScatter;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Reconstruct the blue front and magenta upper surface observed in
        // both neutral coils. This world-space tint never changes the wall,
        // opacity or depth; coloured pulses use their own unmodified hue.
        float upperSurface = smoothstep(.0,.35,normalize(tubeWorldNormal).y);
        vec3 glassTint = mix(vec3(.18,.70,1.10),vec3(1.,.55,1.),upperSurface);
        glassTint = mix(glassTint, vec3(.18,.60,.85), tubeInterior);
        diffuseColor.rgb *= mix(vec3(1.),glassTint,tubeNeutralTint);
      `).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= mix(vec3(1.),glassTint,tubeNeutralTint);
        // Low blue light scattered on the real inward wall keeps the open
        // collar legible from the opposite view. It does not fill the bore.
        float collarScatter = clamp((tubeWallThickness-.08)/.30,0.,1.);
        // Broad diffuse scattering fills the coloured turns without adding
        // mirrorlike specular streaks. One fixed world-space field per colour
        // is inferred from visible outer-wall points in four film poses.
        vec3 scatterDelta = tubePulseScatter.xyz-tubeWorldPosition;
        float scatterDistance = max(length(scatterDelta),.01);
        float scatterFacing = max(0.,.35+.65*dot(normalize(tubeWorldNormal),scatterDelta/scatterDistance));
        float scatteredLight = tubePulseScatter.w*scatterFacing/(scatterDistance*scatterDistance+12.25);
        totalEmissiveRadiance += diffuseColor.rgb*scatteredLight*(1.-tubeNeutralTint)
          *mix(1.,.30,tubeInterior)*mix(1.,.35,collarScatter);
        totalEmissiveRadiance += tubeInterior * mix(diffuseColor.rgb*.28*collarScatter,vec3(.025,.030,.16),tubeNeutralTint);
        // The coloured film pulse scatters brightly in the thicker collars.
        // This follows real wall thickness, not the screen or camera.
        totalEmissiveRadiance += diffuseColor.rgb * (1.-tubeNeutralTint) * 1.25 * collarScatter;
      `).replace('#include <opaque_fragment>', `
      float grazing = 1. - abs(dot(normal, normalize(vViewPosition)));
      diffuseColor.a = mix(opacity, min(1., opacity + .23 * grazing * grazing), tubeNeutralTint);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => 'major-decision-glass-absorption-v15';
  return material;
}

export function pinSurface() {
  const material = new THREE.MeshPhongMaterial({ color: '#65aaee', emissive: '#254c8e', specular: '#528fc0', shininess: 80 });
  const colored = { value: 0 };
  const sourceLight = { value: new THREE.Vector3() };
  material.userData.colored = colored;
  material.userData.sourceLight = sourceLight;
  material.onBeforeCompile = shader => {
    shader.uniforms.pinColored = colored;
    shader.uniforms.pinSourceLight = sourceLight;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float pinY; varying vec3 pinAxis; varying vec3 pinWorldPoint; varying vec3 pinWorldNormal;').replace('#include <begin_vertex>', '#include <begin_vertex>\npinY = position.y; pinAxis = normalize(normalMatrix * vec3(0.,1.,0.)); pinWorldPoint = (modelMatrix * vec4(position,1.)).xyz; pinWorldNormal = normalize(mat3(modelMatrix)*normal);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float pinY; varying vec3 pinAxis; varying vec3 pinWorldPoint; varying vec3 pinWorldNormal; uniform vec3 pinSourceLight; uniform float pinColored;').replace('#include <color_fragment>', `#include <color_fragment>
      // Neutral stems stay blue in the oblique views. The separate opening
      // transmission below keeps the early rows cyan; colored pins retain
      // their own albedo and the continuous band/edge distribution.
      vec3 pinTint = mix(vec3(.60,.65,1.),vec3(1.),pinColored);
      diffuseColor.rgb *= pinTint;
      float band = smoothstep(.16,.48,abs(pinY));
      float cap = smoothstep(.81,.845,pinY);
      vec3 viewLateral = normalize(vViewPosition-pinAxis*dot(vViewPosition,pinAxis));
      float sideWall = 1.-abs(dot(normalize(vNormal),pinAxis));
      float edge = pow(1. - abs(dot(normalize(vNormal), viewLateral)), 1.4) * sideWall;
      // The film has a dark middle band inside continuous bright edges.
      // Light the upper/lower body without washing that band out or clipping
      // the caps. The same material is used in the real floor reflection.
      float core = mix(.82,.45,pinColored) * mix(mix(.18,.30,pinColored),1.,band);
      diffuseColor.rgb *= mix(mix(core,.90,edge),mix(.70,.40,pinColored),cap);
    `).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance *= pinTint;
      float rim = pow(1. - abs(dot(normal, viewLateral)), 1.4) * sideWall;
      totalEmissiveRadiance *= mix(mix(.18,.55,pinColored),1.,max(band,edge));
      totalEmissiveRadiance += diffuseColor.rgb * rim * mix(2.5,1.,pinColored);
      // Cyan stems transmit the fixed opening pool through their side wall.
      // Distance and the real surface normal keep the later rows dark; caps
      // retain their ordinary lighting. No camera or timeline mask is used.
      vec3 throughLight = pinSourceLight-pinWorldPoint;
      // Forward scattering keeps the opening rows cyan while the oblique
      // late views retain their dark blue band and continuous bright edges.
      float transmission = pow(max(0.,-dot(normalize(pinWorldNormal),normalize(throughLight))),2.);
      totalEmissiveRadiance += vec3(.0794,.7399,.4851) * 1.12 * exp(-dot(throughLight,throughLight)/120.) * transmission * sideWall * (1.-pinColored);
      // The colored glass keeps a broad lit body, with the darker band and
      // bright side edges still carried by the same cylindrical surface.
      totalEmissiveRadiance += diffuse * vec3(.30,.08,.08) * mix(.12,1.,band) * sideWall * pinColored;
    `);
  };
  material.customProgramCacheKey = () => 'major-decision-pin-glass-v16';
  return material;
}
