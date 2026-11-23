// All sound is synthesised in the browser with Web Audio: no audio files to ship, works offline in the VM.
// Nothing plays until the player turns sound on (browsers also require a click before audio may start).
import type { PlanetId } from './data'

let ctx: AudioContext | undefined
let master: GainNode, hall: ConvolverNode, filter: BiquadFilterNode
const voices: OscillatorNode[] = []
let on = false
let ticker = 0
let organ: GainNode   // the organ's volume, silenced when the player supplies their own music
let music: HTMLAudioElement | undefined
const MUSIC_VOLUME = 0.55
let musicWanted = true   // false while the player is away at a planet
let fader = 0
let moodCents = 0   // current station's pitch offset, so one-off notes can follow the organ

/** Send a source to the speakers and, by `wet`, into the reverb hall. */
function route(node: AudioNode, wet = 0.5, dry = 1) {
  const d = ctx!.createGain(), w = ctx!.createGain()
  d.gain.value = dry; w.gain.value = wet
  node.connect(d); d.connect(master); node.connect(w); w.connect(hall)
}

function init() {
  ctx = new AudioContext()
  const glue = ctx.createDynamicsCompressor()   // keeps the big hits from clipping
  glue.connect(ctx.destination)
  master = ctx.createGain(); master.gain.value = 0; master.connect(glue)

  // a large hall: four seconds of decaying noise as the impulse response
  const len = ctx.sampleRate * 4, impulse = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
  }
  hall = ctx.createConvolver(); hall.buffer = impulse
  const tail = ctx.createGain(); tail.gain.value = 0.7
  hall.connect(tail); tail.connect(master)

  // The drone is a pipe organ holding slow chords. Each pipe is one oscillator whose waveform is a
  // stack of harmonics (like pulling several organ stops), and every note is doubled by a second
  // rank tuned a few cents sharp, which gives the slow shimmer of a real instrument.
  const pipe = ctx.createPeriodicWave(new Float32Array(10), new Float32Array([0, 1, 0.55, 0.38, 0.22, 0.14, 0.09, 0.06, 0.04, 0.02]))
  filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1400
  const drone = organ = ctx.createGain(); drone.gain.value = 0.085
  filter.connect(drone); route(drone, 0.9)
  // pedal note, then four manual notes; one row per chord, changing every eleven seconds
  const CHORDS = [
    [55, 110, 130.81, 164.81, 220],      // A minor
    [43.65, 110, 130.81, 174.61, 220],   // F major
    [65.41, 98, 130.81, 164.81, 196],    // C major
    [49, 98, 123.47, 146.83, 196],       // G major
  ]
  const LEVELS = [0.55, 0.3, 0.26, 0.26, 0.2]
  const keys = CHORDS[0].map((hz, i) => {
    const gain = ctx!.createGain(); gain.gain.value = LEVELS[i]; gain.connect(filter)
    const ranks = [0, 5].map(cents => {
      const osc = ctx!.createOscillator()
      osc.setPeriodicWave(pipe); osc.frequency.value = hz; osc.detune.value = cents
      osc.connect(gain); osc.start(); voices.push(osc)
      return osc
    })
    return { gain, ranks }
  })
  // One clock drives both the chords and a quiet repeating figure high above them: six notes taken
  // from the current chord, played four times before the chord changes. The figure is original to
  // this project; it borrows the feel of film organ minimalism, not any film's melody.
  const FIGURE = [1, 3, 4, 3, 2, 3]   // which chord notes, in order
  let step = 0
  setInterval(() => {
    if (!on || music) return
    const now = ctx!.currentTime
    if (step > 0 && step % 24 === 0) {   // lift the keys, move to the next chord, press again
      const chord = CHORDS[(step / 24) % CHORDS.length]
      keys.forEach(({ gain, ranks }, i) => {
        if (ranks[0].frequency.value === chord[i]) return   // a held note stays down
        gain.gain.setTargetAtTime(0, now, 0.06)
        for (const osc of ranks) osc.frequency.setValueAtTime(chord[i], now + 0.3)
        gain.gain.setTargetAtTime(LEVELS[i], now + 0.32, 0.09)
      })
    }
    const chord = CHORDS[Math.floor(step / 24) % CHORDS.length], k = step % 24
    // two octaves up, following the station's pitch, swelling gently across each chord
    tone(chord[FIGURE[k % 6]] * 4 * 2 ** (moodCents / 1200), 1.1, { volume: 0.009 + 0.012 * Math.sin((Math.PI * k) / 24), attack: 0.02, wet: 1 })
    step++
  }, 11000 / 24)
  const lfo = (hz: number, depth: number, target: AudioParam) => {
    const osc = ctx!.createOscillator(), gain = ctx!.createGain()
    osc.frequency.value = hz; gain.gain.value = depth
    osc.connect(gain); gain.connect(target); osc.start()
  }
  lfo(5.4, 0.006, drone.gain)        // tremulant: the organ's gentle flutter
  lfo(0.045, 0.02, drone.gain)       // slow swell, like the swell pedal

  // a faint high shimmer that lives only in the hall
  for (const [hz, rate] of [[880, 0.13], [1318.5, 0.09]]) {
    const osc = ctx.createOscillator(), gain = ctx.createGain()
    osc.frequency.value = hz; gain.gain.value = 0.006
    lfo(rate, 0.006, gain.gain)
    osc.connect(gain); gain.connect(hall); osc.start()
  }

  // Optional: the player's own background music. If frontend/public/music.mp3 exists it loops quietly
  // and replaces the organ; the sound effects still play over it. The project ships no music file.
  fetch('music.mp3', { method: 'HEAD' }).then(res => {
    if (!res.ok || !res.headers.get('content-type')?.startsWith('audio')) return   // dev server answers missing files with the page itself
    music = new Audio('music.mp3'); music.loop = true; music.volume = musicWanted ? MUSIC_VOLUME : 0
    organ.gain.setTargetAtTime(0, ctx!.currentTime, 1)
    if (on && musicWanted) void music.play().catch(() => {})
  }).catch(() => {})

  // every button and dropdown gets a soft tick
  addEventListener('click', e => { if ((e.target as Element).closest?.('button, select')) tone(1500, 0.04, { type: 'square', volume: 0.02, wet: 0.3 }) })
}

