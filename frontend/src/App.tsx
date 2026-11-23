import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { FLIGHT_S, PLANETS, PROGRESS, type PlanetId } from './data'
import { Intro } from './Intro'
import { Minigame } from './Minigame'
import { Scene } from './Scene'
import { fadeMusic, setMood, setSound, sfx } from './sound'
import { Edmunds } from './stations/Edmunds'
import { Mann } from './stations/Mann'
import { Miller } from './stations/Miller'

const STATIONS = { miller: Miller, mann: Mann, edmunds: Edmunds }
const craftFor = (id: PlanetId) => (id === 'edmunds' ? 'LANDER 1' : 'RANGER 1') // matches the craft Scene flies
// The intro plays once per browser session, only when arriving at the navigation screen, and not for reduced motion.
const INTRO_KEY = 'lazarus-intro-seen'
const wantsIntro = () => {
  if (location.hash.length > 1 || PROGRESS.complete || matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  try { return !sessionStorage.getItem(INTRO_KEY) } catch { return true }   // storage blocked: just play it
}
const fromHash = () => PLANETS.find(p => p.id === location.hash.slice(1))?.id ?? null
// one line of the ending, fading up after `delay` seconds
const reveal = (delay: number) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 1.4, delay } })
const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.8 } }

// Flavour readouts for the navigation display; none of these are clues.
const TARGET: Record<PlanetId, [label: string, value: string][]> = {
  miller: [['RANGE', '0.4 AU'], ['TRANSIT', '02 H 10 M'], ['GRAVITY', '1.30 G'], ['DILATION', '1 H = 7 Y']],
  mann: [['RANGE', '3.1 AU'], ['TRANSIT', '14 M 02 D'], ['GRAVITY', '0.80 G'], ['DILATION', 'NEGLIGIBLE']],
  edmunds: [['RANGE', '5.8 AU'], ['TRANSIT', '19 M 21 D'], ['GRAVITY', '0.98 G'], ['DILATION', 'NEGLIGIBLE']],
}
const SYSTEMS: [name: string, value: string, ok: boolean][] = [
  ['LIFE SUPPORT', 'NOMINAL', true], ['SPIN GRAVITY', '1.00 G', true], ['HULL', 'NOMINAL', true],
  ['FUEL', '41 %', true], ['RANGERS', '2 DOCKED', true], ['STATION LINKS', `${PROGRESS.recovered.length} / 3`, PROGRESS.complete],
]
const RETICLE = ['top-0 left-0 border-t border-l', 'top-0 right-0 border-t border-r', 'bottom-0 left-0 border-b border-l', 'bottom-0 right-0 border-b border-r']
const CORNERS = ['top-3 left-3 border-t border-l', 'top-3 right-3 border-t border-r', 'bottom-3 left-3 border-b border-l', 'bottom-3 right-3 border-b border-r']

