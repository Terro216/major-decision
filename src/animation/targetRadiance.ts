// Neutral plate illumination reconstructed from unobstructed surface patches
// in both film branches. Coordinates belong to the fixed target
// frame, so the same lighting survives ray rotation and mirror rendering.
// This does not modify the mesh, its contact plane, the sphere or visibility.
export const targetRadianceGLSL = `
  vec3 targetLight(vec3 p, vec3 n) {
    vec3 incident = vec3(.335337119,.104461290,.495237573)
      + p.y*vec3(.442163788,.081434296,.065925417)
      + p.y*p.y*vec3(-.129833723,-.038381667,-.056390205)
      + p.x*p.x*vec3(-.258144846,-.058388442,-.070940103)
      + p.y*p.y*p.y*vec3(-.283312310,-.056593934,-.003392855)
      + p.y*p.x*p.x*vec3(-.276048467,-.077220116,-.016747323);
    incident = clamp(incident,vec3(.002),vec3(1.));
    // Recover incidence relative to a flat face at this same point. The
    // rounded profile still responds to both fixed lamps as real geometry.
    vec3 upper = vec3(0.,4.530548,5.268488)-p*1.9;
    vec3 blue = vec3(0.,-2.,4.5)-p*1.9;
    float warm = max(.04,dot(n,upper))/upper.z;
    float cool = max(.04,dot(n,blue))/blue.z;
    vec3 pink = min(incident,incident.r*vec3(1.,.30,1.21));
    return pink*warm+(incident-pink)*cool;
  }
`;
