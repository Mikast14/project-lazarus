import { useEffect, useState } from 'react'
import { MOCK } from '../data'
import { Dot, Log, Panel, Station, Table } from '../ui'

const { status, telemetry, messages, restricted, wreckage } = MOCK.miller
const PERIOD = 3600
const max = Math.max(...telemetry.map(r => r.wave_height_m))
const RANGE = 1000 // sensor ceiling, metres
const x = (i: number) => 22 + (i / (telemetry.length - 1)) * 216
const y = (m: number) => 76 - (m / max) * 70
const line = telemetry.map((r, i) => `${x(i)},${y(r.wave_height_m)}`).join(' ')
const clock = (s: number) => [s / 3600, (s / 60) % 60, s % 60].map(n => String(Math.floor(n)).padStart(2, '0')).join(':')

export function Miller() {
  const [open, setOpen] = useState(messages[0].id)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const left = PERIOD - ((768 + tick) % PERIOD) // seconds until the next projected crest
  return (
    <Station id="miller" readouts={[['SURFACE', '100 % WATER'], ['GRAVITY', '1.30 G'], ['TIME DILATION', '1 H = 7 Y'],
      ['WAVE PERIOD', `${PERIOD} S`], ['LINK DELAY', '00:04.2'], ['SIGNAL', '12 %']]}>
      <Panel title="STATION STATUS" tag={status.station_id}>
        <p className="mb-3 text-amber-300">{status.state} · LAST CONTACT {status.last_contact}</p>
        <ul className="space-y-1">
          {status.systems.map(s => (
            <li key={s.name} className="flex justify-between border-t border-white/5 pt-1">
              <span className="text-white/60"><Dot ok={s.state === 'ONLINE'} />{s.name}</span>
              <span className={s.state === 'ONLINE' ? 'text-emerald-300' : 'text-amber-300'}>{s.state}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="WAVE HEIGHT" tag={`PEAK ${max} M`} className="xl:col-span-2">
        <svg viewBox="0 0 240 84" className="h-44 w-full" role="img" aria-label={`Wave height rising to ${max} metres, past the ${RANGE} metre sensor range`}>
          {[0, 0.5, 1].map(f => (
            <g key={f}>
              <line x1="22" x2="238" y1={y(max * f)} y2={y(max * f)} stroke="#ffffff14" strokeWidth=".4" />
              <text x="19" y={y(max * f) + 1.5} textAnchor="end" fontSize="4" fill="#ffffff66">{Math.round(max * f)}</text>
            </g>
          ))}
          <line x1="22" x2="238" y1={y(RANGE)} y2={y(RANGE)} stroke="#fcd34d" strokeWidth=".4" strokeDasharray="2 2" />
          <text x="24" y={y(RANGE) - 1.5} fontSize="4" fill="#fcd34d">SENSOR RANGE {RANGE} M</text>
          <polygon points={`${x(0)},76 ${line} ${x(telemetry.length - 1)},76`} fill="var(--accent)" opacity=".12" />
          <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth=".7" />
          {telemetry.map((r, i) => <circle key={i} cx={x(i)} cy={y(r.wave_height_m)} r=".9" fill="var(--accent)" />)}
          <circle cx={x(telemetry.length - 1)} cy={y(max)} r="2.4" fill="none" stroke="#fcd34d" strokeWidth=".5" />
          <text x="22" y="83" fontSize="4" fill="#ffffff66">T+00:00</text>
          <text x="238" y="83" fontSize="4" fill="#ffffff66" textAnchor="end">T+01:10</text>
        </svg>
        <p className="mt-2 mb-1 text-[10px] tracking-widest text-white/40">HULL STRESS PER SAMPLE</p>
        <div className="flex h-8 items-end gap-0.5" role="img" aria-label="Hull stress rising to 100 percent">
          {telemetry.map(r => (
            <div key={r.t} className={`flex-1 ${r.hull_stress_pct > 80 ? 'bg-amber-300' : 'bg-(--accent)/60'}`} style={{ height: `${Math.max(4, r.hull_stress_pct)}%` }} />
          ))}
        </div>
      </Panel>

      <Panel title="WAVE CYCLE" tag="PROJECTED">
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 40 40" className="h-24 w-24 -rotate-90" aria-hidden>
            <circle cx="20" cy="20" r="17" fill="none" stroke="#ffffff14" strokeWidth="1.5" />
            <circle cx="20" cy="20" r="17" fill="none" stroke="var(--accent)" strokeWidth="1.5" pathLength="100" strokeDasharray={`${100 - (left / PERIOD) * 100} 100`} />
          </svg>
          <div>
            <p className="text-[10px] tracking-widest text-white/40">NEXT CREST IN</p>
            <p className="text-xl tracking-widest text-(--accent)" role="timer">{clock(left)}</p>
            <p className="mt-1 text-white/50">Tidal pull from Gargantua. One crest per orbit of the bulge.</p>
          </div>
        </div>
      </Panel>

      <Panel title="EMERGENCY COMMUNICATION LOG" tag={`${restricted} RESTRICTED`}>
        <ul>
          {messages.map(m => (
            <li key={m.id}>
              <button onClick={() => setOpen(m.id)} aria-expanded={open === m.id}
                className={`flex w-full cursor-pointer gap-3 border-t border-white/5 py-1 text-left hover:text-(--accent) ${open === m.id ? 'text-(--accent)' : ''}`}>
                <span className="text-white/40">#{m.id}</span><span>{m.sent_at}</span><span className="text-white/60">{m.sender}</span><span>{m.subject}</span>
              </button>
              {open === m.id && <p className="mb-2 border-l border-(--accent)/50 pl-3 text-white/80">{m.body}</p>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[10px] tracking-widest text-white/40">{restricted} INTERNAL ENTRIES WITHHELD · CLEARANCE REQUIRED</p>
      </Panel>

      <Panel title="WRECKAGE SURVEY" tag="NO SURVIVOR">
        <Log entries={wreckage} />
      </Panel>

      <Panel title="SENSOR DATA VIEWER" tag="LAST 8 SAMPLES">
        <Table rows={telemetry.slice(-8)} mark={(r, k) => k === 'hull_stress_pct' && +r[k] > 80} />
      </Panel>
    </Station>
  )
}
