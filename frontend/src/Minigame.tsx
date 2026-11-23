import { useEffect, useRef, useState } from 'react'
import { uiZoom } from './data'
import { sfx } from './sound'

// Ranger flight simulator: a small vertical shooter. Steer a Ranger through a debris field,
// guns firing on their own, and last as long as the hull holds. Drawn on a 2D canvas.
const W = 360, H = 640, MAX_HULL = 4, MAX_PULSES = 2
const PLAYER_Y = H - 58
const BEST_KEY = 'lazarus-sim-best'
const MONO = 'ui-monospace, Menlo, monospace'

// debris: rock, shard (small and fast), ice, plate, module (a ring module), wreck (a huge derelict, one per third sector)
type Kind = 'rock' | 'shard' | 'ice' | 'plate' | 'module' | 'wreck' | 'kit' | 'spread' | 'shield' | 'pulse'
type Body = { kind: Kind; x: number; y: number; r: number; vx: number; vy: number; hp: number; max: number; angle: number; spin: number; seed: number; flash: number }
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }
type Result = { score: number; best: boolean; time: number; kills: number; mult: number; accuracy: number }
const PICKUP: Partial<Record<Kind, string>> = { kit: '#6ee7a8', spread: '#9fc8ff', shield: '#7fe9ff', pulse: '#c4a3ff' }
const POINTS: Partial<Record<Kind, number>> = { rock: 10, shard: 15, plate: 20, ice: 30, module: 50, wreck: 300 }
const SHAPE: Partial<Record<Kind, [r: number, hp: number]>> = { rock: [13, 1], shard: [7, 1], plate: [16, 2], ice: [22, 3], module: [23, 5] }
const TINT: Partial<Record<Kind, string>> = { ice: '#cfe6ff', plate: '#eef0f2', module: '#eef0f2', wreck: '#eef0f2' }