// Mission elapsed time. Its own component so the one-second tick does not re-render the scene.
function Clock() {
  const [s, setS] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setS(x => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const t = 71_452_800 + s // seconds since launch
  const two = (n: number) => String(Math.floor(n)).padStart(2, '0')
  return <span role="timer">{Math.floor(t / 86400)} D {two((t / 3600) % 24)}:{two((t / 60) % 60)}:{two(t % 60)}</span>
}

export default function App() {
  const [view, setView] = useState<PlanetId | null>(fromHash)
  const [pending, setPending] = useState<PlanetId | null>(null) // camera is flying there
  const [hovered, setHovered] = useState<PlanetId | null>(null)
  const [notice, setNotice] = useState('')
  const [sound, setSoundOn] = useState(false) // off until the player asks for it
  const [returning, setReturning] = useState(false) // camera is flying back to Gargantua
  const current = useRef(view)
  const [craft, setCraft] = useState('RANGER 1') // which craft the flight caption names
  const [playing, setPlaying] = useState(false) // the Ranger flight simulator is open
  const [intro, setIntro] = useState(wantsIntro) // the opening briefing is playing
  const [settling, setSettling] = useState(false) // camera is flying in after the intro
  const endIntro = useCallback(() => {
    try { sessionStorage.setItem(INTRO_KEY, '1') } catch { /* storage blocked: it will simply play again next time */ }
    setIntro(false); setSettling(true)
    setTimeout(() => setSettling(false), FLIGHT_S * 1000 - 300)
  }, [])
  const [dismissed, setDismissed] = useState(false) // player closed the ending and kept exploring
  const labels = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    let timer = 0
    const sync = () => {
      const next = fromHash()
      if (current.current && !next) {   // leaving a station: hold the HUD back until the flight home is over
        setCraft(craftFor(current.current))
        sfx.flight(FLIGHT_S)
        setReturning(true)
        clearTimeout(timer)
        timer = setTimeout(() => setReturning(false), matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : FLIGHT_S * 1000 - 300)
      }
      current.current = next
      setView(next)
    }
    addEventListener('hashchange', sync)
    return () => { removeEventListener('hashchange', sync); clearTimeout(timer) }
  }, [])

  const select = (id: PlanetId) => {
    if (view || pending || returning) return
    setPending(id)
    setCraft(craftFor(id))
    sfx.select(); sfx.flight(FLIGHT_S)
    fadeMusic(false)   // starts fading as the flight begins, gone by arrival
    // open the station just before the camera settles; near-instant when motion is reduced
    setTimeout(() => { location.hash = id; setPending(null); sfx.arrive() }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : FLIGHT_S * 1000 - 500)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    sfx.deny()
    setNotice('NAV-COM OFFLINE. Verification link not connected.') // design phase: no backend yet
  }

  const home = !view && !pending && !returning && !intro && !settling
  const ending = home && PROGRESS.complete && !dismissed
  const Station = view && STATIONS[view]
  const target = PLANETS.find(p => p.id === hovered)
  const play = () => { if (home && !ending) { document.body.style.cursor = ''; setPlaying(true) } }   // only from the navigation screen
  const hover = (id: PlanetId | null) => { if (id && id !== hovered) sfx.hover(); setHovered(id) }
  useEffect(() => setMood(view), [view, sound])   // the drone changes colour at each station
  useEffect(() => { if (ending) sfx.complete() }, [ending, sound])
  const dest = PLANETS.find(p => p.id === pending)
  // caption shown under the letterbox while the camera is in flight, in either direction
  const flight = dest ? { kicker: 'COURSE PLOTTED', title: dest.name, sub: `${craft} EN ROUTE · ${dest.station.toUpperCase()}`, color: dest.color }
    : returning ? { kicker: 'REMOTE LINK CLOSED', title: 'GARGANTUA', sub: `${craft} RETURNING TO ENDURANCE`, color: '#f1c27d' } : null
  return (
    <div className="relative h-full" style={{ cursor: hovered && home ? 'pointer' : undefined }}>
      <div className="absolute inset-0">
        <Scene focus={view ?? pending} finale={ending} intro={intro} paused={playing} onPlay={play} labels={labels} hovered={hovered} onHover={hover} onSelect={select} />
      </div>

      {/* Planet labels are real buttons, so navigation works by keyboard and without WebGL. */}
      {PLANETS.map((p, i) => {
        const got = PROGRESS.recovered.includes(p.id)
        const on = hovered === p.id
        return (
          // Anchored on the planet's centre; Scene keeps left/top and --r (its radius in pixels) up to date.
          <button key={p.id} ref={el => { labels.current[p.id] = el }} onClick={() => select(p.id)}
            onMouseEnter={() => hover(p.id)} onMouseLeave={() => setHovered(null)}
            onFocus={() => hover(p.id)} onBlur={() => setHovered(null)}
            aria-label={`${p.name}, ${p.station}, ${got ? 'transmission recovered' : 'no response'}`}
            style={{ left: p.at[0], top: p.at[1], '--accent': p.color, '--r': '40px' } as CSSProperties}
            className={`ui absolute cursor-pointer outline-none transition-opacity duration-500 ${home && !ending ? 'delay-500' : 'pointer-events-none opacity-0'}`}>
            {/* targeting brackets around the planet */}
            <span aria-hidden className={`absolute size-[calc(var(--r)*2+22px)] -translate-x-1/2 -translate-y-1/2 transition duration-300 ${on ? 'scale-100 opacity-100' : 'scale-125 opacity-0'}`}>
              {RETICLE.map(c => <span key={c} className={`absolute h-3 w-3 border-(--accent) ${c}`} />)}
            </span>
            <span className="absolute top-[calc(var(--r)+6px)] left-0 block -translate-x-1/2 text-center whitespace-nowrap">
              <span aria-hidden className={`mx-auto block w-px bg-(--accent)/60 transition-all duration-300 ${on ? 'h-5' : 'h-2'}`} />
              <span className="mt-1 flex items-center justify-center gap-2 text-[11px] tracking-[.4em]">
                <span className="text-[9px] tracking-widest text-white/35">0{i + 1}</span>
                <span className="text-(--accent)">{p.name}</span>
                <span className={`h-1.5 w-1.5 rounded-full ${got ? 'bg-emerald-300' : 'bg-amber-300 motion-safe:animate-pulse'}`} />
              </span>
              <span className={`mt-0.5 block text-[9px] tracking-[.25em] ${got ? 'text-emerald-300' : 'text-amber-300/80'}`}>{got ? 'TRANSMISSION RECOVERED' : 'NO RESPONSE'}</span>
              <span className={`block overflow-hidden text-[9px] tracking-[.25em] text-white/50 transition-all duration-300 ${on ? 'max-h-10 opacity-100' : 'max-h-0 opacity-0'}`}>
                <span className="mt-1 block border-t border-(--accent)/30 pt-1">{p.station.toUpperCase()}</span>
                <span className="block">{TARGET[p.id].slice(0, 2).map(([k, v]) => `${k} ${v}`).join(' · ')}</span>
              </span>
            </span>
          </button>
        )
      })}

      <button onClick={() => { setSound(!sound); setSoundOn(!sound) }} aria-pressed={sound}
        className={`ui absolute bottom-3 left-1/2 z-20 -translate-x-1/2 cursor-pointer border bg-black/50 px-3 py-1 text-[9px] tracking-[.3em] ${sound ? 'border-amber-200/50 text-amber-200' : 'border-white/20 text-white/50 hover:text-white/80'}`}>
        SOUND {sound ? 'ON' : 'OFF'}
      </button>

      {playing && <Minigame onExit={() => setPlaying(false)} />}

      <AnimatePresence>
        {intro && <Intro key="intro" onDone={endIntro} />}
        {home && !ending && (
          <motion.div key="hud" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 1.2, delay: 0.5 } }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }} className="ui pointer-events-none absolute inset-0 flex flex-col justify-between p-6 md:p-9">
            {CORNERS.map(c => <span key={c} aria-hidden className={`absolute h-4 w-4 border-white/30 ${c}`} />)}

            <div className="flex items-start justify-between gap-4 text-[10px] tracking-[.3em] text-white/50">
              <div>
                <p className="text-white/80">ENDURANCE // NAV-COM</p>
                <p>GARGANTUA · ORBIT STABLE</p>
                <p className="mt-2">MET <span className="text-amber-200"><Clock /></span></p>
              </div>

              {/* bearing tape */}
              <svg viewBox="0 0 240 22" className="hidden w-72 md:block" aria-hidden>
                {Array.from({ length: 25 }, (_, i) => (
                  <line key={i} x1={i * 10} x2={i * 10} y1="0" y2={i % 6 === 0 ? 8 : 4} stroke="#ffffff" strokeOpacity={i % 6 === 0 ? 0.6 : 0.25} strokeWidth=".6" />
                ))}
                {['240', '270', '300', '330', '000'].map((b, i) => <text key={b} x={i * 60} y="18" fontSize="6" fill="#ffffff80" textAnchor="middle">{b}</text>)}
                <path d="M120 10 l-3 5 h6 z" fill="#fde68a" />
              </svg>

              <div className="text-right">
                <p>ORBIT RADIUS <span className="text-white/80">17.0 RS</span></p>
                <p>VELOCITY <span className="text-white/80">0.17 C</span></p>
                <p className="mt-2">TIME DILATION <span className="text-amber-200">1 : 1.03</span></p>
              </div>
            </div>

            <div className="flex flex-1 items-center justify-between gap-4">
              <ul className="mb-8 hidden w-48 self-end border-l border-white/15 pl-3 text-[10px] tracking-[.2em] md:block">
                <li className="mb-2 tracking-[.3em] text-white/40">SHIP SYSTEMS</li>
                {SYSTEMS.map(([name, value, ok]) => (
                  <li key={name} className="flex justify-between py-0.5">
                    <span className="text-white/50">{name}</span>
                    <span className={ok ? 'text-white/80' : 'text-amber-300'}>{value}</span>
                  </li>
                ))}
                <li className="mt-2">{/* same as clicking the ship; here so it can be reached by keyboard */}
                  <button onClick={play} className="pointer-events-auto cursor-pointer border border-white/20 px-2 py-1 tracking-[.25em] text-white/70 hover:border-amber-200 hover:text-amber-200">▶ FLIGHT SIMULATOR</button>
                </li>
              </ul>

              <div aria-live="polite" className={`w-52 border-r border-white/15 pr-3 text-right text-[10px] tracking-[.2em] transition-opacity duration-300 ${target ? 'opacity-100' : 'opacity-0'}`}>
                {target && (
                  <>
                    <p className="tracking-[.3em] text-white/40">TARGET LOCK</p>
                    <p className="mb-2 text-sm tracking-[.35em]" style={{ color: target.color }}>{target.name}</p>
                    {TARGET[target.id].map(([label, value]) => (
                      <p key={label} className="flex justify-between py-0.5"><span className="text-white/50">{label}</span><span className="text-white/80">{value}</span></p>
                    ))}
                    <p className="mt-2 text-white/40">SELECT TO OPEN REMOTE LINK</p>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="mb-2 text-[10px] tracking-[.4em] text-white/40">{PROGRESS.complete ? 'STATUS // ALL STATIONS RECOVERED' : 'STATUS // THREE STATIONS SILENT'}</p>
                <h1 className="text-2xl font-extralight tracking-[.45em] text-white md:text-4xl">
                  {PROGRESS.complete ? 'MISSION COMPLETE' : 'MISSION LAZARUS'}
                </h1>
                <p className="mt-3 max-w-md text-xs leading-relaxed tracking-widest text-white/60">
                  {PROGRESS.complete
                    ? <>All research transmissions recovered.<br />Final destination confirmed: <span className="text-emerald-300">Edmunds' Planet</span>.</>
                    : 'Three lost transmissions. Three possible worlds. One final destination.'}
                </p>
              </div>

              <div className="pointer-events-auto w-80 border border-white/10 bg-black/40 p-3">
                <p className="flex justify-between text-[10px] tracking-[.3em] text-white/50">
                  <span>TRANSMISSIONS</span><span className="text-amber-200">{PROGRESS.recovered.length} / {PLANETS.length}</span>
                </p>
                <ol className="my-3 space-y-1.5">
                  {PLANETS.map((p, i) => {
                    const got = PROGRESS.recovered.includes(p.id)
                    return (
                      <li key={p.id} className="flex items-center gap-2 text-[10px] tracking-[.2em]">
                        <span className="text-white/30">0{i + 1}</span>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: got ? p.color : 'transparent', boxShadow: `0 0 0 1px ${p.color}` }} />
                        <span className="w-20" style={{ color: p.color }}>{p.name}</span>
                        <span className="h-px flex-1" style={{ background: got ? p.color : '#ffffff22' }} />
                        <span className={got ? 'text-emerald-300' : 'text-white/40'}>{got ? 'RECOVERED' : 'MISSING'}</span>
                      </li>
                    )
                  })}
                </ol>
                <form onSubmit={submit} className="flex gap-2">
                  <input aria-label="Transmission key" placeholder="TRANSMISSION KEY" autoComplete="off" spellCheck={false}
                    className="min-w-0 flex-1 border border-white/15 bg-transparent px-2 py-1 text-[11px] tracking-wider placeholder:text-white/25" />
                  <button className="cursor-pointer border border-amber-200/40 px-2 text-[10px] tracking-[.2em] text-amber-200 hover:bg-amber-200/10">VERIFY</button>
                </form>
                <p role="status" className="mt-2 min-h-4 text-[10px] text-amber-300/80">{notice}</p>
              </div>
            </div>
          </motion.div>
        )}
        {ending && (
          <motion.div key="finale" {...fade} className="ui pointer-events-none absolute inset-0">
            {['top-0', 'bottom-0'].map(edge => (
              <motion.div key={edge} className={`absolute inset-x-0 bg-black ${edge}`} initial={{ height: 0 }} animate={{ height: '12vh' }}
                transition={{ duration: 1.6, ease: 'easeInOut' }} />
            ))}
            <div role="status" className="absolute inset-x-0 bottom-[14vh] px-6 text-center">
              <motion.p {...reveal(1)} className="text-[10px] tracking-[.5em] text-amber-200/80">TRANSMISSIONS 3 / 3</motion.p>
              <motion.h1 className="mt-3 text-3xl font-extralight text-white md:text-5xl" initial={{ letterSpacing: '1.4em', opacity: 0 }}
                animate={{ letterSpacing: '0.5em', opacity: 1 }} transition={{ duration: 3.2, delay: 1.6, ease: 'easeOut' }}>MISSION COMPLETE</motion.h1>
              <motion.div className="mx-auto mt-5 h-px bg-amber-200/60" initial={{ width: 0 }} animate={{ width: '18rem' }} transition={{ duration: 1.8, delay: 3.4 }} />
              <motion.p {...reveal(4.6)} className="mt-5 text-xs tracking-[.3em] text-white/70">All research transmissions recovered.</motion.p>
              <motion.p {...reveal(6)} className="mt-2 text-xs tracking-[.3em] text-white/70">
                Final destination confirmed: <span className="text-emerald-300">Edmunds' Planet</span>.
              </motion.p>
              <motion.ul {...reveal(7.6)} className="mt-6 flex justify-center gap-8 text-[10px] tracking-[.3em]">
                {PLANETS.map(p => <li key={p.id} style={{ color: p.color }}>✓ {p.name}</li>)}
              </motion.ul>
              <motion.p {...reveal(9)} className="mt-6 text-[10px] tracking-[.4em] text-white/40">ENDURANCE · COURSE SET · EDMUNDS</motion.p>
              <motion.button {...reveal(10.5)} onClick={() => setDismissed(true)}
                className="pointer-events-auto mt-6 cursor-pointer border border-white/20 px-4 py-2 text-[10px] tracking-[.3em] text-white/70 hover:border-amber-200 hover:text-amber-200">
                CONTINUE EXPLORING
              </motion.button>
            </div>
          </motion.div>
        )}
        {flight && (
          <motion.div key={flight.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
            className="ui pointer-events-none absolute inset-0" style={{ '--accent': flight.color } as CSSProperties}>
            {/* letterbox bars */}
            {['top-0', 'bottom-0'].map(edge => (
              <motion.div key={edge} className={`absolute inset-x-0 bg-black ${edge}`} initial={{ height: 0 }} animate={{ height: '11vh' }}
                transition={{ duration: 0.9, ease: 'easeInOut' }} />
            ))}
            <div role="status" className="absolute inset-x-0 bottom-[15vh] text-center">
              <p className="text-[10px] tracking-[.5em] text-white/50">{flight.kicker}</p>
              <motion.p className="mt-2 text-3xl font-extralight text-(--accent)" initial={{ letterSpacing: '1.2em', opacity: 0 }}
                animate={{ letterSpacing: '0.6em', opacity: 1 }} transition={{ duration: 1.6, ease: 'easeOut' }}>{flight.title}</motion.p>
              <p className="mt-2 text-[10px] tracking-[.4em] text-white/50">{flight.sub}</p>
              <div className="mx-auto mt-4 h-px w-64 bg-white/15">
                <motion.div className="h-full bg-(--accent)" initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: FLIGHT_S - 0.6, ease: 'linear' }} />
              </div>
            </div>
          </motion.div>
        )}
        {Station && (
          <motion.div key={view} {...fade} className="ui absolute inset-0">
            <Station />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
