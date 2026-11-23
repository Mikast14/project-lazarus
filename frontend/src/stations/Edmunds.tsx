import { MOCK, PROGRESS } from '../data'
import { Bar, Dot, Log, Panel, Station, Table } from '../ui'

const { atmosphere, sites, camp, recommendation: rec } = MOCK.edmunds
const ok = (good: boolean) => (good ? 'text-emerald-300' : 'text-amber-300')
const MIX = [['N2', 78.6, 'bg-(--accent)/40'], ['O2', 19.8, 'bg-(--accent)'], ['OTHER', 1.6, 'bg-white/40']] as const
const SPOTS: Record<string, [number, number]> = { 'EDM-A': [84, 30], 'EDM-B': [118, 62], 'EDM-C': [70, 84] }

export function Edmunds() {
  const admin = PROGRESS.role === 'admin'
  return (
    <Station id="edmunds" readouts={[['GRAVITY', '0.98 G'], ['DAY LENGTH', '26.4 H'], ['GROUND BEACON', 'ACTIVE'],
      ['STATION POWER', '96 %'], ['LINK DELAY', '00:02.1'], ['SIGNAL', '88 %']]}>
      <Panel title="ATMOSPHERIC ANALYSIS" tag="LIVE" className="xl:col-span-2">
        <div className="mb-4 flex h-2 gap-px" role="img" aria-label="Composition: nitrogen 78.6, oxygen 19.8, other 1.6 percent">
          {MIX.map(([name, pct, cls]) => <div key={name} className={cls} style={{ width: `${pct}%` }} />)}
        </div>
        <p className="mb-4 flex gap-4 text-[10px] tracking-widest text-white/50">
          {MIX.map(([name, pct, cls]) => <span key={name}><span className={`mr-1 inline-block h-1.5 w-1.5 ${cls}`} />{name} {pct} %</span>)}
        </p>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {atmosphere.map(m => (
            <div key={m.metric}>
              <p className="flex justify-between"><span className="text-white/60"><Dot ok />{m.metric}</span><span>{m.value} {m.unit}</span></p>
              <div className="mt-1"><Bar pct={m.fill} /></div>
              <p className="mt-1 text-[10px] tracking-widest text-white/40">NOMINAL {m.nominal}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="FINAL LANDING RECOMMENDATION" tag={rec.updated}>
        <p className="text-2xl font-light tracking-[.3em] text-(--accent)">{rec.site_id}</p>
        <p className="mb-3 text-white/60">{sites.find(s => s.id === rec.site_id)?.name}</p>
        <dl className="space-y-1">
          {([['SOURCE', rec.source, null], ['CHECKSUM', rec.checksum, null],
            ['INTEGRITY', rec.integrity, rec.integrity === 'VALID'], ['ORIGIN', rec.origin, rec.origin === 'TRUSTED']] as const).map(([k, v, good]) => (
            <div key={k} className="flex justify-between border-t border-white/5 pt-1">
              <dt className="tracking-widest text-white/40">{k}</dt>
              <dd className={good === null ? 'text-white/70' : ok(good)}>{good !== null && <Dot ok={good} />}{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="LANDING LOCATION DATABASE" tag={`${sites.length} SITES`} className="md:col-span-2">
        <Table rows={sites} mark={(r, k) => k === 'id' && r.id === rec.site_id} />
      </Panel>

      <Panel title="SITE MAP" tag="ORBITAL VIEW">
        <svg viewBox="0 0 200 116" className="w-full" role="img" aria-label="Map of the three candidate landing sites">
          <circle cx="100" cy="58" r="50" fill="var(--accent)" opacity=".07" stroke="var(--accent)" strokeWidth=".4" />
          {[18, 34, 50].map(rx => <ellipse key={rx} cx="100" cy="58" rx={rx} ry="50" fill="none" stroke="#ffffff14" strokeWidth=".3" />)}
          {[-30, 0, 30].map(dy => <line key={dy} x1={100 - Math.sqrt(2500 - dy * dy)} x2={100 + Math.sqrt(2500 - dy * dy)} y1={58 + dy} y2={58 + dy} stroke="#ffffff14" strokeWidth=".3" />)}
          {sites.map(s => {
            const [sx, sy] = SPOTS[s.id]
            return (
              <g key={s.id}>
                <circle cx={sx} cy={sy} r="1.6" fill="var(--accent)" />
                {s.id === rec.site_id && <circle cx={sx} cy={sy} r="5" fill="none" stroke="#fcd34d" strokeWidth=".5" strokeDasharray="2 1.5" />}
                <text x={sx + 8} y={sy + 1.5} fontSize="5" fill="#ffffffaa">{s.id}</text>
                <text x={sx + 8} y={sy + 7} fontSize="4" fill="#ffffff66">{s.name.toUpperCase()}</text>
              </g>
            )
          })}
        </svg>
        <p className="mt-1 text-[10px] tracking-widest text-white/40"><span className="text-amber-300">◌</span> CURRENT RECOMMENDATION</p>
      </Panel>

      <Panel title="SURFACE CAMP LOG" tag="NO LIFE SIGNS">
        <Log entries={camp} />
      </Panel>

      <Panel title="ADMINISTRATION" tag={admin ? 'UNLOCKED' : 'RESTRICTED'}>
        {admin ? (
          <form onSubmit={e => e.preventDefault()} className="space-y-2">
            <label className="block text-white/50">SITE
              <select className="mt-1 block w-full border border-white/15 bg-black px-2 py-1 text-(--accent)">
                {sites.map(s => <option key={s.id}>{s.id}</option>)}
              </select>
            </label>
            <label className="block text-white/50">SOURCE
              <input className="mt-1 block w-full border border-white/15 bg-transparent px-2 py-1" />
            </label>
            <button className="cursor-pointer border border-(--accent)/50 px-3 py-1 tracking-[.2em] text-(--accent)">UPDATE RECOMMENDATION</button>
          </form>
        ) : (
          <p className="text-white/50">ADMIN CLEARANCE REQUIRED.<br />Signed in as <span className="text-white/80">{PROGRESS.role.toUpperCase()}</span>. Recommendation controls are hidden for this role.</p>
        )}
      </Panel>
    </Station>
  )
}