const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0 } catch { return 0 } }   // storage can be blocked
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function Minigame({ onExit }: { onExit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const exit = useRef(onExit)
  exit.current = onExit
  const [over, setOver] = useState<Result | null>(null) // result once the run has ended
  const [run, setRun] = useState(0)                     // bump to start a fresh run

  useEffect(() => {
    const cv = canvas.current!, g = cv.getContext('2d')!
    const dpr = Math.min(devicePixelRatio * uiZoom(), 4)   // native resolution, including on zoomed 4K layouts
    cv.width = W * dpr; cv.height = H * dpr

    const keys = new Set<string>()
    let px = W / 2, pointer: number | null = null, bank = 0
    let hull = MAX_HULL, score = 0, time = 0, alive = true, paused = false
    let fire = 0, spawn = 0.6, drop = 9, shed = 0, safe = 0, spread = 0, shield = false, pulses = 1
    let shake = 0, muzzle = 0, banner = 2.2, sector = 1, hurt = 0, blast = 0
    let streak = 0, streakTimer = 0, bestMult = 1, kills = 0, fired = 0, landed = 0
    const best = readBest()
    const shots: { x: number; y: number; vx: number }[] = []
    const bodies: Body[] = []
    const sparks: Spark[] = []
    const rings: { x: number; y: number; life: number; color: string; size: number }[] = []
    const popups: { x: number; y: number; text: string; life: number }[] = []
    // three depths of stars: the near ones are bigger and faster
    const stars = Array.from({ length: 90 }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, depth: 1 + (i % 3) }))
    const mult = () => Math.min(5, 1 + Math.floor(streak / 4))   // every fourth kill in a row raises the multiplier

    const burst = (x: number, y: number, color: string, count: number, speed: number) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7), life = 0.35 + Math.random() * 0.4
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: 1 + Math.random() * 2, color })
      }
    }
    const body = (kind: Kind, x: number, y: number, vx: number, vy: number, spin = (Math.random() - 0.5) * 2): Body => {
      const [r, hp] = SHAPE[kind] ?? [11, 1]
      return { kind, x, y, r, vx, vy, hp, max: hp, angle: Math.random() * 6, spin, seed: Math.random() * 100, flash: 0 }
    }

    // a piece of debris is destroyed: points (times the multiplier), fragments, a shock ring
    function destroy(b: Body) {
      b.hp = 0; kills++; streak++; streakTimer = 2.5; bestMult = Math.max(bestMult, mult())
      const points = POINTS[b.kind]! * mult(), color = TINT[b.kind] ?? '#a9afb9', big = b.kind === 'wreck'
      score += points; sfx.hit()
      burst(b.x, b.y, color, big ? 60 : b.r > 20 ? 20 : 11, big ? 300 : 170); burst(b.x, b.y, '#ffb46a', big ? 30 : 5, big ? 220 : 110)
      rings.push({ x: b.x, y: b.y, life: 0.4, color, size: big ? 150 : b.r * 2.4 })
      popups.push({ x: b.x, y: b.y, text: mult() > 1 ? `+${points}  x${mult()}` : `+${points}`, life: big ? 1.4 : 0.7 })
      if (big) {   // the wreck leaves a repair kit and a lot of loose plating
        shake = 0.5; sfx.hurt()
        bodies.push({ ...body('kit', b.x, b.y, 0, 90, 0), angle: 0 })
        for (let i = 0; i < 4; i++) bodies.push(body('plate', b.x + (Math.random() - 0.5) * 60, b.y, (Math.random() - 0.5) * 120, 60 + Math.random() * 60))
      }
    }

    // Space: a pulse that clears the screen of loose debris and bites a chunk out of a wreck
    function pulse() {
      if (!alive || paused || pulses <= 0) return
      pulses--; blast = 0.5; shake = 0.25; sfx.pulse()
      rings.push({ x: px, y: PLAYER_Y, life: 0.6, color: '#c4a3ff', size: 420 })
      for (const b of bodies) {
        if (b.kind in PICKUP || b.hp <= 0) continue
        if (b.kind === 'wreck') { b.hp -= 12; b.flash = 0.15; if (b.hp <= 0) destroy(b) } else destroy(b)
      }
    }

    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'escape') return exit.current()
      if (k === 'p') paused = !paused
      if (k === ' ' && !e.repeat) pulse()
      keys.add(k)
      if (k === 'arrowleft' || k === 'arrowright' || k === ' ') e.preventDefault()
    }
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
    const aim = (e: PointerEvent) => { const box = cv.getBoundingClientRect(); pointer = ((e.clientX - box.left) / box.width) * W }
    addEventListener('keydown', down); addEventListener('keyup', up)
    cv.addEventListener('pointermove', aim); cv.addEventListener('pointerdown', aim)

    function step(dt: number) {
      time += dt; safe -= dt; spread -= dt; muzzle -= dt; banner -= dt
      if ((streakTimer -= dt) <= 0) streak = 0   // the multiplier lapses if nothing is destroyed for a while
      const wreck = bodies.find(b => b.kind === 'wreck')
      if (1 + Math.floor(time / 20) > sector) {
        sector++; banner = 2.2
        if (sector % 3 === 0) {   // every third sector a derelict drifts through
          const w = body('wreck', W / 2, -70, 0, 26, 0.25)
          w.r = 46; w.hp = w.max = 26 + sector * 4; w.angle = 0
          bodies.push(w)
        }
      }

      // steering: keys win over the pointer; the ship banks into the turn
      const before = px
      const dir = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0)
      if (dir) { px += dir * 280 * dt; pointer = null }
      else if (pointer !== null) px += Math.max(-420 * dt, Math.min(420 * dt, pointer - px))
      px = Math.max(20, Math.min(W - 20, px))
      bank += (Math.max(-1, Math.min(1, (px - before) / (280 * dt))) - bank) * Math.min(1, dt * 10)

      if ((fire -= dt) <= 0) {
        fire = 0.16; muzzle = 0.05; sfx.shot(); fired += 2
        shots.push({ x: px - 9, y: PLAYER_Y - 20, vx: 0 }, { x: px + 9, y: PLAYER_Y - 20, vx: 0 })
        if (spread > 0) { fired += 2; shots.push({ x: px - 12, y: PLAYER_Y - 14, vx: -130 }, { x: px + 12, y: PLAYER_Y - 14, vx: 130 }) }
      }
      for (const s of shots) { s.y -= 540 * dt; s.x += s.vx * dt }
      for (const s of stars) { s.y += s.depth * 34 * dt; if (s.y > H) { s.y = 0; s.x = Math.random() * W } }
      // engine exhaust, a side jet when banking hard, and smoke once the hull is badly damaged
      for (const x of [-7, 7]) sparks.push({ x: px + x, y: PLAYER_Y + 16, vx: (Math.random() - 0.5) * 20, vy: 120 + Math.random() * 60, life: 0.22, max: 0.22, size: 2, color: '#9fc8ff' })
      if (Math.abs(bank) > 0.4) sparks.push({ x: px - Math.sign(bank) * 15, y: PLAYER_Y + 10, vx: -Math.sign(bank) * 90, vy: 30, life: 0.15, max: 0.15, size: 1.5, color: '#e6f1ff' })
      if (hull <= 2 && Math.random() < 0.5) sparks.push({ x: px + (Math.random() - 0.5) * 14, y: PLAYER_Y, vx: (Math.random() - 0.5) * 30, vy: 80, life: 0.5, max: 0.5, size: 2.5, color: hull === 1 ? '#ff8a5c' : '#6b7079' })

      if ((spawn -= dt) <= 0) {   // debris comes faster the longer the run lasts, and eases off while a wreck is on screen
        spawn = Math.max(0.3, 1 - time * 0.012) * (wreck ? 1.7 : 1)
        const roll = Math.random()
        const kind: Kind = roll < 0.18 ? 'ice' : roll < 0.34 ? 'plate' : roll < 0.48 && sector >= 2 ? 'shard' : roll < 0.56 && sector >= 2 ? 'module' : 'rock'
        const x = 20 + Math.random() * (W - 40), drift = time * 1.2
        if (kind === 'rock' && Math.random() < Math.min(0.45, 0.15 + sector * 0.1)) {
          // a crosser: comes in from a side edge, low down, straight at the ship. The guns fire
          // forward and cannot reach it, so the only answer is to move.
          const left = Math.random() < 0.5, sx = left ? -20 : W + 20, sy = 300 + Math.random() * 170
          const dist = Math.hypot(px - sx, PLAYER_Y - sy), speed = 170 + time * 1.5
          bodies.push(body('rock', sx, sy, ((px - sx) / dist) * speed, ((PLAYER_Y - sy) / dist) * speed, left ? 3 : -3))
        } else if (kind === 'shard') bodies.push(body('shard', x, -20, (Math.random() - 0.5) * 70, 230 + Math.random() * 80 + drift, 6))
        else bodies.push(body(kind, x, -30, (Math.random() - 0.5) * 40, (kind === 'ice' ? 70 : kind === 'module' ? 55 : 110) + Math.random() * 60 + drift))
      }
      if (wreck && (shed -= dt) <= 0) {   // the wreck sheds fast shards as it tumbles
        shed = 1.1
        bodies.push(body('shard', wreck.x + (Math.random() - 0.5) * 70, wreck.y + 30, (Math.random() - 0.5) * 120, 210 + Math.random() * 60, 6))
      }
      if ((drop -= dt) <= 0) {    // a pickup now and then: repairs when damaged, otherwise a weapon, a shield or a pulse charge
        drop = 10 + Math.random() * 6
        const roll = Math.random()
        const kind: Kind = hull < MAX_HULL && roll < 0.45 ? 'kit' : roll < 0.65 ? 'spread' : roll < 0.84 || pulses >= MAX_PULSES ? 'shield' : 'pulse'
        bodies.push({ ...body(kind, 30 + Math.random() * (W - 60), -20, 0, 90, 0), angle: 0 })
      }

      for (const b of bodies) {
        if (b.kind === 'wreck') b.x = W / 2 + Math.sin(time * 0.5) * 70   // it sways across the lane
        b.x += b.vx * dt; b.y += b.vy * dt; b.angle += b.spin * dt; b.flash -= dt
        const pickup = b.kind in PICKUP
        if (!pickup) for (const s of shots) {
          if (b.hp > 0 && s.y > -50 && Math.hypot(s.x - b.x, s.y - b.y) < b.r + 4) {
            s.y = -100; b.hp--; b.flash = 0.08; landed++
            burst(s.x, b.y + b.r * 0.7, '#ffd28a', 3, 90)
            if (b.hp <= 0) destroy(b)
          }
        }
        if (b.hp > 0 && Math.hypot(px - b.x, PLAYER_Y - b.y) < b.r + 14) {
          if (pickup) {
            b.hp = 0; sfx.pickup(); rings.push({ x: px, y: PLAYER_Y, life: 0.4, color: PICKUP[b.kind]!, size: 34 })
            const note = (text: string) => popups.push({ x: px, y: PLAYER_Y - 30, text, life: 0.9 })
            if (b.kind === 'kit') { hull = Math.min(MAX_HULL, hull + 1); note('HULL +1') }
            if (b.kind === 'spread') { spread = 8; note('SPREAD SHOT') }
            if (b.kind === 'shield') { shield = true; note('SHIELD') }
            if (b.kind === 'pulse') { pulses = Math.min(MAX_PULSES, pulses + 1); note('PULSE +1') }
          } else if (safe <= 0) {
            if (b.kind !== 'wreck') b.hp = 0   // ordinary debris breaks up on the hull; a wreck does not
            sfx.hurt(); shake = 0.35; hurt = 0.4; streak = 0; burst(px, PLAYER_Y - 10, '#ffb46a', 14, 200)
            if (shield) { shield = false; safe = 0.6; rings.push({ x: px, y: PLAYER_Y, life: 0.4, color: '#7fe9ff', size: 34 }) }   // the shield takes it
            else {
              hull--; safe = 1.2   // a hit costs one hull segment, then a moment of grace
              if (hull <= 0) {
                alive = false; burst(px, PLAYER_Y, '#eef0f2', 30, 260); burst(px, PLAYER_Y, '#ffb46a', 24, 200)
                const record = score > best
                if (record) try { localStorage.setItem(BEST_KEY, String(score)) } catch { /* storage blocked: the record just is not kept */ }
                setOver({ score, best: record, time, kills, mult: bestMult, accuracy: fired ? Math.round((landed / fired) * 100) : 0 })
              }
            }
          }
        }
      }
      for (let i = bodies.length - 1; i >= 0; i--) { const b = bodies[i]; if (b.hp <= 0 || b.y > H + 80 || b.x < -60 || b.x > W + 60) bodies.splice(i, 1) }
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].y < -10) shots.splice(i, 1)
    }

    // effects keep running after the ship is lost, so the last explosion plays out
    function fade(dt: number) {
      shake = Math.max(0, shake - dt); hurt -= dt; blast -= dt
      for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt }
      for (const r of rings) r.life -= dt
      for (const p of popups) { p.y -= 30 * dt; p.life -= dt }
      for (const list of [sparks, rings, popups] as { life: number }[][]) for (let i = list.length - 1; i >= 0; i--) if (list[i].life <= 0) list.splice(i, 1)
    }

    // a white hull box with dark seams and a window: used for ring modules and the wreck's segments
    function hullBox(w: number, h: number, lit: boolean) {
      g.fillStyle = lit ? '#ffffff' : '#d9dce1'; g.fillRect(-w / 2, -h / 2, w, h)
      g.fillStyle = '#1f2227'; g.fillRect(-w / 2, -h * 0.18, w, 1.6); g.fillRect(-w / 2, h * 0.2, w, 1.6); g.fillRect(-w * 0.1, -h / 2, 1.6, h)
      g.fillStyle = '#8d939c'; g.fillRect(w / 2 - 4, -h / 2 + 3, 3, h - 6)
      g.fillStyle = '#3a2f22'; g.fillRect(-w * 0.36, -h * 0.05, w * 0.18, h * 0.16)   // a dead window
      g.strokeStyle = '#8d939c'; g.lineWidth = 1; g.strokeRect(-w / 2, -h / 2, w, h)
    }

    function debris(b: Body) {
      const lit = b.flash > 0
      if (b.kind === 'plate') {   // a torn hull plate from some earlier ship
        g.fillStyle = lit ? '#ffffff' : '#d9dce1'; g.fillRect(-15, -9, 30, 18)
        g.fillStyle = '#1f2227'; g.fillRect(-15, -1, 30, 2); g.fillRect(4, -9, 2, 18)
        g.fillStyle = '#8d939c'; g.fillRect(-12, -6, 6, 3)
        g.strokeStyle = '#8d939c'; g.lineWidth = 1; g.strokeRect(-15, -9, 30, 18)
        return
      }
      if (b.kind === 'module') return hullBox(30, 38, lit)   // a whole ring module, adrift
      if (b.kind === 'wreck') {   // a broken arc of a ring ship: four modules still joined, one torn open
        for (let i = -2; i <= 1; i++) {
          g.save(); g.rotate((i + 0.5) * 0.52); g.translate(0, -34)
          g.fillStyle = '#8d939c'; g.fillRect(-20, -5, 40, 10)   // coupling to the next module
          hullBox(26, 30, lit)
          if (i === 1) { g.fillStyle = '#04050c'; g.beginPath(); g.moveTo(13, -15); g.lineTo(2, -6); g.lineTo(9, 2); g.lineTo(0, 15); g.lineTo(13, 15); g.closePath(); g.fill() }   // the torn end
          g.restore()
        }
        g.fillStyle = lit ? '#ffffff' : '#c4c9d1'; g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill()   // what is left of the hub
        g.strokeStyle = '#8d939c'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -22); g.stroke()
        return
      }
      if (b.kind === 'shard') {   // a fast sliver of rock
        g.beginPath(); g.moveTo(0, -9); g.lineTo(5, 6); g.lineTo(-4, 5); g.closePath()
        g.fillStyle = lit ? '#ffffff' : '#7b828d'; g.fill(); g.strokeStyle = '#c4c9d1'; g.lineWidth = 0.8; g.stroke()
        return
      }
      const ice = b.kind === 'ice', corner = (i: number): [number, number] => {
        const a = (i / 8) * Math.PI * 2, d = b.r * (0.72 + 0.28 * Math.abs(Math.sin(b.seed + i * 2.7)))
        return [Math.cos(a) * d, Math.sin(a) * d]
      }
      g.beginPath(); for (let i = 0; i < 8; i++) g.lineTo(...corner(i)); g.closePath()
      const shade = g.createLinearGradient(-b.r, -b.r, b.r, b.r)   // lit from one side
      shade.addColorStop(0, lit ? '#ffffff' : ice ? 'rgba(207,230,255,.6)' : '#5a606b')
      shade.addColorStop(1, ice ? 'rgba(120,160,210,.18)' : '#1c1f25')
      g.fillStyle = shade; g.fill()
      g.strokeStyle = ice ? '#cfe6ff' : '#8d939c'; g.lineWidth = 1.2; g.stroke()
      // facets: lines from the middle out to some corners
      g.strokeStyle = ice ? 'rgba(207,230,255,.5)' : 'rgba(141,147,156,.45)'; g.lineWidth = 0.7
      g.beginPath(); for (const i of [0, 3, 5]) { g.moveTo(Math.sin(b.seed) * 3, Math.cos(b.seed) * 3); g.lineTo(...corner(i)) } g.stroke()
      if (ice) {   // a glint that twinkles on one corner
        const [cx, cy] = corner(1), size = 3 + 2 * Math.sin(time * 6 + b.seed)
        g.strokeStyle = '#ffffff'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(cx * 0.6 - size, cy * 0.6); g.lineTo(cx * 0.6 + size, cy * 0.6); g.moveTo(cx * 0.6, cy * 0.6 - size); g.lineTo(cx * 0.6, cy * 0.6 + size); g.stroke()
      } else {     // craters
        g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1
        for (const [dx, dy, cr] of [[-0.3, -0.2, 0.22], [0.25, 0.3, 0.16]]) { g.beginPath(); g.arc(dx * b.r, dy * b.r, cr * b.r, 0, Math.PI * 2); g.stroke() }
      }
    }

    function backdrop() {
      g.fillStyle = '#04050c'; g.fillRect(0, 0, W, H)
      // two faint clouds of gas, far behind everything
      for (const [x, y, r, color] of [[60, 420, 260, '70,90,170'], [320, 250, 220, '130,80,150']] as const) {
        const haze = g.createRadialGradient(x, y, 10, x, y, r)
        haze.addColorStop(0, `rgba(${color},.10)`); haze.addColorStop(1, `rgba(${color},0)`)
        g.fillStyle = haze; g.fillRect(0, 0, W, H)
      }
      // Gargantua ahead: its glow, and the lower arc of the disk curving across the top, shimmering
      const glow = g.createRadialGradient(W / 2, -150, 20, W / 2, -150, 430)
      glow.addColorStop(0, 'rgba(241,194,125,.3)'); glow.addColorStop(1, 'rgba(241,194,125,0)')
      g.fillStyle = glow; g.fillRect(0, 0, W, H)
      for (const [radius, width, alpha] of [[250, 14, 0.1], [238, 5, 0.2], [232, 1.5, 0.55]] as const) {
        g.beginPath(); g.arc(W / 2, -190, radius, 0.25, Math.PI - 0.25)
        g.strokeStyle = `rgba(255,214,150,${alpha * (0.85 + 0.15 * Math.sin(time * 1.3 + radius))})`; g.lineWidth = width; g.stroke()
      }
      // a blue ocean world drifting slowly past in the distance
      const py = ((time * 7 + 200) % (H + 260)) - 130, planet = g.createRadialGradient(W * 0.8 - 14, py - 14, 4, W * 0.8, py, 44)
      planet.addColorStop(0, 'rgba(110,160,230,.55)'); planet.addColorStop(0.7, 'rgba(30,60,130,.5)'); planet.addColorStop(1, 'rgba(8,16,40,.5)')
      g.fillStyle = planet; g.beginPath(); g.arc(W * 0.8, py, 44, 0, Math.PI * 2); g.fill()
      g.strokeStyle = 'rgba(120,170,255,.25)'; g.lineWidth = 2; g.stroke()

      for (const s of stars) {   // the nearest stars streak
        g.fillStyle = `rgba(255,255,255,${0.2 + s.depth * 0.22})`
        g.fillRect(s.x, s.y, s.depth > 2 ? 1.5 : 1, s.depth > 2 ? 5 : s.depth)
      }
    }

    function ship() {
      g.save(); g.translate(px, PLAYER_Y); g.rotate(bank * 0.22); g.scale(1 - Math.abs(bank) * 0.22, 1)
      if (muzzle > 0) { g.fillStyle = '#fff4d6'; g.fillRect(-11, -26, 4, 6); g.fillRect(7, -26, 4, 6) }   // muzzle flash
      g.fillStyle = '#1f2227'   // heat-shield belly showing at the edges
      g.beginPath(); g.moveTo(0, -26); g.lineTo(19, 15); g.lineTo(8, 11); g.lineTo(0, 17); g.lineTo(-8, 11); g.lineTo(-19, 15); g.closePath(); g.fill()
      g.fillStyle = '#eef0f2'   // upper hull
      g.beginPath(); g.moveTo(0, -24); g.lineTo(16, 13); g.lineTo(7, 9); g.lineTo(0, 14); g.lineTo(-7, 9); g.lineTo(-16, 13); g.closePath(); g.fill()
      g.fillStyle = '#c4c9d1'; g.fillRect(-3, -4, 6, 14)                 // cabin spine
      g.fillStyle = '#1f2227'; g.fillRect(-3, -13, 6, 8)                 // cockpit glass
      g.fillStyle = '#eef0f2'; g.fillRect(-0.5, -13, 1, 8)               // its centre frame
      g.fillStyle = '#8d939c'; g.fillRect(-10, 9, 6, 5); g.fillRect(4, 9, 6, 5)   // engine housings
      g.strokeStyle = 'rgba(31,34,39,.5)'; g.lineWidth = 0.6             // wing panel lines
      g.beginPath(); g.moveTo(-4, -2); g.lineTo(-12, 8); g.moveTo(4, -2); g.lineTo(12, 8); g.stroke()
      if (hull <= 2) { g.strokeStyle = '#1f2227'; g.lineWidth = 1; g.beginPath(); g.moveTo(5, -8); g.lineTo(9, 0); g.lineTo(6, 4); g.stroke() }               // a crack once damaged
      if (hull <= 1) { g.fillStyle = '#3a2f22'; g.beginPath(); g.moveTo(-14, 6); g.lineTo(-8, 2); g.lineTo(-9, 9); g.closePath(); g.fill() }                   // a scorched wing at the last segment
      g.fillStyle = '#ff4a4a'; g.fillRect(-16, 11, 2, 2); g.fillStyle = '#5dff8a'; g.fillRect(14, 11, 2, 2)   // nav lights
      g.fillStyle = Math.floor(time * 30) % 2 ? '#9fc8ff' : '#e6f1ff'    // engine flicker
      g.fillRect(-9, 14, 4, 6 + Math.random() * 5); g.fillRect(5, 14, 4, 6 + Math.random() * 5)
      g.restore()
      if (shield) {
        g.strokeStyle = `rgba(127,233,255,${0.5 + 0.3 * Math.sin(time * 6)})`; g.lineWidth = 1.5
        g.beginPath(); g.arc(px, PLAYER_Y - 2, 27, 0, Math.PI * 2); g.stroke()
      }
    }

    function hud() {
      g.font = `10px ${MONO}`; g.textBaseline = 'top'; g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.5)'; g.fillText('HULL', 12, 10)
      for (let i = 0; i < MAX_HULL; i++) {
        g.strokeStyle = '#f1c27d'; g.lineWidth = 1; g.strokeRect(12.5 + i * 20, 24.5, 16, 7)
        if (i < hull) { g.fillStyle = hull === 1 && Math.floor(time * 4) % 2 ? '#ff6b5a' : '#f1c27d'; g.fillRect(13 + i * 20, 25, 15, 6) }   // last segment flashes red
      }
      // pulse charges, as diamonds
      g.fillStyle = 'rgba(255,255,255,.5)'; g.fillText('PULSE', 12, 38)
      for (let i = 0; i < MAX_PULSES; i++) {
        g.save(); g.translate(56 + i * 14, 43); g.rotate(Math.PI / 4)
        g.strokeStyle = '#c4a3ff'; g.lineWidth = 1; g.strokeRect(-3.5, -3.5, 7, 7)
        if (i < pulses) { g.fillStyle = '#c4a3ff'; g.fillRect(-3, -3, 6, 6) }
        g.restore()
      }
      let line = 52
      if (shield) { g.fillStyle = '#7fe9ff'; g.fillText('SHIELD', 12, line); line += 14 }
      if (spread > 0) { g.fillStyle = '#9fc8ff'; g.fillText('SPREAD', 12, line); g.fillRect(58, line + 3, (spread / 8) * 34, 3) }

      g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.5)'; g.fillText('SCORE', W - 12, 10)
      g.fillStyle = '#f1c27d'; g.font = `14px ${MONO}`; g.fillText(String(score).padStart(6, '0'), W - 12, 23)
      g.font = `10px ${MONO}`; g.fillStyle = 'rgba(255,255,255,.4)'; g.fillText(`BEST ${String(Math.max(best, score)).padStart(6, '0')}`, W - 12, 42)
      if (mult() > 1) {   // the multiplier, with a bar showing how long it has left
        g.fillStyle = '#ffd28a'; g.font = `13px ${MONO}`; g.fillText(`x${mult()}`, W - 12, 56)
        g.fillRect(W - 12 - 30 * Math.max(0, streakTimer / 2.5), 73, 30 * Math.max(0, streakTimer / 2.5), 2); g.font = `10px ${MONO}`
      }

      g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.4)'; g.fillText(`SECTOR ${String(sector).padStart(2, '0')}  ·  ${clock(time)}`, W / 2, 10)
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(W / 2 - 40, 24, 80, 2)                       // progress through the sector
      g.fillStyle = '#f1c27d'; g.fillRect(W / 2 - 40, 24, 80 * ((time % 20) / 20), 2)
      const wreck = bodies.find(b => b.kind === 'wreck')
      if (wreck) {   // the wreck's own hull bar
        g.fillStyle = '#ff8a5c'; g.fillText('DERELICT', W / 2, 32)
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(W / 2 - 70, 46, 140, 3)
        g.fillStyle = '#ff8a5c'; g.fillRect(W / 2 - 70, 46, 140 * Math.max(0, wreck.hp / wreck.max), 3)
      }
      if (banner > 0 && alive) {   // announce each new sector
        g.fillStyle = `rgba(241,194,125,${Math.min(1, banner)})`; g.font = `16px ${MONO}`
        g.fillText(sector === 1 ? 'ENTERING DEBRIS FIELD' : sector % 3 === 0 ? 'DERELICT AHEAD' : `SECTOR ${String(sector).padStart(2, '0')}`, W / 2, H * 0.36)
        g.font = `10px ${MONO}`
      }
      if (paused && alive) { g.fillStyle = '#f1c27d'; g.font = `16px ${MONO}`; g.fillText('PAUSED', W / 2, H * 0.45); g.font = `10px ${MONO}` }
    }

    function draw() {
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      backdrop()
      if (shake > 0) g.translate((Math.random() - 0.5) * shake * 18, (Math.random() - 0.5) * shake * 18)

      for (const s of shots) {   // a bright core with a fading tail
        const tail = g.createLinearGradient(0, s.y - 8, 0, s.y + 22)
        tail.addColorStop(0, 'rgba(255,226,176,.9)'); tail.addColorStop(1, 'rgba(255,180,106,0)')
        g.fillStyle = tail; g.fillRect(s.x - 2.5, s.y - 8, 5, 30)
        g.fillStyle = '#fff4d6'; g.fillRect(s.x - 1.2, s.y - 8, 2.4, 12)
      }

      for (const b of bodies) {
        g.save(); g.translate(b.x, b.y)
        const tint = PICKUP[b.kind]
        if (tint) {   // pickups pulse so they stand out from the debris
          const beat = 1 + 0.12 * Math.sin(time * 8)
          g.scale(beat, beat); g.strokeStyle = tint; g.fillStyle = tint; g.lineWidth = 1.5
          g.strokeRect(-9, -9, 18, 18)
          if (b.kind === 'kit') { g.fillRect(-2, -6, 4, 12); g.fillRect(-6, -2, 12, 4) }
          if (b.kind === 'spread') { g.beginPath(); for (const x of [-5, 0, 5]) { g.moveTo(0, 6); g.lineTo(x, -6) } g.stroke() }
          if (b.kind === 'shield') { g.beginPath(); g.arc(0, 0, 5.5, 0, Math.PI * 2); g.stroke() }
          if (b.kind === 'pulse') { g.rotate(Math.PI / 4); g.fillRect(-3.5, -3.5, 7, 7) }
        } else {
          g.save(); g.rotate(b.angle); debris(b); g.restore()
          if (b.max > 1 && b.hp < b.max && b.kind !== 'wreck') {   // a small bar on anything that takes several hits
            g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(-12, -b.r - 8, 24, 2)
            g.fillStyle = '#ffd28a'; g.fillRect(-12, -b.r - 8, 24 * (b.hp / b.max), 2)
          }
        }
        g.restore()
      }

      for (const r of rings) {   // expanding shock rings
        const age = 1 - Math.max(0, r.life) / 0.6
        g.globalAlpha = Math.max(0, 1 - age * 1.4); g.strokeStyle = r.color; g.lineWidth = 1.5
        g.beginPath(); g.arc(r.x, r.y, 6 + r.size * Math.min(1, age * 1.6), 0, Math.PI * 2); g.stroke()
      }
      for (const s of sparks) { g.globalAlpha = Math.max(0, s.life / s.max); g.fillStyle = s.color; g.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size) }
      g.globalAlpha = 1

      if (alive && !(safe > 0 && Math.floor(time * 12) % 2)) ship()   // blink while recovering from a hit

      g.font = `10px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      for (const p of popups) { g.fillStyle = `rgba(241,194,125,${Math.max(0, Math.min(1, p.life * 2))})`; g.fillText(p.text, p.x, p.y) }

      // full-screen flashes and the heads-up display are drawn without the shake
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (blast > 0) { g.fillStyle = `rgba(196,163,255,${blast * 0.5})`; g.fillRect(0, 0, W, H) }   // pulse
      if (hurt > 0) {   // red at the edges when the hull is hit
        const edge = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.62)
        edge.addColorStop(0, 'rgba(255,60,40,0)'); edge.addColorStop(1, `rgba(255,60,40,${hurt * 1.1})`)
        g.fillStyle = edge; g.fillRect(0, 0, W, H)
      }
      hud()
    }

    let last = performance.now(), raf = 0
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      if (!paused) { if (alive) step(dt); fade(dt) }
      draw()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('keydown', down); removeEventListener('keyup', up)
      cv.removeEventListener('pointermove', aim); cv.removeEventListener('pointerdown', aim)
    }
  }, [run])

  const button = 'cursor-pointer border px-4 py-2 text-[10px] tracking-[.3em]'
  return (
    <div role="dialog" aria-label="Ranger flight simulator" className="ui absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/90 p-4">
      <p className="text-[10px] tracking-[.4em] text-white/50">RANGER FLIGHT SIMULATOR · DEBRIS FIELD</p>
      <div className="relative aspect-[9/16] h-[min(78vh,900px)] border border-white/15">
        <canvas ref={canvas} className="h-full w-full touch-none" />
        {over && (
          <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 text-center">
            <p className="text-xl font-extralight tracking-[.4em] text-amber-200">RANGER LOST</p>
            <p className="text-xs tracking-[.3em] text-white/70">SCORE {String(over.score).padStart(6, '0')}</p>
            {over.best && <p className="text-[10px] tracking-[.4em] text-emerald-300">NEW BEST</p>}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px] tracking-[.25em]">
              {[['TIME', clock(over.time)], ['DESTROYED', over.kills], ['BEST MULTIPLIER', `x${over.mult}`], ['ACCURACY', `${over.accuracy} %`]].map(([label, value]) => (
                <div key={label} className="contents"><dt className="text-right text-white/40">{label}</dt><dd className="text-left text-white/80">{value}</dd></div>
              ))}
            </dl>
            <button autoFocus onClick={() => { setOver(null); setRun(n => n + 1) }} className={`${button} border-amber-200/50 text-amber-200 hover:bg-amber-200/10`}>FLY AGAIN</button>
          </div>
        )}
      </div>
      <p className="text-center text-[9px] tracking-[.3em] text-white/40">← → OR MOUSE TO STEER · SPACE FOR A PULSE · P TO PAUSE · ESC TO EXIT</p>
      <button onClick={onExit} className={`${button} border-white/20 text-white/70 hover:border-amber-200 hover:text-amber-200`}>← RETURN TO NAV-COM</button>
    </div>
  )
}