type Tone = { type?: OscillatorType; volume?: number; delay?: number; attack?: number; wet?: number }
function tone(hz: number, seconds: number, { type = 'sine', volume = 0.1, delay = 0, attack = 0.01, wet = 0.6 }: Tone = {}) {
  if (!ctx || !on) return
  const t = ctx.currentTime + delay, osc = ctx.createOscillator(), gain = ctx.createGain()
  osc.type = type; osc.frequency.value = hz
  gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(volume, t + attack); gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
  osc.connect(gain); route(gain, wet)
  osc.start(t); osc.stop(t + seconds + 0.05)
}

/** A chord of sawtooth voices through a moving low-pass filter: the basis of the hits, risers and swells. */
function brass(notes: number[], seconds: number, cutoff: [from: number, peak: number, to: number], volume: number, attack: number, glide = 1) {
  if (!ctx || !on) return
  const t = ctx.currentTime, end = t + seconds, low = ctx.createBiquadFilter(), gain = ctx.createGain()
  low.type = 'lowpass'; low.Q.value = 0.7
  low.frequency.setValueAtTime(cutoff[0], t); low.frequency.exponentialRampToValueAtTime(cutoff[1], t + attack); low.frequency.exponentialRampToValueAtTime(cutoff[2], end)
  gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(volume, t + attack); gain.gain.exponentialRampToValueAtTime(0.0001, end)
  for (const hz of notes) for (const cents of [-7, 7]) {   // two detuned voices per note for width
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'; osc.detune.value = cents
    osc.frequency.setValueAtTime(hz, t); osc.frequency.exponentialRampToValueAtTime(hz * glide, t + attack)
    osc.connect(low); osc.start(t); osc.stop(end + 0.05)
  }
  low.connect(gain); route(gain, 1)
}

/** A sub-bass drop: the thump under a launch or an impact. */
function boom(volume = 0.4) {
  if (!ctx || !on) return
  const t = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain()
  osc.frequency.setValueAtTime(95, t); osc.frequency.exponentialRampToValueAtTime(30, t + 0.9)
  gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
  osc.connect(gain); route(gain, 0.4)
  osc.start(t); osc.stop(t + 1.7)
}

export function setSound(enabled: boolean) {
  on = enabled
  if (enabled && !ctx) init()
  if (!ctx) return
  void ctx.resume()
  master.gain.setTargetAtTime(enabled ? 0.6 : 0, ctx.currentTime, 0.4)
  if (music) { if (enabled && musicWanted) void music.play().catch(() => {}); else music.pause() }
}

/** Fade the background music out and pause it (leaving for a planet), or resume and fade it back in. About three seconds. */
export function fadeMusic(up: boolean) {
  musicWanted = up
  if (!music) return
  const track = music
  clearInterval(fader)
  if (up && on) void track.play().catch(() => {})
  fader = setInterval(() => {
    const next = track.volume + ((up ? 1 : -1) * MUSIC_VOLUME) / 30
    track.volume = Math.min(MUSIC_VOLUME, Math.max(0, next))
    if (up ? next >= MUSIC_VOLUME : next <= 0) { clearInterval(fader); if (!up) track.pause() }
  }, 100)
}

