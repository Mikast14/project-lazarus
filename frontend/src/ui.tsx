import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { PLANETS, PROGRESS, VOICES, type LogEntry, type PlanetId, type Row } from './data'
import { sfx } from './sound'
import { Surface } from './Surface'

const CORNERS = ['-top-px -left-px border-t border-l', '-top-px -right-px border-t border-r',
  '-bottom-px -left-px border-b border-l', '-bottom-px -right-px border-b border-r']

export function Panel({ title, tag, className = '', children }: { title: string; tag?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`relative border border-white/10 bg-black/65 ${className}`}>
      {CORNERS.map(c => <span key={c} aria-hidden className={`absolute h-2 w-2 border-(--accent) ${c}`} />)}
      <header className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[10px] tracking-[.25em]">
        <h2 className="text-(--accent)">{title}</h2>
        {tag && <span className="text-white/40">{tag}</span>}
      </header>
      <div className="p-3 text-xs leading-relaxed">{children}</div>
    </section>
  )
}

export const Dot = ({ ok }: { ok: boolean }) =>
  <span aria-hidden className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-300' : 'bg-amber-300'}`} />

export const Bar = ({ pct, className = 'bg-(--accent)' }: { pct: number; className?: string }) =>
  <div className="h-0.5 bg-white/10"><div className={`h-full ${className}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>

/** A dated log, drawn as a timeline. */
export function Log({ entries }: { entries: LogEntry[] }) {
  return (
    <ol className="border-l border-white/15 pl-3">
      {entries.map((e, i) => (
        <li key={i} className="relative pb-2 last:pb-0">
          <span aria-hidden className="absolute top-1.5 -left-[15px] h-1.5 w-1.5 rounded-full bg-(--accent)" />
          <p className="text-[10px] tracking-widest text-white/40"><span className="text-(--accent)">{e.at}</span> · {e.source}</p>
          <p className="text-white/80">{e.text}</p>
        </li>
      ))}
    </ol>
  )
}

export function Table({ rows, mark }: { rows: Row[]; mark?: (row: Row, key: string) => boolean }) {
  if (!rows.length) return <p className="text-white/40">NO DATA</p>
  const keys = Object.keys(rows[0])
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr>{keys.map(k => <th key={k} className="pr-4 pb-1 font-normal tracking-widest text-white/40 uppercase">{k.replace(/_/g, ' ')}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-white/5 hover:bg-white/5">
              {keys.map(k => <td key={k} className={`py-1 pr-4 whitespace-nowrap ${mark?.(row, k) ? 'text-(--accent)' : ''}`}>{row[k]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A recorded message that types itself out, one character at a time, shortly after the screen opens. */
function Voice({ lines }: { lines: string[] }) {
  const text = lines.join('\n')
  const [shown, setShown] = useState(() => (matchMedia('(prefers-reduced-motion: reduce)').matches ? text.length : 0))
  useEffect(() => {
    if (shown >= text.length) return
    // wait for the title to settle before the first character; pause a little at the end of each line
    const wait = shown === 0 ? 1700 : text[shown - 1] === '\n' ? 520 : 30
    const id = setTimeout(() => { if (shown % 3 === 0) sfx.type(); setShown(shown + 1) }, wait)
    return () => clearTimeout(id)
  }, [shown, text])
  const [speaker, ...rest] = text.slice(0, shown).split('\n')
  return (
    <div className="mt-4 min-h-16 max-w-md border-l border-(--accent)/50 pl-3 text-xs leading-relaxed [text-shadow:0_0_12px_#000]">
      <p className="sr-only">{text}</p>{/* screen readers get the whole message at once, not letter by letter */}
      <div aria-hidden>
        <p className="text-[10px] tracking-[.3em] text-(--accent)">{speaker}</p>
        {rest.map((line, i) => <p key={i} className="text-white/80">{line}</p>)}
        {shown < text.length && <span className="site-blink inline-block h-3 w-1.5 bg-(--accent) align-middle" />}
      </div>
    </div>
  )
}

export function Station({ id, readouts, children }: { id: PlanetId; readouts: [label: string, value: string][]; children: ReactNode }) {
  const index = PLANETS.findIndex(x => x.id === id)
  const p = PLANETS[index]
  const transmission = PROGRESS.transmissions.find(t => t.planet === id)
  const [site, setSite] = useState(false)   // false = station data, true = the landing-site camera
  const tab = (on: boolean) => `cursor-pointer border px-3 py-2 text-[10px] tracking-[.3em] ${on ? 'border-(--accent) bg-(--accent)/15 text-(--accent)' : 'border-white/20 bg-black/40 hover:border-(--accent) hover:text-(--accent)'}`
  return (
    <main style={{ '--accent': p.color } as CSSProperties} className={`station absolute inset-0 overflow-y-auto ${id === 'mann' ? 'damaged' : ''}`}>
      {/* darkened edges, so the planet reads as a backdrop */}
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_65%_25%,transparent_25%,#000c_100%)]" />

      {/* hero: the planet shows through here */}
      <header className="relative flex min-h-[40vh] flex-col justify-between p-4 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="text-[10px] tracking-[.4em] text-white/50">
            <p>ENDURANCE NAV-COM // REMOTE LINK</p>
            <p className="mt-1 text-emerald-300/90"><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-300 motion-safe:animate-pulse" />LINK ESTABLISHED</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => setSite(false)} aria-pressed={!site} className={tab(!site)}>STATION DATA</button>
            <button onClick={() => setSite(true)} aria-pressed={site} className={tab(site)}>LANDING SITE</button>
            <button onClick={() => { location.hash = '' }}
              className="cursor-pointer border border-white/20 bg-black/40 px-4 py-2 text-[10px] tracking-[.3em] hover:border-(--accent) hover:text-(--accent)">
              ← RETURN TO GARGANTUA
            </button>
          </div>
        </div>
        <div className="hero-title">
          <p className="text-[10px] tracking-[.5em] text-white/50">STATION 0{index + 1} / 0{PLANETS.length}</p>
          <h1 className="mt-2 text-5xl font-extralight tracking-[.35em] text-(--accent) [text-shadow:0_0_40px_#000] md:text-7xl">{p.name}</h1>
          <p className="mt-3 flex items-center gap-3 text-xs tracking-[.35em] text-white/70 uppercase">
            <span className="h-px w-10 bg-(--accent)" />{p.station}
          </p>
          <Voice lines={VOICES[id]} />
        </div>
      </header>

      <div className="relative bg-linear-to-b from-transparent via-black/55 to-black/80 px-4 pb-8 md:px-8">
        {site ? <Surface id={id} /> : (
          <>
          <dl className="reveal mb-4 grid grid-cols-2 gap-px border border-white/10 bg-white/10 sm:grid-cols-3 xl:grid-cols-6">
            {readouts.map(([label, value]) => (
              <div key={label} className="bg-black/75 px-3 py-2">
                <dt className="text-[9px] tracking-[.25em] text-white/40">{label}</dt>
                <dd className="mt-0.5 text-sm tracking-wider text-(--accent)">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="reveal grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {children}
            <Panel title="ARCHIVED TRANSMISSION" tag={transmission ? 'RECOVERED' : 'MISSING'}>
              {transmission?.text ?? <span className="text-white/40">No verified transmission recovered from this station.</span>}
            </Panel>
          </div>
          </>
        )}
        <p className="mt-6 flex flex-wrap justify-between gap-2 text-[9px] tracking-[.3em] text-white/30">
          <span>REMOTE LINK · READ ONLY</span><span>CLEARANCE: {PROGRESS.role.toUpperCase()}</span><span>LAZARUS MISSION ARCHIVE</span>
        </p>
      </div>
    </main>
  )
}
