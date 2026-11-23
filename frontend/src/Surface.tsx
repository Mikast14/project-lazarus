import type { PlanetId } from './data'

// The landing site of each station, as a small animated illustration drawn in SVG.
// The scenes are 800 x 340; movement comes from the site-* animations in index.css.

/** A jagged ridgeline from the left edge to the right, closed along the bottom, as an SVG path. */
function ridge(seed: number, base: number, height: number, rough = 1) {
  let d = `M0 340 L0 ${base}`
  for (let x = 0; x <= 800; x += 16) {
    const y = base - height * (0.5 + 0.5 * Math.sin(x * 0.008 * rough + seed)) * (0.6 + 0.4 * Math.sin(x * 0.021 * rough + seed * 2.3)) - height * 0.14 * Math.sin(x * 0.07 * rough + seed * 5)
    d += ` L${x} ${y.toFixed(1)}`
  }
  return `${d} L800 340 Z`
}
/** A repeatable pseudo-random number in 0..1 for item i, so the scenes look the same on every visit. */
const rnd = (i: number, salt = 0) => { const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return v - Math.floor(v) }

function MillerSite() {
  return (
    <>
      <defs>
        <linearGradient id="m-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#05121f" /><stop offset="1" stopColor="#2f6482" /></linearGradient>
        <linearGradient id="m-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b6585" /><stop offset="1" stopColor="#08202f" /></linearGradient>
        <radialGradient id="m-glow"><stop offset="0" stopColor="#f1c27d" stopOpacity=".55" /><stop offset="1" stopColor="#f1c27d" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="800" height="196" fill="url(#m-sky)" />
      <circle cx="610" cy="20" r="210" fill="url(#m-glow)" />{/* Gargantua, low in the sky */}
      <path d="M430 20 A180 60 0 0 0 790 20" fill="none" stroke="#ffd696" strokeOpacity=".5" strokeWidth="2" />
      {/* the wave: a wall of water along the whole horizon, rising as it comes */}
      <g className="site-wave">
        <path d="M-40 196 Q150 150 330 160 T640 150 T840 196 Z" fill="#103650" />
        <path d="M-40 196 Q150 150 330 160 T640 150 T840 196" fill="none" stroke="#d8ecf7" strokeOpacity=".7" strokeWidth="1.5" />
      </g>
      <rect y="194" width="800" height="146" fill="url(#m-sea)" />
      <ellipse cx="610" cy="214" rx="150" ry="9" fill="#f1c27d" opacity=".18" />{/* its light on the water */}
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} className="site-ripple" style={{ animationDuration: `${7 - i * 0.5}s` }} x1="-60" x2="860" y1={204 + i * i * 1.7} y2={204 + i * i * 1.7}
          stroke="#bfe3f5" strokeOpacity={0.12 + i * 0.03} strokeWidth={0.6 + i * 0.12} strokeDasharray={`${20 + i * 8} ${46 + i * 10}`} />
      ))}
      {/* what is left of the lander, half under water */}
      <g fill="#d9dce1" stroke="#1f2227" strokeWidth=".8">
        <polygon points="250,268 304,246 322,262 276,282" />
        <polygon points="330,270 352,258 360,272 340,280" fill="#8d939c" />
        <polygon points="470,296 512,288 520,300 480,306" />
        <polygon points="188,300 206,292 214,302" fill="#8d939c" />
      </g>
      <path d="M250 268 L276 282 M304 246 L296 268" stroke="#1f2227" strokeWidth="1" />
      <line x1="296" y1="246" x2="296" y2="222" stroke="#c4c9d1" strokeWidth="1.2" />
      <circle className="site-blink" cx="296" cy="220" r="3" fill="#ffab2e" />{/* the beacon, still looping */}
      <line className="site-blink" x1="296" y1="272" x2="296" y2="296" stroke="#ffab2e" strokeOpacity=".5" strokeWidth="1.5" />
    </>
  )
}

