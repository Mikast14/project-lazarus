import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { FLIGHT_S, PLANETS, PROGRESS, uiZoom, type PlanetId } from './data'

const HOME = new THREE.Vector3(0, 1.6, 17)
const still = matchMedia('(prefers-reduced-motion: reduce)').matches

const NOISE = /* glsl */ `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for(int i = 0; i < 4; i++){ v += a*noise(p); p *= 2.03; a *= .5; } return v; }
`

// Gargantua: every pixel is a light ray bent around a Schwarzschild black hole (horizon radius 1).
// The disk is flat; the arcs above and below the shadow come from the bending alone.
const HOLE_FRAG = /* glsl */ `
uniform float uTime; uniform mat4 uInvProj; uniform mat4 uCamWorld;
varying vec2 vUv; varying vec3 vCentre;   // vCentre: where the hole sits on screen (xy), and 1 if it is in front of the camera (z)
const float RIN = 2.6, ROUT = 9.;
${NOISE}
float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
// Stars are point sources: lensing moves and brightens them but cannot smear them.
// dx, dy = how far one pixel moves across the (lensed) sky, used to draw each star as a round dot.
vec3 stars(vec3 d, vec3 dx, vec3 dy, float crowd){
  vec3 c = vec3(0.);
  float a = dot(dx, dx), b = dot(dx, dy), e = dot(dy, dy), det = a*e - b*b;
  if(det > 1e-20 && a + e < 4e-4){                      // skip the torn pixels at the shadow and disk edges
    for(int l = 0; l < 3; l++){
      float sc = 60. + float(l)*50.;
      vec3 p = d*sc, i = floor(p), f = (p - i - .5)/sc;
      float h = hash3(i + float(l)*17.), m = pow(fract(h*113.), 5.);                // few bright, many faint
      vec2 px = vec2(e*dot(dx, f) - b*dot(dy, f), a*dot(dy, f) - b*dot(dx, f))/det;  // offset from the star, in pixels
      float R = .75 + 1.1*m;
      float s = exp(-dot(px, px)/(R*R)) + .12*m*exp(-length(px)/(3.*R));            // core plus a little glare
      s *= step(.93, h) * step(length(f - dx*px.x - dy*px.y)*sc, .3);
      float k = fract(h*57.);                                                       // blue-white to orange
      c += s*(.12 + 2.2*m)*smoothstep(5., 1.5, crowd)*mix(mix(vec3(.62, .75, 1.), vec3(1.), smoothstep(0., .45, k)), vec3(1., .72, .45), smoothstep(.6, 1., k));
    }
  }
  float band = exp(-pow(d.y*2.5 + d.x*.8 + fbm(d.xz*2.) - .5, 2.)*6.);                // faint galactic band
  return c + band*vec3(.010, .009, .013)*fbm(d.zx*9. + d.y*4.) + vec3(.003, .004, .011)*fbm(d.xy*3. + d.z);
}
float strands(vec2 p){ return pow(1. - abs(2.*fbm(p) - 1.), 3.); }   // ridged noise: thin bright strands, not soft bands
float diskLayer(vec2 xz, float cr, float ph, float sheet){
  float a = (ph - .5)*30./pow(cr, 1.5) + uTime*.1;    // inner gas orbits faster
  float s = sin(a), c = cos(a); vec2 q = mat2(c, -s, s, c)*xz;
  q += sheet*4.3;
  float mid = strands(vec2(cr*9., 3.) + q*.6);
  if(sheet != 0.) return .3*fbm(q*1.3) + .5*mid + .12;   // outer sheets only add depth, so they get the cheap version
  return .2*fbm(q*1.3) + .32*mid + .3*strands(vec2(cr*28., 7.) + q*1.6)
       + .16*strands(vec2(cr*70., 2.) + q*3.)          // hair-fine strands, visible when the camera passes close
       + .5*pow(noise(q*.7 + 9.), 6.);                 // a few hot clumps riding the flow
}
vec4 disk(vec3 c, vec3 d, float sheet){
  float cr = length(c.xz), u = (cr - RIN)/(ROUT - RIN);
  if(cr < 1.6 || u > 1.) return vec4(0.);
  float n;
  if(sheet != 0.) n = diskLayer(c.xz, cr, .5, sheet);   // turns rigidly, no shear
  else {
    // two phase-shifted layers cross-faded, so the shear never winds up into mush
    float T = uTime*.07, f = fract(T);
    n = mix(diskLayer(c.xz, cr, fract(T + .5), 0.), diskLayer(c.xz, cr, f, 0.), 1. - abs(2.*f - 1.));
  }
  n = smoothstep(.3, .78, n);
  float t = pow(RIN/max(cr, RIN), .75);                 // gas is hottest at the inner edge
  // colour follows temperature: deep red at the cool rim, through gold and white, to blue-white where it is hottest
  vec3 col = mix(vec3(.55, .12, .03), vec3(1., .66, .28), smoothstep(.38, .68, t));
  col = mix(col, vec3(1., .94, .84), smoothstep(.68, .95, t));
  col = mix(col, vec3(.86, .92, 1.), smoothstep(.9, 1., t)*.6);
  // two loose spiral arms of denser gas, turning with the flow
  float arm = .5 + .5*sin(2.*(atan(c.z, c.x) - uTime*.1) + 7.*log(cr));
  float I = pow(t, 4.)*3.2 * (.45 + 1.35*n) * (.7 + .3*noise(vec2(cr*3.5, 1.))) * (.78 + .44*arm)
          * pow(1. - 1./cr, 2.)                         // light climbing out of the well is dimmed
          * pow(smoothstep(1.6, RIN, cr), 3.)           // inside the last stable orbit the gas thins out as it falls in
          * smoothstep(1., .4, u + (n - .5)*.4);        // ragged outer edge
  // relativistic beaming: the side rotating toward us is brighter and bluer
  float dop = 1./(1. + .6*sqrt(.5/cr)*dot(normalize(vec3(-c.z, 0., c.x)), normalize(d)));
  I *= dop*dop*dop;
  col *= mix(vec3(1.12, .9, .72), vec3(.92, 1., 1.18), smoothstep(.75, 1.35, dop));
  return vec4(col*I, clamp(I*1.2, 0., 1.));
}
void main(){
  vec4 v = uInvProj * vec4(vUv*2. - 1., 1., 1.);
  vec3 d = normalize((uCamWorld * vec4(v.xyz/v.w, 0.)).xyz), p = cameraPosition, d0 = d;
  vec3 hv = cross(p, d); float h2 = dot(hv, hv);
  vec3 col = vec3(0.); float trans = 1., nearest = 100.; bool captured = false;
  for(int i = 0; i < STEPS; i++){
    float r = length(p);
    nearest = min(nearest, r);
    if(r < 1.){ captured = true; break; }
    if(r > 30. && dot(p, d) > 0.) break;
    float dt = clamp(.12*(r - .8), .02, 1.5);           // small steps near the hole resolve the photon ring
    d += -1.5*h2*p/pow(r, 5.) * dt;
    vec3 np = p + d*dt;
    // hot haze above and below the disk, so it has thickness
    float rx = length(p.xz);
    col += trans*vec3(1., .5, .18)*.011*dt*exp(-abs(p.y)*2.5)*smoothstep(ROUT*1.15, RIN, rx)*smoothstep(1.4, RIN, rx);
    // the disk is three stacked sheets that flare outward, not one flat plane, so it shows depth as the view moves
    for(int k = -1; k <= 1; k++){
      float fa = p.y - float(k)*.028*length(p.xz), fb = np.y - float(k)*.028*length(np.xz);
      if(fa*fb < 0.){
        vec4 dc = disk(mix(p, np, fa/(fa - fb)), d, float(k));
        dc.a *= k == 0 ? .92 : .28;   // the middle sheet carries the detail, the outer two only add depth
        col += trans*dc.rgb*dc.a; trans *= 1. - dc.a;
      }
    }
    if(trans < .02) break;
    p = np;
  }
  vec3 sky = normalize(d), sx = dFdx(sky), sy = dFdy(sky);
  // how much sky is squeezed into this pixel compared with no lensing; crowded regions fade out
  float crowd = (dot(sx, sx) + dot(sy, sy))/(dot(dFdx(d0), dFdx(d0)) + dot(dFdy(d0), dFdy(d0)));
  if(!captured) col += trans*stars(sky, sx, sy, crowd);
  // photon ring: light that skimmed the photon sphere (1.5 horizon radii) circled the hole before escaping,
  // which piles up into a thin bright ring at the edge of the shadow
  if(!captured) col += vec3(1., .84, .58)*.45*exp(-abs(nearest - 1.5)*38.);
  // what a camera adds: a soft bloom around the hole and a faint horizontal lens streak
  vec2 off = vUv*2. - 1. - vCentre.xy; off.x *= dFdy(vUv.y)/dFdx(vUv.x);
  col += vCentre.z*(captured ? .12 : 1.)*(vec3(1., .62, .3)*.045*exp(-dot(off, off)*5.) + vec3(1., .78, .55)*.04*exp(-abs(off.y)*38.)*exp(-abs(off.x)*2.2));   // the shadow itself stays black
  col = clamp(col*(2.51*col + .03)/(col*(2.43*col + .59) + .14), 0., 1.);   // filmic tone curve
  gl_FragColor = vec4(pow(col, vec3(.4545)), 1.);
}`

