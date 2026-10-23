// Real spherical harmonics through degree five in Cartesian form.
// Generated with the same normalization used by the offline material fit.
export const BALL_RADIANCE_TERMS = 36;
export const ballRadianceGLSL = `
vec3 ballLight(vec3 n) {
float c0=1.,s0=0.;
float c1=c0*n.x-s0*n.y,s1=s0*n.x+c0*n.y;
float c2=c1*n.x-s1*n.y,s2=s1*n.x+c1*n.y;
float c3=c2*n.x-s2*n.y,s3=s2*n.x+c2*n.y;
float c4=c3*n.x-s3*n.y,s4=s3*n.x+c3*n.y;
float c5=c4*n.x-s4*n.y,s5=s4*n.x+c4*n.y;
float z0=1.,z1=n.z,z2=n.z*n.z,z3=z2*n.z,z4=z3*n.z,z5=z4*n.z; vec3 result=vec3(0.);
result+=ballRadiance[0]*((0.2820947918)*z0)*c0;
result+=ballRadiance[1]*((0.4886025119)*z1)*c0;
result+=ballRadiance[2]*((-0.4886025119)*z0)*c1;
result+=ballRadiance[3]*((-0.4886025119)*z0)*s1;
result+=ballRadiance[4]*((-0.3153915653)*z0+(0.9461746958)*z2)*c0;
result+=ballRadiance[5]*((-1.0925484306)*z1)*c1;
result+=ballRadiance[6]*((-1.0925484306)*z1)*s1;
result+=ballRadiance[7]*((0.5462742153)*z0)*c2;
result+=ballRadiance[8]*((0.5462742153)*z0)*s2;
result+=ballRadiance[9]*((-1.1195289978)*z1+(1.8658816630)*z3)*c0;
result+=ballRadiance[10]*((0.4570457995)*z0+(-2.2852289973)*z2)*c1;
result+=ballRadiance[11]*((0.4570457995)*z0+(-2.2852289973)*z2)*s1;
result+=ballRadiance[12]*((1.4453057213)*z1)*c2;
result+=ballRadiance[13]*((1.4453057213)*z1)*s2;
result+=ballRadiance[14]*((-0.5900435899)*z0)*c3;
result+=ballRadiance[15]*((-0.5900435899)*z0)*s3;
result+=ballRadiance[16]*((0.3173566407)*z0+(-3.1735664075)*z2+(3.7024941420)*z4)*c0;
result+=ballRadiance[17]*((2.0071396307)*z1+(-4.6833258049)*z3)*c1;
result+=ballRadiance[18]*((2.0071396307)*z1+(-4.6833258049)*z3)*s1;
result+=ballRadiance[19]*((-0.4730873479)*z0+(3.3116114352)*z2)*c2;
result+=ballRadiance[20]*((-0.4730873479)*z0+(3.3116114352)*z2)*s2;
result+=ballRadiance[21]*((-1.7701307698)*z1)*c3;
result+=ballRadiance[22]*((-1.7701307698)*z1)*s3;
result+=ballRadiance[23]*((0.6258357354)*z0)*c4;
result+=ballRadiance[24]*((0.6258357354)*z0)*s4;
result+=ballRadiance[25]*((1.7542548368)*z1+(-8.1865225717)*z3+(7.3678703146)*z5)*c0;
result+=ballRadiance[26]*((-0.4529466512)*z0+(6.3412531167)*z2+(-9.5118796751)*z4)*c1;
result+=ballRadiance[27]*((-0.4529466512)*z0+(6.3412531167)*z2+(-9.5118796751)*z4)*s1;
result+=ballRadiance[28]*((-2.3967683925)*z1+(7.1903051775)*z3)*c2;
result+=ballRadiance[29]*((-2.3967683925)*z1+(7.1903051775)*z3)*s2;
result+=ballRadiance[30]*((0.4892382994)*z0+(-4.4031446949)*z2)*c3;
result+=ballRadiance[31]*((0.4892382994)*z0+(-4.4031446949)*z2)*s3;
result+=ballRadiance[32]*((2.0756623149)*z1)*c4;
result+=ballRadiance[33]*((2.0756623149)*z1)*s4;
result+=ballRadiance[34]*((-0.6563820568)*z0)*c5;
result+=ballRadiance[35]*((-0.6563820568)*z0)*s5;
return result; }
`;