function MannSite() {
  return (
    <>
      <defs>
        <linearGradient id="n-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6f8597" /><stop offset="1" stopColor="#d5dfe7" /></linearGradient>
      </defs>
      <rect width="800" height="340" fill="url(#n-sky)" />
      {/* frozen cloud: solid slabs hanging in the sky, lit from above, dark underneath */}
      {[[90, 60, 190, 34], [330, 34, 250, 40], [610, 78, 170, 30], [470, 118, 130, 22]].map(([x, y, w, h], i) => (
        <g key={i} className="site-drift" style={{ animationDuration: `${26 + i * 7}s` }}>
          <polygon points={`${x},${y + h * 0.5} ${x + w * 0.12},${y} ${x + w * 0.55},${y - h * 0.15} ${x + w * 0.9},${y + h * 0.1} ${x + w},${y + h * 0.6} ${x + w * 0.7},${y + h} ${x + w * 0.2},${y + h * 0.9}`} fill="#f2f6f9" />
          <polygon points={`${x},${y + h * 0.5} ${x + w},${y + h * 0.6} ${x + w * 0.7},${y + h} ${x + w * 0.2},${y + h * 0.9}`} fill="#93a6b8" />
        </g>
      ))}
      <path d={ridge(1.3, 214, 70, 1.6)} fill="#aebecd" />
      <path d={ridge(4.1, 250, 54, 1.1)} fill="#8a9db0" />
      <path d={ridge(7.7, 292, 40, 0.8)} fill="#eaf0f5" />
      <path d={ridge(7.7, 300, 40, 0.8)} fill="#c3d0dc" opacity=".6" />
      {/* the pod: small, intact, one window lit */}
      <g transform="translate(548 258)">
        <rect x="-34" y="-14" width="68" height="28" rx="13" fill="#e4e8ec" stroke="#5b6876" strokeWidth="1" />
        <rect x="-34" y="2" width="68" height="12" rx="6" fill="#aab6c2" />
        <rect className="site-glow" x="-8" y="-8" width="16" height="9" rx="2" fill="#ffc46b" />
        <line x1="20" y1="-14" x2="26" y2="-38" stroke="#5b6876" strokeWidth="1.2" />
        <circle className="site-blink" cx="26" cy="-40" r="2.6" fill="#ffab2e" />
        <ellipse cx="0" cy="17" rx="44" ry="5" fill="#5b6876" opacity=".35" />
      </g>
      {Array.from({ length: 46 }, (_, i) => (   // snow on the wind
        <circle key={i} className="site-snow" style={{ animationDuration: `${4 + rnd(i, 1) * 5}s`, animationDelay: `${-rnd(i, 2) * 9}s` }}
          cx={rnd(i, 3) * 960} cy="0" r={0.8 + rnd(i, 4) * 1.4} fill="#ffffff" opacity={0.5 + rnd(i, 5) * 0.4} />
      ))}
    </>
  )
}