// 3D noise shared by the planets and Mann's cloud shell.
const NOISE3 = /* glsl */ `
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
const mat3 TURN = mat3(0., .8, .6, -.8, .36, -.48, -.6, -.48, .64);   // rotates each octave so the noise grid never lines up
float fbm3(vec3 p){ float v = 0., a = .5; for(int i = 0; i < 5; i++){ v += a*n3(p); p = TURN*p*2.02 + 11.3; a *= .5; } return v; }
float ridge(vec3 p){ return 1. - abs(2.*fbm3(p) - 1.); }
`

// Mann's frozen clouds: a second shell floating above the surface, in hard-edged slabs. It turns at
// its own speed, so the ground slides underneath and the planet reads as having no real surface.
const SHELL_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vP; varying vec3 vL; varying vec3 vV;
${NOISE3}
void main(){
  vec3 s = normalize(vP), L = normalize(vL);
  float d = fbm3(s*3.2 + fbm3(s*1.6 + 4.)*1.2);
  float slab = smoothstep(.5, .56, d);                                   // hard edges: this cloud is solid
  vec3 px = dFdx(s), py = dFdy(s), r1 = cross(py, s), r2 = cross(s, px);
  float det = dot(px, r1);
  vec3 n = normalize(s - .35*(abs(det) > 1e-12 ? (dFdx(d)*r1 + dFdy(d)*r2)/det : vec3(0.)));
  vec3 col = mix(vec3(.6, .67, .76), vec3(.97, .98, 1.), smoothstep(.52, .78, d))*(vec3(1.45, 1.3, 1.15)*max(dot(n, L), 0.) + .07);
  gl_FragColor = vec4(pow(1. - exp(-col*1.3), vec3(.4545)), slab*.94);
}`

// Planets are shaded in object space so the surface turns with the planet.
// KIND 0 = Miller (ocean), 1 = Mann (ice), 2 = Edmunds (rock, scrub, small seas).
const PLANET_VERT = /* glsl */ `
varying vec3 vP; varying vec3 vL; varying vec3 vV;
void main(){
  vec4 w = modelMatrix*vec4(position, 1.);
  mat3 inv = transpose(mat3(modelMatrix));
  vP = position; vL = inv*(-w.xyz); vV = inv*(cameraPosition - w.xyz);   // light comes from Gargantua
  gl_Position = projectionMatrix*viewMatrix*w;
}`

const PLANET_FRAG = /* glsl */ `
uniform vec3 uA; uniform float uHover; uniform float uTime;
uniform vec3 uBeacon; uniform vec3 uBeaconCol;   // where the station sits on the surface, and its light
varying vec3 vP; varying vec3 vL; varying vec3 vV;
${NOISE3}
// Miller's great wave: two ridges on opposite sides of the globe, sweeping slowly round it.
float wave(vec3 s){
  float f = dot(s, vec3(cos(uTime*.035), 0., sin(uTime*.035))) + (fbm3(s*2.5 + 6.) - .5)*.22;   // a ragged front, not a ruled line
  return exp(-f*f*420.)*smoothstep(.92, .45, abs(s.y));                                         // dies away toward the poles
}

// Turn the point p around axis c, most strongly near c: winds a cloud pattern into a storm.
vec3 twist(vec3 p, vec3 c, float amount){
  float d = distance(p, c), a = amount*exp(-d*d*18.), sn = sin(a), cs = cos(a);
  return p*cs + cross(c, p)*sn + c*dot(c, p)*(1. - cs);
}
float cloudField(vec3 s, float fine){
#if KIND != 1
  s = twist(s, normalize(vec3(.6, .5, .62)), 2.6); s = twist(s, normalize(vec3(-.7, -.35, .6)), -2.2);   // two great storm systems
#endif
  return fbm3(s*vec3(3., 6., 3.) + fbm3(s*2.5 + uTime*.01)*1.3 + vec3(uTime*.008, 0., 0.))
       + (fine > 0. ? .12*(fbm3(s*22.) - .5) : 0.);                    // fine broken edges
}

float height(vec3 s){
#if KIND == 0
  return fbm3(s*vec3(2., 7., 2.) + fbm3(s*2.)*1.5) + .6*wave(s);    // long swells wrapping the globe, and the great wave
#elif KIND == 1
  return fbm3(s*1.8) - .3*pow(ridge(s*2.5 + 3.), 6.);                  // ice sheet with fracture lines
#else
  return fbm3(s*3. + fbm3(s*1.5)*1.2) + .12*pow(ridge(s*9.), 3.);    // continents and mountain ridges
#endif
}

