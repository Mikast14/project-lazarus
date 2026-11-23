export type PlanetId = 'miller' | 'mann' | 'edmunds'

/** How much the interface layers are enlarged on big displays (--ui-zoom in index.css). Re-read after a resize. */
let zoom = 0
addEventListener('resize', () => { zoom = 0 })
export const uiZoom = () => (zoom ||= Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')) || 1)

/** Length of the camera flight between Gargantua and a planet, in seconds. */
export const FLIGHT_S = 3.4

export const PLANETS = [
  { id: 'miller', name: 'MILLER', station: 'Ocean Research Station', color: '#4f9dff', dark: '#0a2452',
    pos: [-6.5, 2.6, 4], r: 0.75, at: ['20%', '30%'] },
  { id: 'mann', name: 'MANN', station: 'Frozen Research Station', color: '#e6eef5', dark: '#6f7c88',
    pos: [8, 3, 2], r: 0.65, at: ['78%', '26%'] },
  { id: 'edmunds', name: 'EDMUNDS', station: 'Planetary Landing System', color: '#86b08a', dark: '#3d4a2e',
    pos: [5.4, -1.6, 6], r: 0.7, at: ['80%', '60%'] },
] as const satisfies readonly {
  id: PlanetId; name: string; station: string; color: string; dark: string
  pos: readonly [number, number, number]; r: number; at: readonly [string, string]
}[]

export type Row = Record<string, string | number>

// The last words recorded at each station, typed out when its screen opens. First line is the speaker.
export const VOICES: Record<PlanetId, string[]> = {
  miller: ['DR. MILLER // T+00:04', 'Touchdown. The water is only knee deep. Starting the survey.', 'T+01:07. Those are not mountains.'],
  mann: ['DR. MANN // DAY 1', 'The surface is here. Cold, but I can work with cold.', 'DAY 2,190. If you are hearing this, you came. Thank you.'],
  edmunds: ['DR. EDMUNDS // DAY 1', 'The air is good. I am taking the helmet off.', 'DAY 93. Going to sleep now. Come and find me.'],
}

export type LogEntry = { at: string; source: string; text: string }

export type Progress = { role: string; recovered: PlanetId[]; transmissions: { planet: PlanetId; text: string }[]; complete: boolean }

// shortcut: design phase runs on this static placeholder data (no flags, no hidden records);
// replace MOCK lookups with fetch('/api' + path) when the Flask backend is wired in.
const done = location.search.includes('complete') // ?complete previews the end screen
export const PROGRESS: Progress = {
  role: 'crew',
  recovered: done ? ['miller', 'mann', 'edmunds'] : [],
  transmissions: [],
  complete: done,
}

export const MOCK = {
  miller: {
    status: { station_id: 'MLR-0417', state: 'NO RESPONSE', last_contact: 'T+01:10',
      systems: [{ name: 'Beacon', state: 'LOOP' }, { name: 'Wave array', state: 'OUT OF RANGE' },
        { name: 'Hull', state: 'BREACHED' }, { name: 'Comms archive', state: 'ONLINE' }] },
    telemetry: Array.from({ length: 24 }, (_, i) => ({
      t: i, wave_height_m: +(0.4 + (i / 23) ** 6 * 1200).toFixed(1), period_s: 3600,
      hull_stress_pct: +Math.min(100, 2 + (i / 23) ** 5 * 140).toFixed(1) })),
    restricted: 2,
    // What the Endurance found: Miller landed only hours before, by her own clock, and did not survive the first wave.
    wreckage: [
      { at: 'SCAN 01', source: 'RANGER 1', text: 'Beacon located in shallow water. It is repeating her first transmission on a loop.' },
      { at: 'SCAN 02', source: 'RANGER 1', text: 'Debris field. Lander hull fragments scattered across the shallows. No intact structure.' },
      { at: 'SCAN 03', source: 'CASE', text: 'Flight recorder recovered. Final entry logged 01:10 after touchdown.' },
      { at: 'SCAN 04', source: 'CASE', text: 'Elapsed since touchdown: a few hours here. More than a decade on Earth.' },
      { at: 'SCAN 05', source: 'RANGER 1', text: 'No survivor located. Search ended: next wave inbound.' },
    ],
    messages: [
      { id: 1, sent_at: 'T+00:04', sender: 'MILLER', subject: 'Touchdown', body: 'Landed in shallow water. Knee deep everywhere. Beginning survey.' },
      { id: 2, sent_at: 'T+00:31', sender: 'MILLER', subject: 'Survey 1', body: 'Water, organics present. No land sighted. Horizon looks mountainous.' },
      { id: 3, sent_at: 'T+00:52', sender: 'STATION', subject: 'Automated', body: 'Wave sensor array online. Baseline period 3600 s.' },
      { id: 5, sent_at: 'T+01:08', sender: 'STATION', subject: 'Automated', body: 'Hull stress warning. Wave height exceeds sensor range.' },
      { id: 7, sent_at: 'T+01:10', sender: 'STATION', subject: 'Automated', body: 'Beacon switched to loop mode. No operator input.' },
    ],
  },
  mann: {
    reports: [
      { id: 1, title: 'Orbital survey', author: 'Mann', filed: '2067-03-02', dataset: 'DS-101', data_class: 'measurement', surface_temp_c: -92, o2_pct: 0.2, pressure_kpa: 38, verdict: 'Inconclusive' },
      { id: 2, title: 'Ice core analysis', author: 'KIPP', filed: '2067-05-19', dataset: 'DS-107', data_class: 'measurement', surface_temp_c: -95, o2_pct: 0.1, pressure_kpa: 36, verdict: 'Not habitable' },
      { id: 3, title: 'Surface habitability assessment', author: 'Mann', filed: '2067-09-30', dataset: 'DS-114', data_class: 'measurement', surface_temp_c: 14, o2_pct: 20.4, pressure_kpa: 96, verdict: 'Habitable - landing recommended' },
      { id: 4, title: 'Atmospheric composition', author: 'KIPP', filed: '2067-06-11', dataset: 'DS-109', data_class: 'measurement', surface_temp_c: -89, o2_pct: 0.3, pressure_kpa: 37, verdict: 'Ammonia / chlorine - toxic' },
    ],
    simulations: [
      { id: 'SIM-2067-01', run_date: '2067-01-12', model: 'baseline climate', surface_temp_c: -96, o2_pct: 0.1, pressure_kpa: 35, verdict: 'Not habitable' },
      { id: 'SIM-2067-02', run_date: '2067-01-20', model: 'seasonal maximum', surface_temp_c: -71, o2_pct: 0.2, pressure_kpa: 39, verdict: 'Not habitable' },
      { id: 'SIM-2067-03', run_date: '2067-02-03', model: 'volcanic outgassing', surface_temp_c: -80, o2_pct: 0.4, pressure_kpa: 44, verdict: 'Not habitable' },
      { id: 'SIM-2067-04', run_date: '2067-02-15', model: 'terraforming projection, +400 years', surface_temp_c: 14, o2_pct: 20.4, pressure_kpa: 96, verdict: 'Habitable (projected)' },
    ],
    history: {
      1: [{ rev: 1, edited_at: '2067-06-11', editor: 'KIPP', body: 'Filed. No changes since.' }],
      2: [{ rev: 1, edited_at: '2067-06-11', editor: 'KIPP', body: 'Filed. No changes since.' }],
      3: [{ rev: 1, edited_at: '2067-06-20', editor: 'KIPP', body: 'Draft created. Awaiting ground measurements.' },
        { rev: 2, edited_at: '2067-07-02', editor: 'Mann', body: 'Preliminary: frozen cloud layer. No surface located yet.' },
        { rev: 5, edited_at: '2067-09-30', editor: 'Mann', body: 'Final. Habitable - landing recommended.' }],
      4: [{ rev: 1, edited_at: '2067-06-11', editor: 'KIPP', body: 'Filed. No changes since.' }],
    } as Record<number, { rev: number; edited_at: string; editor: string; body: string }[]>,
    recommendations: [{ issued: '2067-09-30', issuer: 'Mann', text: 'LANDING RECOMMENDED. Surface habitable. Bring the colony.' }],
  },
  edmunds: {
    atmosphere: [
      { metric: 'Oxygen', value: 19.8, unit: '%', nominal: '19.5 - 23.5', fill: 62 },
      { metric: 'Nitrogen', value: 78.6, unit: '%', nominal: '70 - 80', fill: 86 },
      { metric: 'CO2', value: 0.09, unit: '%', nominal: '< 0.5', fill: 18 },
      { metric: 'Pressure', value: 94, unit: 'kPa', nominal: '80 - 110', fill: 47 },
      { metric: 'Surface temp', value: 11, unit: 'C', nominal: '0 - 30', fill: 37 },
      { metric: 'Radiation', value: 0.4, unit: 'mSv/day', nominal: '< 1.0', fill: 40 },
    ],
    sites: [
      { id: 'EDM-A', name: 'Northern shelf', o2_pct: 19.8, pressure_kpa: 94, temp_c: 11, radiation_msv: 0.4, survey: 'Ground beacon confirmed' },
      { id: 'EDM-B', name: 'Equatorial dunes', o2_pct: 20.9, pressure_kpa: 97, temp_c: 47, radiation_msv: 2.1, survey: 'Orbital estimate only' },
      { id: 'EDM-C', name: 'Tidal basin', o2_pct: 17.2, pressure_kpa: 121, temp_c: 3, radiation_msv: 0.6, survey: 'Seasonal flooding - unsuitable' },
    ],
    // Edmunds reached the surface and set up camp. He did not live to see anyone arrive.
    camp: [
      { at: 'DAY 001', source: 'EDMUNDS', text: 'Down safe. Air is breathable. Helmet off for the first time in two years.' },
      { at: 'DAY 014', source: 'EDMUNDS', text: 'Hab pod assembled. Soil and water samples promising. Beacon set to positive.' },
      { at: 'DAY 093', source: 'EDMUNDS', text: 'Entering cryo-sleep to wait for the Endurance. Beacon will keep transmitting.' },
      { at: 'AUTO', source: 'GROUND BEACON', text: 'Rockslide detected. Hab pod partly buried. Cryo-bed power lost.' },
      { at: 'AUTO', source: 'GROUND BEACON', text: 'No life signs at camp. Beacon running on reserve power.' },
    ],
    recommendation: { site_id: 'EDM-C', source: 'relay-unknown-7', checksum: '9f2c41d07ab3…e61b', updated: '2069-02-11', integrity: 'VALID', origin: 'UNTRUSTED' },
  },
}