function EdmundsSite() {
  return (
    <>
      <defs>
        <linearGradient id="e-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b2b2c" /><stop offset=".7" stopColor="#8a8a66" /><stop offset="1" stopColor="#d6bd8c" /></linearGradient>
        <radialGradient id="e-sun"><stop offset="0" stopColor="#ffe9bf" stopOpacity=".9" /><stop offset="1" stopColor="#ffe9bf" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="800" height="340" fill="url(#e-sky)" />
      <circle cx="170" cy="178" r="120" fill="url(#e-sun)" />
      <circle cx="170" cy="178" r="13" fill="#fff3d6" />
      <path d={ridge(2.2, 212, 84, 0.9)} fill="#6b6a50" />
      <path d={ridge(5.6, 248, 60, 1.4)} fill="#50553b" />
      <path d={ridge(9.4, 296, 34, 0.7)} fill="#39382a" />
      {/* the hab pod, with the rockslide that came down on it */}
      <g transform="translate(520 262)">
        <rect x="-58" y="-17" width="116" height="34" rx="16" fill="#e7e8e4" stroke="#2b2a20" strokeWidth="1" />
        <rect x="-58" y="3" width="116" height="14" rx="7" fill="#aeb0a6" />
        <rect x="-40" y="-9" width="14" height="9" rx="2" fill="#20241f" />
        <g fill="#5d5642" stroke="#2b2a20" strokeWidth=".8">
          <polygon points="-6,-34 24,-44 52,-30 70,-6 74,22 30,22 4,2" />
          <polygon points="30,-8 56,-18 84,2 92,22 44,22" fill="#6c6550" />
          <polygon points="-22,6 -2,-8 14,8 8,22 -26,22" fill="#4e4837" />
          <polygon points="78,8 98,2 112,22 74,22" fill="#4e4837" />
        </g>
      </g>
      {/* the ground beacon, still transmitting */}
      <line x1="388" y1="286" x2="388" y2="226" stroke="#c9ccc2" strokeWidth="1.6" />
      <path d="M376 244 L400 244 M380 236 L396 236" stroke="#c9ccc2" strokeWidth="1.2" />
      <circle className="site-blink" cx="388" cy="222" r="3.2" fill="#4dff8f" />
      <polygon points="352,288 372,270 380,288" fill="#20241f" stroke="#7a7c70" strokeWidth=".8" />{/* a solar panel */}
      {/* a marker of stacked stones, set a little apart */}
      <g fill="#6c6550" stroke="#2b2a20" strokeWidth=".7">
        <ellipse cx="250" cy="300" rx="13" ry="5" /><ellipse cx="250" cy="293" rx="9" ry="4" /><ellipse cx="250" cy="287" rx="6" ry="3" />
      </g>
      {[[120, 268, 90], [560, 300, 130], [700, 250, 70]].map(([x, y, w], i) => (   // dust moving along the valley floor
        <ellipse key={i} className="site-drift" style={{ animationDuration: `${18 + i * 6}s` }} cx={x} cy={y} rx={w} ry="7" fill="#d6bd8c" opacity=".13" />
      ))}
    </>
  )
}

const SITES: Record<PlanetId, { cam: string; label: string; scene: () => React.JSX.Element; facts: [label: string, value: string][] }> = {
  miller: { cam: 'RANGER 1 · HULL CAM', label: 'A shallow sea under a dark sky, wreckage in the water, and a wall of water rising along the horizon.', scene: MillerSite,
    facts: [['SITE', 'Shallow sea, knee deep'], ['HAZARD', 'Tidal wave, over a kilometre high'], ['STATUS', 'Lander destroyed']] },
  mann: { cam: 'POD CAM 02', label: 'An ice field under slabs of frozen cloud, with a small pod, one window lit, in falling snow.', scene: MannSite,
    facts: [['SITE', 'Ice field'], ['HAZARD', 'Extreme cold'], ['STATUS', 'Pod intact, beacon active']] },
  edmunds: { cam: 'BEACON MAST CAM', label: 'A rocky valley at low sun, a hab pod half buried by a rockslide, a beacon mast and a marker of stacked stones.', scene: EdmundsSite,
    facts: [['SITE', 'Rocky valley, breathable air'], ['HAZARD', 'Rockslide at camp'], ['STATUS', 'Hab pod partly buried']] },
}

export function Surface({ id }: { id: PlanetId }) {
  const site = SITES[id], Scene = site.scene
  return (
    <figure className="reveal">
      <div className="relative overflow-hidden border border-white/10 bg-black">
        <svg viewBox="0 0 800 340" className="site block w-full" role="img" aria-label={site.label}><Scene /></svg>
        {/* camera overlay: scan lines, a vignette and a status line */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0_3px,#0000001f_3px_4px)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,#000a_100%)]" />
        <p className="absolute top-2 left-3 text-[9px] tracking-[.3em] text-white/70">{site.cam}</p>
        <p className="absolute top-2 right-3 text-[9px] tracking-[.3em] text-white/70"><span className="site-blink mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-400" />LIVE</p>
      </div>
      <figcaption>
        <dl className="mt-4 grid gap-px border border-white/10 bg-white/10 sm:grid-cols-3">
          {site.facts.map(([label, value]) => (
            <div key={label} className="bg-black/75 px-3 py-2">
              <dt className="text-[9px] tracking-[.25em] text-white/40">{label}</dt>
              <dd className="mt-0.5 text-xs tracking-wider text-(--accent)">{value}</dd>
            </div>
          ))}
        </dl>
      </figcaption>
    </figure>
  )
}