void main(){
  vec3 s = normalize(vP), L = normalize(vL), V = normalize(vV);
  float h = height(s);
  // slope of the terrain, taken from how h changes between neighbouring pixels (no extra height samples)
  vec3 px = dFdx(s), py = dFdy(s), r1 = cross(py, s), r2 = cross(s, px);
  float det = dot(px, r1);
  vec3 g = abs(det) > 1e-12 ? (dFdx(h)*r1 + dFdy(h)*r2)/det : vec3(0.);
  vec3 alb; float spec; float bump; float cover;
#if KIND == 0
  alb = mix(vec3(.01, .05, .18), vec3(.07, .28, .6), smoothstep(.3, .75, h));
  alb = mix(alb, vec3(.08, .42, .5), smoothstep(.5, .7, fbm3(s*5. + 2.))*.7);                  // shallow turquoise shelves
  alb = mix(alb, vec3(.8, .9, .97), pow(ridge(s*vec3(3., 10., 3.) + fbm3(s*2.)*2.), 14.)*.3);   // the great wave fronts
  alb = mix(alb, vec3(.75, .85, .95), smoothstep(.70, .80, h));                                // foam on the crests
  alb *= .85 + .3*fbm3(s*24.);                                                                 // fine chop
  alb = mix(alb, vec3(.86, .93, .98), wave(s)*.8);                                             // the great wave's white crest
  spec = .9; bump = .08; cover = .52;
#elif KIND == 1
  alb = mix(vec3(.36, .42, .5), vec3(.93, .96, 1.), smoothstep(.2, .65, h));
  alb = mix(alb, vec3(.2, .34, .52), pow(ridge(s*2.5 + 3.), 6.)*.7);      // blue ice down in the fractures
  alb *= .9 + .1*smoothstep(0., .2, fract(h*14.));                        // layered strata of frozen cloud
  float bands = max(pow(ridge(s*vec3(1.2, 5., 1.2) + 4.), 20.), pow(ridge(s.zxy*vec3(1.2, 5., 1.2) + 9.), 20.));
  alb = mix(alb, vec3(.5, .47, .45), bands*.3);                           // long grey fracture bands crossing the ice
  alb *= .88 + .24*fbm3(s*30.);                                           // wind-scoured grain
  spec = .3; bump = .07; cover = .50;
#else
  float wet = fbm3(s*7. + 5.), lat = abs(s.y);
  alb = mix(vec3(.12, .3, .11), vec3(.34, .52, .22), wet);                  // grassland, patchy
  alb = mix(vec3(.55, .45, .27), alb, smoothstep(.36, .52, wet + lat*.25)); // dry belts turn to desert
  alb = mix(alb, vec3(.33, .31, .24), smoothstep(.5, .74, lat));            // tundra toward the poles
  alb = mix(alb, vec3(.05, .16, .07), smoothstep(.5, .68, fbm3(s*14.)));    // dark forest
  alb = mix(alb, vec3(.44, .41, .27), smoothstep(.62, .82, h));             // bare highlands
  alb = mix(alb, vec3(.03, .12, .16), pow(ridge(s*6. + 1.), 40.)*smoothstep(.62, .5, h)*.8);   // rivers across the lowlands
  float sea = smoothstep(.41, .38, h);
  alb = mix(alb, mix(vec3(.05, .27, .26), vec3(.01, .06, .1), smoothstep(.38, .29, h)), sea);  // shallows to deep water
  alb = mix(alb, vec3(.9, .93, .95), smoothstep(.84, .92, h));             // snow on the highest peaks
  float cap = smoothstep(.74, .86, abs(s.y) + (h - .5)*.3);                // polar ice, ragged at the edge
  alb = mix(alb, vec3(.92, .95, .98), cap);
  alb *= .86 + .28*fbm3(s*36.);                                            // fine ground texture
  spec = sea*.8*(1. - cap); bump = .18*(1. - sea); cover = .58;
#endif
  vec3 n = normalize(s - bump*g);
  cover -= .05*sin(s.y*9.);                                                          // weather gathers in latitude belts
  float clouds = pow(smoothstep(cover - .04, cover + .28, cloudField(s, 1.)), 1.5);  // thin wispy edges, thick cores
  float shade = pow(smoothstep(cover - .04, cover + .28, cloudField(normalize(s + L*.035), 0.)), 1.5);   // cloud between this spot and the light
#if KIND != 1
  clouds = max(clouds, .2*smoothstep(.5, .75, fbm3(s*vec3(2., 14., 2.) + 7.)));      // high thin cirrus streaks
#endif
#if KIND == 1
  clouds *= .25; shade *= .25;   // most of Mann's cloud is the solid shell above the surface
#endif
  vec3 sun = vec3(1., .8, .58)*1.6;
  float ndl = max(dot(n, L), 0.), sdl = dot(s, L);
  vec3 col = alb*(sun*ndl*(1. - .55*shade) + .03);                       // clouds cast shadows on the ground
  float glint = max(dot(reflect(-L, n), V), 0.);
  col += spec*(sun*pow(glint, 90.)*1.2 + vec3(.9, .95, 1.)*pow(glint, 14.)*.07)*(1. - clouds);   // tight sun glint inside a faint pale sheen
  float puff = clamp(.75 + (clouds - shade)*.6, .45, 1.15);                // cloud tops bright toward the light, dim behind
  vec3 cloudLight = mix(vec3(1.45), sun, .3);                             // clouds scatter light nearly white, whatever its colour
  col = mix(col, vec3(.95)*(cloudLight*max(sdl, 0.)*.85*puff + .04), clouds*.9);
  col += alb*.09*max(dot(s, V), 0.);                                   // faint fill so the night side is not pure black
  float rim = pow(1. - max(dot(s, V), 0.), 3.);
#if KIND == 1
  vec3 air = uA;                                   // thin and colourless
#else
  vec3 air = mix(uA, vec3(.42, .66, 1.), .6);      // scattered light is blue, tinted by the planet
#endif
  float day = smoothstep(-.15, .5, sdl);
  col = mix(col, air*sun*.55, rim*.55*day);                             // haze thickens toward the edge of the disc
  col += air*rim*(.1 + .7*day)*(1. + uHover*.8);
  col += air*.5*pow(1. - max(dot(s, V), 0.), 8.)*(.15 + .85*day);       // thin bright line of air at the limb
  col += vec3(1., .42, .16)*.2*smoothstep(-.22, .02, sdl)*smoothstep(.3, .02, sdl)*rim;   // sunset band along the day-night line
  // the station's beacon: a blinking point of light with a soft halo
  float bd = distance(s, uBeacon), blink = .55 + .45*sin(uTime*3.5);
  col += uBeaconCol*blink*(exp(-bd*bd*6000.)*5. + exp(-bd*bd*260.)*.4);
  gl_FragColor = vec4(pow(1. - exp(-col*1.3), vec3(.4545)), 1.);
}`

// Thin glowing shell outside the limb: the atmosphere seen edge-on.
const HALO_FRAG = /* glsl */ `
uniform vec3 uA; varying vec3 vN; varying vec3 vW;
void main(){
  float a = pow(clamp(-dot(normalize(vN), normalize(cameraPosition - vW))/.36, 0., 1.), 2.5);
  a *= .15 + .85*smoothstep(-.4, .5, dot(normalize(vN), normalize(-vW)));
  gl_FragColor = vec4(uA*a, a);
}`

function Gargantua() {
  const camera = useThree(s => s.camera)
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uInvProj: { value: camera.projectionMatrixInverse }, uCamWorld: { value: camera.matrixWorld },
  }), [camera])
  useFrame((_, dt) => { if (!still) uniforms.uTime.value += Math.min(dt, 0.1) })
  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial uniforms={uniforms} defines={{ STEPS: 140 }} depthTest={false} depthWrite={false}
        vertexShader="varying vec2 vUv; varying vec3 vCentre; void main(){ vUv = uv; vec4 c = projectionMatrix*viewMatrix*vec4(0., 0., 0., 1.); vCentre = vec3(c.xy/c.w, step(0., c.w)); gl_Position = vec4(position.xy, 1., 1.); }"
        fragmentShader={HOLE_FRAG} />
    </mesh>
  )
}

type Labels = RefObject<Record<string, HTMLElement | null>>   // keyed by planet id
type Nav = { hovered: PlanetId | null; onHover: (id: PlanetId | null) => void; onSelect: (id: PlanetId) => void }

function Planet({ p, kind, labels, hovered, onHover, onSelect }: { p: (typeof PLANETS)[number]; kind: number; labels: Labels } & Nav) {
  const mesh = useRef<THREE.Mesh>(null!)
  const shell = useRef<THREE.Mesh>(null)
  const v = useMemo(() => new THREE.Vector3(), [])
  const uniforms = useMemo(() => ({
    uA: { value: new THREE.Color(p.color) }, uHover: { value: 0 }, uTime: { value: kind * 40 },
    // the beacon starts on the side facing the navigation camera, a little north of centre
    uBeacon: { value: HOME.clone().sub(new THREE.Vector3(...p.pos)).normalize().add(new THREE.Vector3(0, 0.3, 0)).normalize() },
    uBeaconCol: { value: new THREE.Color(PROGRESS.recovered.includes(p.id) ? '#4dff8f' : '#ffab2e') },   // amber until its transmission is recovered
  }), [p, kind])
  useFrame(({ camera, size }, dt) => {
    if (!still) {
      mesh.current.rotation.y += dt * 0.03; uniforms.uTime.value += Math.min(dt, 0.1)
      if (shell.current) shell.current.rotation.y += dt * 0.011   // the cloud shell drifts over the ground
    }
    uniforms.uHover.value = hovered === p.id ? 1 : 0
    // keep the DOM label (a real button) centred on the planet and tell it the planet's radius in pixels
    const edge = (p.r / v.fromArray(p.pos).distanceTo(camera.position)) * camera.projectionMatrix.elements[5] * size.height / 2
    v.project(camera)
    const el = labels.current[p.id], z = uiZoom()   // the label is in a zoomed layer, so its pixel units are 1/z of the canvas's
    if (el) { el.style.left = `${((v.x * 0.5 + 0.5) * size.width) / z}px`; el.style.top = `${((-v.y * 0.5 + 0.5) * size.height) / z}px`; el.style.setProperty('--r', `${edge / z}px`) }
  })
  return (
    <group position={p.pos} scale={hovered === p.id ? 1.06 : 1}>
      <mesh ref={mesh} onPointerOver={() => onHover(p.id)} onPointerOut={() => onHover(null)} onClick={() => onSelect(p.id)}>
        <sphereGeometry args={[p.r, 64, 48]} />
        <shaderMaterial uniforms={uniforms} defines={{ KIND: kind }} vertexShader={PLANET_VERT} fragmentShader={PLANET_FRAG} />
      </mesh>
      {kind === 1 && (   // Mann's frozen cloud layer
        <mesh ref={shell} raycast={() => null}>
          <sphereGeometry args={[p.r * 1.035, 64, 48]} />
          <shaderMaterial uniforms={uniforms} transparent depthWrite={false} vertexShader={PLANET_VERT} fragmentShader={SHELL_FRAG} />
        </mesh>
      )}
      <mesh raycast={() => null}>
        <sphereGeometry args={[p.r * 1.07, 48, 32]} />
        <shaderMaterial uniforms={uniforms} side={THREE.BackSide} transparent depthWrite={false} blending={THREE.AdditiveBlending} fragmentShader={HALO_FRAG}
          vertexShader="varying vec3 vN; varying vec3 vW; void main(){ vN = mat3(modelMatrix)*normal; vec4 w = modelMatrix*vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }" />
      </mesh>
    </group>
  )
}

// The Endurance, after the film: a segmented ring of twelve box modules (four engine, four habitat,
// four cargo) joined by short couplings, four tunnels to a central docking hub, and two Rangers and
// two Landers docked there. Built from primitives, so it is a likeness, not a film-accurate model.
const RING = 0.34
const HULL = <meshStandardMaterial color="#eef0f2" roughness={0.7} metalness={0.05} />
const GREY = <meshStandardMaterial color="#8d939c" roughness={0.75} />
const DARK = <meshStandardMaterial color="#1f2227" roughness={0.85} />
const GLOW = <meshBasicMaterial color="#ffe2b0" />
const QUARTER = Math.PI / 2

// One ring module. Local axes: x points away from the hub, y runs along the ring, z is the spin axis.
function Module({ kind }: { kind: number }) {
  return (
    <group position={[RING, 0, 0]}>
      <mesh><boxGeometry args={[0.075, 0.13, 0.09]} />{HULL}</mesh>
      {[-0.034, 0.034].map(y => (   // panel seams
        <mesh key={y} position={[0, y, 0]}><boxGeometry args={[0.078, 0.004, 0.093]} />{DARK}</mesh>
      ))}
      <mesh position={[0.04, 0, 0]}><boxGeometry args={[0.008, 0.11, 0.07]} />{GREY}</mesh>{/* outer shielding */}
      {kind === 0 && (   // engine module: twin nozzles aft, dark radiator forward
        <>
          {[-0.03, 0.03].map(y => (
            <mesh key={y} position={[0, y, -0.062]} rotation={[-QUARTER, 0, 0]}><cylinderGeometry args={[0.022, 0.012, 0.035, 10]} />{DARK}</mesh>
          ))}
          <mesh position={[0, 0, 0.047]}><boxGeometry args={[0.06, 0.1, 0.006]} />{DARK}</mesh>
        </>
      )}
      {kind === 1 && (   // habitat module: lit windows forward and facing the hub
        <>
          <mesh position={[0, 0, 0.046]}><boxGeometry args={[0.012, 0.075, 0.003]} />{GLOW}</mesh>
          <mesh position={[-0.038, 0, 0.01]}><boxGeometry args={[0.003, 0.05, 0.018]} />{GLOW}</mesh>
        </>
      )}
      {kind === 2 && (   // cargo module: hatch forward, tank aft
        <>
          <mesh position={[0, 0, 0.046]}><boxGeometry args={[0.045, 0.055, 0.004]} />{DARK}</mesh>
          <mesh position={[0, 0, -0.055]} rotation={[QUARTER, 0, 0]}><cylinderGeometry args={[0.022, 0.022, 0.02, 10]} />{GREY}</mesh>
        </>
      )}
    </group>
  )
}

// A Ranger: a flat white arrowhead with a dark heat-shield belly, raised cabin, twin engines and fins.
// Nose is +y, top is +z. Shared by the two docked craft and the one that flies.
const RANGER = (
  <>
    <mesh scale={[1, 1, 0.3]}><coneGeometry args={[0.04, 0.15, 4]} />{HULL}</mesh>
    <mesh scale={[1.04, 1.02, 0.14]} position={[0, 0, -0.007]}><coneGeometry args={[0.04, 0.15, 4]} />{DARK}</mesh>{/* heat shield */}
    <mesh position={[0, -0.012, 0.009]}><boxGeometry args={[0.02, 0.085, 0.012]} />{HULL}</mesh>{/* cabin spine */}
    <mesh position={[0, 0.034, 0.0105]} rotation={[-0.25, 0, 0]}><boxGeometry args={[0.017, 0.026, 0.006]} />{DARK}</mesh>{/* cockpit glass */}
    {[-0.045, -0.02].map(y => (   // panel lines across the back
      <mesh key={y} position={[0, y, 0.0045]}><boxGeometry args={[0.055, 0.0018, 0.009]} />{DARK}</mesh>
    ))}
    <mesh position={[0, -0.072, 0.001]}><boxGeometry args={[0.066, 0.016, 0.016]} />{GREY}</mesh>{/* engine housing */}
    {[-1, 1].map(side => (
      <group key={side}>
        <mesh position={[side * 0.018, -0.086, 0.001]}><cylinderGeometry args={[0.006, 0.009, 0.014, 10]} />{DARK}</mesh>{/* nozzle */}
        <mesh position={[side * 0.031, -0.058, 0.012]} rotation={[0, side * -0.35, 0]}><boxGeometry args={[0.0025, 0.03, 0.02]} />{HULL}</mesh>{/* fin */}
        <mesh position={[side * 0.037, -0.07, 0.003]}><sphereGeometry args={[0.0028, 6, 6]} /><meshBasicMaterial color={side < 0 ? '#ff4a4a' : '#5dff8a'} /></mesh>{/* nav light */}
      </group>
    ))}
    {/* cockpit: centre frame splits the windshield in two */}
    <mesh position={[0, 0.034, 0.0112]} rotation={[-0.25, 0, 0]}><boxGeometry args={[0.0016, 0.027, 0.0064]} />{HULL}</mesh>
    <mesh position={[0, -0.02, 0.0153]}><boxGeometry args={[0.012, 0.014, 0.001]} />{DARK}</mesh>{/* dorsal hatch */}
    <mesh position={[0, -0.046, 0.023]} rotation={[QUARTER, 0, 0]}><cylinderGeometry args={[0.0008, 0.0008, 0.018, 5]} />{GREY}</mesh>{/* antenna */}
    <mesh position={[0, 0.03, -0.012]}><boxGeometry args={[0.004, 0.022, 0.004]} />{GREY}</mesh>{/* nose skid */}
    {[-1, 1].map(side => (
      <group key={`d${side}`}>
        {/* dark leading edge along the swept wing, and a grey panel on the wing's upper surface */}
        <mesh position={[side * 0.0205, 0, 0.001]} rotation={[0, 0, side * 0.26]}><boxGeometry args={[0.003, 0.15, 0.0045]} />{DARK}</mesh>
        <mesh position={[side * 0.017, -0.042, 0.0048]} rotation={[0, 0, side * 0.26]}><boxGeometry args={[0.014, 0.05, 0.0015]} />{GREY}</mesh>
        <mesh position={[side * 0.009, 0.05, 0.004]}><boxGeometry args={[0.004, 0.006, 0.004]} />{GREY}</mesh>{/* nose thruster block */}
        <mesh position={[side * 0.034, -0.066, 0.004]}><boxGeometry args={[0.006, 0.014, 0.01]} />{DARK}</mesh>{/* engine intake */}
        <mesh position={[side * 0.018, -0.05, -0.012]}><boxGeometry args={[0.004, 0.022, 0.004]} />{GREY}</mesh>{/* rear skid */}
      </group>
    ))}
  </>
)

// Docked craft sit on the hub's forward face, noses pointing outward.
function Ranger({ turn }: { turn: number }) {
  return (
    <group rotation={[0, 0, turn]}>
      <group position={[0, 0.115, 0.045]}>{RANGER}</group>
    </group>
  )
}
// A Lander: the heavier, boxier craft. Nose is +y, top is +z. Shared by the docked craft and the one that flies.
const LANDER = (
  <>
    <mesh><boxGeometry args={[0.07, 0.085, 0.038]} />{HULL}</mesh>
    <mesh position={[0, 0.052, -0.002]}><boxGeometry args={[0.05, 0.022, 0.03]} />{HULL}</mesh>{/* nose */}
    <mesh position={[0, 0.056, 0.014]} rotation={[-0.5, 0, 0]}><boxGeometry args={[0.038, 0.012, 0.005]} />{DARK}</mesh>{/* cockpit glass */}
    <mesh position={[0, 0.004, -0.022]}><boxGeometry args={[0.074, 0.1, 0.006]} />{DARK}</mesh>{/* heat shield */}
    {/* cargo bay doors on the back */}
    {[-0.013, 0.013].map(x => <mesh key={x} position={[x, -0.004, 0.0195]}><boxGeometry args={[0.0018, 0.06, 0.002]} />{DARK}</mesh>)}
    {[-0.034, 0.026].map(y => <mesh key={y} position={[0, y, 0.0195]}><boxGeometry args={[0.03, 0.0018, 0.002]} />{DARK}</mesh>)}
    {/* four corner lift thrusters */}
    {[-1, 1].flatMap(sx => [-1, 1].map(sy => (
      <group key={`${sx}${sy}`} position={[sx * 0.041, sy * 0.03, -0.004]}>
        <mesh rotation={[QUARTER, 0, 0]}><cylinderGeometry args={[0.008, 0.008, 0.024, 10]} />{GREY}</mesh>
        <mesh rotation={[QUARTER, 0, 0]} position={[0, 0, -0.015]}><cylinderGeometry args={[0.006, 0.009, 0.008, 10]} />{DARK}</mesh>
      </group>
    )))}
    {/* main engines aft */}
    <mesh position={[0, -0.048, 0]}><boxGeometry args={[0.052, 0.012, 0.028]} />{GREY}</mesh>
    {[-0.015, 0.015].map(x => <mesh key={x} position={[x, -0.059, 0]}><cylinderGeometry args={[0.006, 0.009, 0.012, 10]} />{DARK}</mesh>)}
    <mesh position={[0, 0.03, 0.0205]}><boxGeometry args={[0.006, 0.006, 0.003]} />{GLOW}</mesh>{/* beacon */}
    <mesh position={[0, 0.02, 0]}><boxGeometry args={[0.0715, 0.002, 0.0395]} />{DARK}</mesh>{/* hull band */}
    {/* docking ring on the back */}
    <mesh position={[0, 0.006, 0.021]} rotation={[QUARTER, 0, 0]}><cylinderGeometry args={[0.012, 0.012, 0.004, 14]} />{GREY}</mesh>
    <mesh position={[0, 0.006, 0.0225]} rotation={[QUARTER, 0, 0]}><cylinderGeometry args={[0.008, 0.008, 0.003, 14]} />{DARK}</mesh>
    {/* antenna mast and dish */}
    <mesh position={[0.022, -0.03, 0.026]} rotation={[QUARTER, 0, 0]}><cylinderGeometry args={[0.0008, 0.0008, 0.014, 5]} />{GREY}</mesh>
    <mesh position={[0.022, -0.03, 0.034]} rotation={[-QUARTER, 0, 0]}><coneGeometry args={[0.007, 0.004, 10]} />{GREY}</mesh>
    {[-1, 1].map(side => (
      <group key={`d${side}`}>
        <mesh position={[side * 0.007, 0.056, 0.0145]} rotation={[-0.5, 0, 0]}><boxGeometry args={[0.0015, 0.013, 0.0056]} />{HULL}</mesh>{/* window frame */}
        <mesh position={[side * 0.038, 0, 0.009]}><cylinderGeometry args={[0.006, 0.006, 0.04, 10]} />{GREY}</mesh>{/* side tank */}
        <mesh position={[side * 0.027, 0.06, 0]}><boxGeometry args={[0.005, 0.006, 0.008]} />{GREY}</mesh>{/* nose thruster block */}
        <mesh position={[side * 0.036, 0.042, 0.014]}><sphereGeometry args={[0.0028, 6, 6]} /><meshBasicMaterial color={side < 0 ? '#ff4a4a' : '#5dff8a'} /></mesh>{/* nav light */}
        {[-1, 1].map(end => (   // folded landing legs with foot pads
          <group key={end} position={[side * 0.024, end * 0.036, -0.03]}>
            <mesh><boxGeometry args={[0.005, 0.005, 0.012]} />{GREY}</mesh>
            <mesh position={[0, 0, -0.007]} rotation={[QUARTER, 0, 0]}><cylinderGeometry args={[0.007, 0.007, 0.002, 10]} />{DARK}</mesh>
          </group>
        ))}
      </group>
    ))}
  </>
)

function Lander({ turn }: { turn: number }) {
  return <group rotation={[0, 0, turn]}><group position={[0, 0.105, 0.04]}>{LANDER}</group></group>
}

// Only the ship uses these lights: Gargantua at the origin, a cold fill from the camera side.
const Lights = () => (
  <group>
    <pointLight color="#ffb46a" intensity={3} decay={0} />
    <directionalLight position={[2, 4, 8]} color="#ffffff" intensity={2.6} />
    <ambientLight intensity={0.45} />
  </group>
)

// where the Endurance is first seen in the intro: just ahead of the far camera
const ARRIVAL = new THREE.Vector3(1.6, 5.4, 33)

function Endurance({ finale, intro, onPlay }: { finale: boolean; intro: boolean; onPlay: () => void }) {
  const ship = useRef<THREE.Group>(null!)
  const ring = useRef<THREE.Group>(null!)
  const bay = useRef<THREE.Group>(null!)   // the Ranger that flies out
  const pad = useRef<THREE.Group>(null!)   // the Lander that flies out
  const leave = useRef(0)   // 0 = holding orbit, 1 = arrived at Edmunds
  const arrive = useRef(intro ? 0 : 1)   // 0 = at the arrival point, 1 = on its loop
  const edmunds = useMemo(() => new THREE.Vector3().fromArray(PLANETS[2].pos), [])
  useFrame(({ clock }, dt) => {
    // a slow loop above Gargantua: across the top one way nearer the camera, back the other way
    // further off, about once a minute. It stays clear of the mission title, the HUD panels and the
    // line of sight to every planet, and never passes behind the black hole.
    const lap = still ? 0.6 : clock.elapsedTime * 0.1
    ship.current.position.set(Math.sin(lap) * 4.5, 4.6 + Math.sin(lap * 2) * 0.35, 5 + Math.cos(lap) * 1.5)
    // intro: the ship waits near the camera, then flies in to join its loop over about six seconds
    arrive.current = intro ? 0 : still ? 1 : Math.min(1, arrive.current + dt / 6)
    if (arrive.current < 1) ship.current.position.lerp(ARRIVAL, 1 - arrive.current * arrive.current * (3 - 2 * arrive.current))
    // finale: the ship sets off for Edmunds and shrinks into the distance
    leave.current = !finale ? 0 : still ? 0.5 : Math.min(1, leave.current + dt / 50)
    const k = leave.current * leave.current * (3 - 2 * leave.current)
    ship.current.position.lerp(edmunds, k * 0.86)
    ship.current.scale.setScalar(1.9 * (1 - 0.72 * k))
    if (!still) ring.current.rotation.z += dt * 0.5   // spin for gravity
    flightDeck.dock.copy(ship.current.position)
    bay.current.visible = !(flightDeck.out && !flightDeck.lander)
    pad.current.visible = !(flightDeck.out && flightDeck.lander)
  })
  return (
    <group ref={ship} rotation={[0.55, 0.45, 0]} onClick={onPlay}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>{/* click the ship to fly the simulator */}
      {/* the ring is mostly gaps, so an invisible disc over it catches the click */}
      <mesh scale={[1, 1, 0.25]}><sphereGeometry args={[RING + 0.08, 16, 12]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
      <group ref={ring}>
        {Array.from({ length: 12 }, (_, i) => (
          <group key={i} rotation={[0, 0, (i / 12) * Math.PI * 2]}>
            <Module kind={i % 3} />
            {/* coupling to the next module, half a step round the ring */}
            <group rotation={[0, 0, Math.PI / 12]}>
              <mesh position={[RING * 0.966, 0, 0]}><boxGeometry args={[0.042, 0.06, 0.048]} />{GREY}</mesh>
              <mesh position={[RING * 0.966, 0, 0]}><boxGeometry args={[0.048, 0.012, 0.054]} />{DARK}</mesh>
            </group>
            {i % 3 === 0 && (   // access tunnel from the hub
              <mesh position={[RING / 2 + 0.01, 0, 0]} rotation={[0, 0, QUARTER]}><cylinderGeometry args={[0.011, 0.011, RING - 0.1, 8]} />{HULL}</mesh>
            )}
          </group>
        ))}
        {/* docking hub */}
        <mesh rotation={[QUARTER, 0, 0]}><cylinderGeometry args={[0.058, 0.058, 0.1, 8]} />{HULL}</mesh>
        <mesh rotation={[QUARTER, 0, 0]}><cylinderGeometry args={[0.062, 0.062, 0.02, 8]} />{DARK}</mesh>
        <mesh rotation={[QUARTER, 0, 0]} position={[0, 0, 0.06]}><cylinderGeometry args={[0.028, 0.04, 0.03, 12]} />{GREY}</mesh>
        <mesh position={[0, 0, 0.077]}><boxGeometry args={[0.02, 0.02, 0.004]} />{GLOW}</mesh>
        <group ref={bay}><Ranger turn={Math.PI / 4} /></group><Ranger turn={Math.PI * 1.25} />
        <group ref={pad}><Lander turn={Math.PI * 0.75} /></group><Lander turn={Math.PI * 1.75} />
      </group>
    </group>
  )
}

// Shared between the Endurance and the Ranger that flies the crew out: where the dock is right now,
// and whether the Ranger has left it.
const flightDeck = { out: false, lander: false, dock: new THREE.Vector3() }

// A craft leaves the Endurance for the selected planet, parks beside it, and flies home on return:
// the Lander for Edmunds (the landing site), a Ranger for the other two.
// It takes the same time as the camera flight, so the two arrive together.
function Shuttle({ focus }: { focus: PlanetId | null }) {
  const craft = useRef<THREE.Group>(null!)
  const trail = useRef<THREE.Group>(null!)
  const tail = useRef<THREE.Group>(null!)
  const ranger = useRef<THREE.Group>(null!)
  const lander = useRef<THREE.Group>(null!)
  const s = useRef({ t: 1, focus: null as PlanetId | null, from: new THREE.Vector3() })
  const [to, ctrl, next] = useMemo(() => [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], [])
  useFrame((_, dt) => {
    const a = s.current, g = craft.current
    if (a.focus !== focus) {
      a.focus = focus; a.t = 0
      if (!flightDeck.out) g.position.copy(flightDeck.dock)
      if (focus) flightDeck.lander = focus === 'edmunds'   // the return trip keeps the craft that went out
      a.from.copy(g.position); flightDeck.out = true
    }
    const p = PLANETS.find(x => x.id === focus)
    if (p) {   // park just off the planet, on the camera's side of it
      to.fromArray(p.pos); next.copy(HOME).sub(to).normalize(); ctrl.set(0, 1, 0).cross(next).normalize()
      to.addScaledVector(next, p.r * 2).addScaledVector(ctrl, -p.r * 1.3); to.y -= p.r * 0.5
    } else to.copy(flightDeck.dock)
    a.t = Math.min(1, a.t + (still ? 1 : dt / FLIGHT_S))
    if (!focus && a.t >= 1) flightDeck.out = false   // docked again
    g.visible = flightDeck.out
    if (!g.visible) return
    lander.current.visible = flightDeck.lander; ranger.current.visible = !flightDeck.lander
    tail.current.position.y = flightDeck.lander ? -0.066 : -0.094   // where that craft's nozzles are
    const e = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2
    ctrl.copy(a.from).lerp(to, 0.5); ctrl.y += 1.5
    next.copy(a.from).multiplyScalar((1 - e) ** 2).addScaledVector(ctrl, 2 * (1 - e) * e).addScaledVector(to, e * e)
    if (next.distanceToSquared(g.position) > 1e-8) g.lookAt(next)   // nose along the direction of travel
    g.position.copy(next)
    trail.current.scale.y = Math.max(0.001, Math.sin(Math.PI * e))    // engine plumes only while under way
  })
  return (
    <group ref={craft} visible={false} scale={3}>
      <group rotation={[QUARTER, Math.PI, 0]}>{/* the craft's nose is +y and top is +z; lookAt wants nose on +z, top on +y */}
        <group ref={ranger}>{RANGER}</group>
        <group ref={lander}>{LANDER}</group>
        <group ref={tail}>
        {[-0.017, 0.017].map(x => (   // engine glow at each nozzle
          <mesh key={x} position={[x, 0, 0.001]}><sphereGeometry args={[0.007, 8, 8]} /><meshBasicMaterial color="#d8ebff" /></mesh>
        ))}
        <group ref={trail}>{/* plumes stretch back from the nozzles */}
          {[-0.017, 0.017].map(x => (
            <mesh key={x} position={[x, -0.2, 0]} rotation={[0, 0, Math.PI]}>
              <coneGeometry args={[0.007, 0.4, 8]} />
              <meshBasicMaterial color="#9fc8ff" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
          ))}
        </group>
        </group>
      </group>
    </group>
  )
}

// Wreckage from the Endurance, tumbling near Mann's planet. It only appears once Mann's
// transmission is recovered, since it gives away what happened there.
function Debris() {
  const field = useRef<THREE.Group>(null!)
  const shown = PROGRESS.recovered.includes('mann')
  useFrame((_, dt) => { if (shown && !still) { field.current.rotation.x += dt * 0.11; field.current.rotation.y += dt * 0.07 } })
  if (!shown) return null
  return (
    <group position={[9.0, 3.9, 3.0]} scale={1.9}>
      <group ref={field}>
        <group position={[0, 0, 0]} rotation={[0.4, 0.2, 1.1]}>{/* a ring module, torn open */}
          <mesh><boxGeometry args={[0.075, 0.13, 0.09]} />{HULL}</mesh>
          <mesh position={[0, 0.034, 0]}><boxGeometry args={[0.078, 0.004, 0.093]} />{DARK}</mesh>
          <mesh position={[0.02, -0.07, 0.01]} rotation={[0.3, 0, 0.5]}><boxGeometry args={[0.06, 0.02, 0.07]} />{DARK}</mesh>
        </group>
        <mesh position={[0.2, 0.08, -0.05]} rotation={[1.2, 0.7, 0.3]}><boxGeometry args={[0.042, 0.06, 0.048]} />{GREY}</mesh>{/* a coupling */}
        <mesh position={[-0.16, -0.1, 0.07]} rotation={[0.2, 1.4, 0.9]}><boxGeometry args={[0.09, 0.004, 0.06]} />{HULL}</mesh>{/* hull plates */}
        <mesh position={[0.09, -0.17, -0.1]} rotation={[2.1, 0.3, 0.4]}><boxGeometry args={[0.05, 0.004, 0.08]} />{GREY}</mesh>
        <mesh position={[-0.07, 0.19, 0.04]} rotation={[0.9, 2.2, 1.3]}><cylinderGeometry args={[0.011, 0.011, 0.14, 8]} />{HULL}</mesh>{/* a length of tunnel */}
        <mesh position={[0.24, -0.06, 0.12]} rotation={[0.5, 0.5, 2]}><boxGeometry args={[0.02, 0.03, 0.004]} />{DARK}</mesh>
      </group>
    </group>
  )
}

// Camera flight: an eased arc between Gargantua and a planet. The lens widens mid-flight for a
// sense of speed, then tightens to a long lens on arrival, with a slight bank into the turn.
function Rig({ focus, finale, intro }: { focus: PlanetId | null; finale: boolean; intro: boolean }) {
  const s = useRef({ t: 1, focus: null as string | null, fromFov: 50, from: HOME.clone(), fromLook: new THREE.Vector3(), look: new THREE.Vector3(), drift: new THREE.Vector3() })
  const [to, toLook, ctrl, tmp] = useMemo(() => [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], [])
  useFrame(({ camera, pointer, clock, size }, dt) => {
    const a = s.current, cam = camera as THREE.PerspectiveCamera
    const shot = focus ?? (finale ? 'finale' : intro ? 'intro' : null)
    if (a.focus !== shot) { a.focus = shot; a.t = 0; a.from.copy(cam.position).sub(a.drift); a.fromLook.copy(a.look); a.fromFov = cam.fov }
    const p = PLANETS.find(x => x.id === focus)
    if (p) {
      // station shot: the planet hangs in the upper right behind the panels, drifting slowly
      toLook.fromArray(p.pos); to.copy(HOME).sub(toLook).normalize()
      tmp.set(0, 1, 0).cross(to).normalize()                                  // screen-right
      const drift = still ? 0 : Math.sin(clock.elapsedTime * 0.12) * 0.5
      to.multiplyScalar(p.r * 9).add(toLook).addScaledVector(tmp, p.r * drift)
      toLook.y -= p.r * 1.5
      toLook.addScaledVector(tmp, -p.r * 2.4 * Math.min(1, size.width / size.height / 1.6))
    }
    else if (intro) { toLook.set(0, 0, 0); to.set(0, 7, 40) }   // opening shot: far out, the whole system small ahead
    else if (finale) {   // closing shot: pulled back, swaying slowly from side to side
      const sway = still ? 0.25 : Math.sin(clock.elapsedTime * 0.06) * 0.4
      toLook.set(0, -2.6, 0); to.set(Math.sin(sway) * 24, 3.4, Math.cos(sway) * 24)
    }
    // narrow windows: back the camera off so the outer planets and their labels stay in frame
    else { toLook.set(0, 0, 0); to.copy(HOME).multiplyScalar(Math.max(1, 1.6 / (size.width / size.height))) }
    a.t = Math.min(1, a.t + (still ? 1 : dt / FLIGHT_S))
    const e = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2   // ease in and out
    const swell = Math.sin(Math.PI * e)                                // 0 at both ends, 1 mid-flight
    // lift the path into an arc; leaving a planet swings out much wider, so Gargantua is revealed in a long pull-back
    ctrl.copy(a.from).lerp(to, 0.5); ctrl.y += p ? 2.5 : 5; ctrl.z += p ? 2 : 9
    cam.position.copy(a.from).multiplyScalar((1 - e) ** 2).addScaledVector(ctrl, 2 * (1 - e) * e).addScaledVector(to, e * e)
    a.look.copy(a.fromLook).lerp(toLook, e)
    // mouse drift, only while parked at Gargantua
    // parked at Gargantua the camera is never quite still, and the mouse swings it far enough to change the disk's tilt
    const parked = !p && !finale && !intro && !still, now = clock.elapsedTime
    tmp.set(parked ? pointer.x * 3.2 + Math.sin(now * 0.11) * 2 : 0, parked ? pointer.y * 2.2 + Math.sin(now * 0.08) * 1.1 : 0, 0)
    cam.position.add(a.drift.lerp(tmp, 1 - Math.exp(-dt * 2.5)))
    cam.fov = a.fromFov + ((p ? 34 : finale ? 40 : 50) - a.fromFov) * e + swell * (finale ? 0 : 16)
    cam.updateProjectionMatrix()
    cam.lookAt(a.look)
    cam.rotateZ(swell * 0.12 * (to.x > a.from.x ? -1 : 1))
  })
  return null
}

// Full native resolution: one rendered pixel per screen pixel, so a 4K display gets a 4K picture.
const sharpest = () => Math.min(devicePixelRatio, 3)

// Weak GPU: lower the render resolution when the frame rate sags, and raise it again when there is
// headroom. A brief stutter (a shader compiling, a tab switch) must not cost resolution for good,
// so it takes two slow seconds in a row to step down and three smooth ones to step back up.
function AdaptiveDpr() {
  const setDpr = useThree(s => s.setDpr)
  const top = sharpest()
  const s = useRef({ t: 0, n: 0, dpr: top, cap: top, before: top, slow: 0, fast: 0, sinceRaise: 99 })
  useFrame((_, dt) => {
    const a = s.current
    if (dt > 0.25) return // tab was hidden
    a.t += dt
    if (++a.n < 60) return
    const frame = a.t / a.n
    a.t = a.n = 0
    a.sinceRaise++
    if (frame > 1 / 35) { a.slow++; a.fast = 0 } else if (frame < 1 / 50) { a.fast++; a.slow = 0 } else a.slow = a.fast = 0
    if (a.slow >= 2 && a.dpr > 0.4) {
      // slow right after stepping up means that step was too much: go back and stop trying it
      if (a.sinceRaise < 5) a.cap = a.dpr = a.before
      else a.dpr = Math.max(0.4, a.dpr * 0.75)
      a.slow = 0; setDpr(a.dpr)
    } else if (a.fast >= 3 && a.dpr < a.cap) {
      a.before = a.dpr; a.dpr = Math.min(a.cap, a.dpr * 1.25)
      a.fast = 0; a.sinceRaise = 0; setDpr(a.dpr)
    }
  })
  return null
}

export function Scene({ focus, finale, intro, paused, onPlay, labels, ...nav }: { focus: PlanetId | null; finale: boolean; intro: boolean; paused: boolean; onPlay: () => void; labels: Labels } & Nav) {
  return (
    <Canvas frameloop={paused ? 'never' : 'always'} dpr={sharpest()} camera={{ position: HOME.toArray(), fov: 50 }} gl={{ antialias: false }}
      fallback={<div className="gargantua-fallback" />}>
      <Gargantua />
      {PLANETS.map((p, i) => <Planet key={p.id} p={p} kind={i} labels={labels} {...nav} />)}
      <Lights />
      <Endurance finale={finale} intro={intro} onPlay={onPlay} />
      <Shuttle focus={focus} />
      <Debris />
      <Rig focus={focus} finale={finale} intro={intro} />
      <AdaptiveDpr />
    </Canvas>
  )
}
