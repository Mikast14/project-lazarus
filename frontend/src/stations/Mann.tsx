import { useState } from 'react'
import { MOCK } from '../data'
import { Panel, Station, Table } from '../ui'

const { reports, simulations, history, recommendations } = MOCK.mann
const FIELDS = ['author', 'filed', 'dataset', 'data_class', 'surface_temp_c', 'o2_pct', 'pressure_kpa', 'verdict'] as const
// Storage sectors of the old archive; the pattern is decoration, not a clue.
const SECTORS = Array.from({ length: 96 }, (_, i) => (i * 7 + 3) % 11 < 3)
const intact = Math.round((SECTORS.filter(bad => !bad).length / SECTORS.length) * 100)

export function Mann() {
  const [a, setA] = useState(2)
  const [b, setB] = useState(3)
  const [rev, setRev] = useState<number | null>(null)
  const [ra, rb] = [reports.find(r => r.id === a)!, reports.find(r => r.id === b)!]
  const picker = (value: number, set: (id: number) => void, label: string) => (
    <label className="flex items-center gap-2 text-white/50">
      {label}
      <select value={value} onChange={e => { set(+e.target.value); setRev(null) }} className="border border-white/15 bg-black px-1 py-0.5 text-(--accent)">
        {reports.map(r => <option key={r.id} value={r.id}>#{r.id} {r.title}</option>)}
      </select>
    </label>
  )
  return (
    <Station id="mann" readouts={[['STATION POWER', '11 %'], ['UPTIME', '35 Y 114 D'], ['DAY LENGTH', '67 H'],
      ['ARCHIVE INTACT', `${intact} %`], ['LINK DELAY', '00:09.7'], ['SIGNAL', '31 %']]}>
      <Panel title="RESEARCH REPORT ARCHIVE" tag={`${reports.length} RECORDS`} className="md:col-span-2">
        <Table rows={reports.map(({ id, title, author, filed, dataset, verdict }) => ({ id, title, author, filed, dataset, verdict }))} />
      </Panel>

      <Panel title="LANDING RECOMMENDATIONS" tag="ARCHIVED">
        {recommendations.map(r => (
          <div key={r.issued}>
            <p className="text-[10px] tracking-widest text-white/40">{r.issued} · ISSUED BY {r.issuer.toUpperCase()}</p>
            <p className="mt-2 border-l border-(--accent)/50 pl-3">{r.text}</p>
          </div>
        ))}
      </Panel>

      <Panel title="REPORT COMPARISON" tag="A / B" className="md:col-span-2">
        <div className="mb-3 flex flex-wrap gap-4">{picker(a, setA, 'A')}{picker(b, setB, 'B')}</div>
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="text-white/40"><th /><th className="font-normal">A · #{ra.id}</th><th className="font-normal">B · #{rb.id}</th><th className="font-normal">DELTA</th></tr>
          </thead>
          <tbody>
            {FIELDS.map(f => {
              const [va, vb] = [ra[f], rb[f]]
              const delta = typeof va === 'number' && typeof vb === 'number' ? +(vb - va).toFixed(1) : null
              return (
                <tr key={f} className="border-t border-white/5">
                  <th className="w-36 py-1 font-normal tracking-widest text-white/40 uppercase">{f.replace(/_/g, ' ')}</th>
                  <td>{va}</td>
                  <td className={va !== vb ? 'text-(--accent)' : ''}>{vb}</td>
                  <td className="text-white/60">{delta === null ? (va === vb ? '=' : '≠') : delta > 0 ? `+${delta}` : delta}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>

      <Panel title="MODIFICATION HISTORY" tag={`REPORT #${a}`}>
        <ol className="border-l border-white/15 pl-3">
          {history[a].map(h => (
            <li key={h.rev} className="relative">
              <span aria-hidden className="absolute top-2 -left-[15px] h-1.5 w-1.5 rounded-full bg-(--accent)" />
              <button onClick={() => setRev(h.rev)} aria-expanded={rev === h.rev}
                className={`flex w-full cursor-pointer gap-3 py-1 text-left hover:text-(--accent) ${rev === h.rev ? 'text-(--accent)' : ''}`}>
                <span>REV {h.rev}</span><span className="text-white/60">{h.edited_at}</span><span>{h.editor}</span>
              </button>
              {rev === h.rev && <p className="mb-2 text-white/80">{h.body}</p>}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[10px] tracking-widest text-white/40">{history[a].length} LOGGED REVISIONS</p>
      </Panel>

      <Panel title="HISTORICAL SIMULATION DATABASE" tag="MODEL OUTPUT" className="md:col-span-2">
        <Table rows={simulations} />
      </Panel>

      <Panel title="ARCHIVE STORAGE" tag={`${intact} % INTACT`}>
        <div className="grid grid-cols-16 gap-0.5" role="img" aria-label={`Storage map, ${intact} percent of sectors intact`}>
          {SECTORS.map((bad, i) => <span key={i} className={`aspect-square ${bad ? 'bg-red-400/50 motion-safe:animate-pulse' : 'bg-(--accent)/35'}`} />)}
        </div>
        <p className="mt-3 flex justify-between text-[10px] tracking-widest text-white/40">
          <span><span className="mr-1 inline-block h-1.5 w-1.5 bg-(--accent)/35" />READABLE</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 bg-red-400/50" />FROST DAMAGE</span>
        </p>
      </Panel>
    </Station>
  )
}