// Each place has its own colour of organ: pitch offset in cents, and how bright the pipes are.
const MOODS = { home: [0, 1400], miller: [0, 2000], mann: [-200, 800], edmunds: [300, 2600] }
export function setMood(place: PlanetId | null) {
  clearInterval(ticker)
  fadeMusic(!place)   // music belongs to Gargantua; stations are quiet
  if (!ctx) return
  const [cents, cutoff] = MOODS[place ?? 'home']
  moodCents = cents
  voices.forEach((osc, i) => osc.detune.setTargetAtTime(cents + (i % 2) * 5, ctx!.currentTime, 1.5))   // odd voices are the sharp rank
  filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 1.5)
  // Miller: a quiet clock, because every second down there is expensive
  if (place === 'miller') ticker = setInterval(() => tone(2100, 0.05, { type: 'square', volume: 0.012, wet: 0.8 }), 1250)
}

export const sfx = {
  hover: () => tone(1320, 0.5, { volume: 0.02, attack: 0.02, wet: 1 }),
  select: () => { boom(0.35); tone(330, 0.9, { type: 'triangle', volume: 0.06 }); tone(495, 1.3, { volume: 0.045, delay: 0.1 }) },
  /** Low brass-like hit with a long tail, and two bell notes above it. */
  arrive: () => {
    boom(0.3); brass([55, 82.41, 110, 164.81], 3.2, [900, 1400, 110], 0.16, 0.05)
    tone(523.25, 1.6, { volume: 0.05, delay: 0.15, wet: 1 }); tone(783.99, 2.2, { volume: 0.04, delay: 0.35, wet: 1 })
  },
  type: () => tone(1700, 0.02, { type: 'square', volume: 0.007, wet: 0.2 }),   // one keystroke of a typed log line
  // flight simulator
  shot: () => tone(980, 0.05, { type: 'square', volume: 0.01, wet: 0.1 }),
  hit: () => tone(180, 0.14, { type: 'sawtooth', volume: 0.04, wet: 0.3 }),
  hurt: () => boom(0.25),
  pulse: () => { boom(0.3); tone(220, 0.7, { type: 'sawtooth', volume: 0.035 }); tone(440, 0.9, { volume: 0.03, delay: 0.05, wet: 1 }) },
  pickup: () => { tone(660, 0.12, { volume: 0.05 }); tone(990, 0.2, { volume: 0.05, delay: 0.08 }) },
  deny: () => { tone(140, 0.3, { type: 'sawtooth', volume: 0.05 }); tone(105, 0.45, { type: 'sawtooth', volume: 0.05, delay: 0.12 }) },
  /** A slow swelling major chord that opens up, with rising notes over the top. */
  complete: () => {
    brass([110, 138.59, 164.81, 220, 277.18, 329.63], 14, [150, 2600, 300], 0.11, 5.5)
    ;[440, 554.37, 659.25, 880, 1108.73].forEach((hz, i) => tone(hz, 6, { volume: 0.04, delay: 2 + i * 0.8, attack: 0.4, wet: 1 }))
  },
  /** Engine rumble, a rising chord and a rush of air that sweeps across the speakers over the flight. */
  flight(seconds: number) {
    if (!ctx || !on) return
    const t = ctx.currentTime, mid = t + seconds / 2, end = t + seconds
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate), data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource(), band = ctx.createBiquadFilter(), rush = ctx.createGain(), pan = ctx.createStereoPanner()
    noise.buffer = buffer; band.type = 'bandpass'; band.Q.value = 0.8
    band.frequency.setValueAtTime(150, t); band.frequency.exponentialRampToValueAtTime(1500, mid); band.frequency.exponentialRampToValueAtTime(180, end)
    rush.gain.setValueAtTime(0.0001, t); rush.gain.exponentialRampToValueAtTime(0.2, mid); rush.gain.exponentialRampToValueAtTime(0.0001, end)
    pan.pan.setValueAtTime(-0.8, t); pan.pan.linearRampToValueAtTime(0.8, end)
    noise.connect(band); band.connect(rush); rush.connect(pan); route(pan, 0.6); noise.start(t)

    const engine = ctx.createOscillator(), low = ctx.createBiquadFilter(), rumble = ctx.createGain()
    engine.type = 'sawtooth'; low.type = 'lowpass'; low.frequency.value = 220
    engine.frequency.setValueAtTime(46, t); engine.frequency.exponentialRampToValueAtTime(74, mid); engine.frequency.exponentialRampToValueAtTime(46, end)
    rumble.gain.setValueAtTime(0.0001, t); rumble.gain.exponentialRampToValueAtTime(0.14, mid); rumble.gain.exponentialRampToValueAtTime(0.0001, end)
    engine.connect(low); low.connect(rumble); route(rumble, 0.3); engine.start(t); engine.stop(end + 0.05)

    brass([110, 164.81, 220], seconds, [200, 1800, 250], 0.045, seconds * 0.7, 1.5)   // the riser
  },
}
