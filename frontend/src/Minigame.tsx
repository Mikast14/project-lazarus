import { useEffect, useRef, useState } from 'react'
import { uiZoom } from './data'
import { sfx } from './sound'

// Ranger flight simulator: a small vertical shooter. Steer a Ranger through a debris field,
// guns firing on their own, and last as long as the hull holds. Drawn on a 2D canvas.
const W = 360, H = 640, MAX_HULL = 4
const PLAYER_Y = H - 58
const BEST_KEY = 'lazarus-sim-best'
const MONO = 'ui-monospace, Menlo, monospace'

type Kind = 'rock' | 'ice' | 'plate' | 'kit' | 'spread' | 'shield'
type Body = { kind: Kind; x: number; y: number; r: number; vx: number; vy: number; hp: number; angle: number; spin: number; seed: number; flash: number }
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }
const PICKUP: Partial<Record<Kind, string>> = { kit: '#6ee7a8', spread: '#9fc8ff', shield: '#7fe9ff' }
const POINTS: Partial<Record<Kind, number>> = { rock: 10, plate: 20, ice: 30 }

const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0 } catch { return 0 } }   // storage can be blocked

export function Minigame({ onExit }: { onExit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const exit = useRef(onExit)
  exit.current = onExit
  const [over, setOver] = useState<{ score: number; best: boolean } | null>(null) // result once the run has ended
  const [run, setRun] = useState(0)                                                // bump to start a fresh run

  useEffect(() => {
    const cv = canvas.current!, g = cv.getContext('2d')!
    const dpr = Math.min(devicePixelRatio * uiZoom(), 4)   // native resolution, including on zoomed 4K layouts
    cv.width = W * dpr; cv.height = H * dpr

    const keys = new Set<string>()
    let px = W / 2, pointer: number | null = null, bank = 0
    let hull = MAX_HULL, score = 0, time = 0, alive = true, paused = false
    let fire = 0, spawn = 0.6, drop = 9, safe = 0, spread = 0, shield = false, shake = 0, muzzle = 0, banner = 2.2, sector = 1
    const best = readBest()
    const shots: { x: number; y: number; vx: number }[] = []
    const bodies: Body[] = []
    const sparks: Spark[] = []
    const rings: { x: number; y: number; life: number; color: string }[] = []
    const popups: { x: number; y: number; text: string; life: number }[] = []
    // three depths of stars: the near ones are bigger and faster
    const stars = Array.from({ length: 90 }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, depth: 1 + (i % 3) }))

    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'escape') return exit.current()
      if (k === 'p') paused = !paused
      keys.add(k)
      if (k === 'arrowleft' || k === 'arrowright' || k === ' ') e.preventDefault()
    }
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
    const aim = (e: PointerEvent) => { const box = cv.getBoundingClientRect(); pointer = ((e.clientX - box.left) / box.width) * W }
    addEventListener('keydown', down); addEventListener('keyup', up)
    cv.addEventListener('pointermove', aim); cv.addEventListener('pointerdown', aim)

    const burst = (x: number, y: number, color: string, count: number, speed: number) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7), life = 0.35 + Math.random() * 0.4
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: 1 + Math.random() * 2, color })
      }
    }

    function step(dt: number) {
      time += dt; safe -= dt; spread -= dt; shake = Math.max(0, shake - dt); muzzle -= dt; banner -= dt
      if (1 + Math.floor(time / 20) > sector) { sector++; banner = 2.2 }   // a new sector every twenty seconds

      // steering: keys win over the pointer; the ship banks into the turn
      const before = px
      const dir = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0)
      if (dir) { px += dir * 280 * dt; pointer = null }
      else if (pointer !== null) px += Math.max(-420 * dt, Math.min(420 * dt, pointer - px))
      px = Math.max(20, Math.min(W - 20, px))
      bank += (Math.max(-1, Math.min(1, (px - before) / (280 * dt))) - bank) * Math.min(1, dt * 10)

      if ((fire -= dt) <= 0) {
        fire = 0.16; muzzle = 0.05; sfx.shot()
        shots.push({ x: px - 9, y: PLAYER_Y - 20, vx: 0 }, { x: px + 9, y: PLAYER_Y - 20, vx: 0 })
        if (spread > 0) shots.push({ x: px - 12, y: PLAYER_Y - 14, vx: -130 }, { x: px + 12, y: PLAYER_Y - 14, vx: 130 })
      }
      for (const s of shots) { s.y -= 540 * dt; s.x += s.vx * dt }
      for (const s of stars) { s.y += s.depth * 34 * dt; if (s.y > H) { s.y = 0; s.x = Math.random() * W } }
      // engine exhaust
      for (const x of [-7, 7]) sparks.push({ x: px + x, y: PLAYER_Y + 16, vx: (Math.random() - 0.5) * 20, vy: 120 + Math.random() * 60, life: 0.22, max: 0.22, size: 2, color: '#9fc8ff' })

      if ((spawn -= dt) <= 0) {   // debris comes faster the longer the run lasts
        spawn = Math.max(0.3, 1 - time * 0.012)
        const roll = Math.random(), kind: Kind = roll < 0.22 ? 'ice' : roll < 0.4 ? 'plate' : 'rock'
        if (kind === 'rock' && Math.random() < 0.45) {
          // a crosser: comes in from a side edge, low down, straight at the ship. The guns fire
          // forward and cannot reach it, so the only answer is to move.
          const left = Math.random() < 0.5, x = left ? -20 : W + 20, y = 300 + Math.random() * 170
          const dist = Math.hypot(px - x, PLAYER_Y - y), speed = 170 + time * 1.5
          bodies.push({ kind, x, y, r: 13, hp: 1, vx: ((px - x) / dist) * speed, vy: ((PLAYER_Y - y) / dist) * speed, angle: 0, spin: left ? 3 : -3, seed: Math.random() * 100, flash: 0 })
        } else {
          bodies.push({ kind, x: 20 + Math.random() * (W - 40), y: -30, r: kind === 'ice' ? 22 : kind === 'plate' ? 16 : 13, hp: kind === 'ice' ? 3 : kind === 'plate' ? 2 : 1,
            vx: (Math.random() - 0.5) * 40, vy: (kind === 'ice' ? 70 : 110) + Math.random() * 60 + time * 1.2, angle: Math.random() * 6, spin: (Math.random() - 0.5) * 2, seed: Math.random() * 100, flash: 0 })
        }
      }
      if ((drop -= dt) <= 0) {    // a pickup now and then: repairs when damaged, otherwise a weapon or a shield
        drop = 10 + Math.random() * 6
        const roll = Math.random(), kind: Kind = hull < MAX_HULL && roll < 0.5 ? 'kit' : roll < 0.75 ? 'spread' : 'shield'
        bodies.push({ kind, x: 30 + Math.random() * (W - 60), y: -20, r: 11, hp: 1, vx: 0, vy: 90, angle: 0, spin: 0, seed: 0, flash: 0 })
      }

      for (const b of bodies) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.angle += b.spin * dt; b.flash -= dt
        const pickup = b.kind in PICKUP
        if (!pickup) for (const s of shots) {
          if (b.hp > 0 && s.y > -50 && Math.hypot(s.x - b.x, s.y - b.y) < b.r + 4) {
            s.y = -100; b.hp--; b.flash = 0.08
            burst(s.x, b.y + b.r, '#ffd28a', 3, 90)
            if (b.hp <= 0) {      // destroyed: points, a burst of fragments and a shock ring
              const points = POINTS[b.kind]!
              score += points; sfx.hit()
              const color = b.kind === 'ice' ? '#cfe6ff' : b.kind === 'plate' ? '#eef0f2' : '#a9afb9'
              burst(b.x, b.y, color, b.kind === 'ice' ? 18 : 11, 170); burst(b.x, b.y, '#ffb46a', 5, 110)
              rings.push({ x: b.x, y: b.y, life: 0.35, color })
              popups.push({ x: b.x, y: b.y, text: `+${points}`, life: 0.7 })
            }
          }
        }
        if (b.hp > 0 && Math.hypot(px - b.x, PLAYER_Y - b.y) < b.r + 14) {
          b.hp = 0
          if (pickup) {
            sfx.pickup(); rings.push({ x: px, y: PLAYER_Y, life: 0.4, color: PICKUP[b.kind]! })
            if (b.kind === 'kit') { hull = Math.min(MAX_HULL, hull + 1); popups.push({ x: px, y: PLAYER_Y - 30, text: 'HULL +1', life: 0.9 }) }
            if (b.kind === 'spread') { spread = 8; popups.push({ x: px, y: PLAYER_Y - 30, text: 'SPREAD SHOT', life: 0.9 }) }
            if (b.kind === 'shield') { shield = true; popups.push({ x: px, y: PLAYER_Y - 30, text: 'SHIELD', life: 0.9 }) }
          } else if (safe <= 0) {
            sfx.hurt(); shake = 0.35; burst(b.x, b.y, '#ffb46a', 14, 200)
            if (shield) { shield = false; safe = 0.6; rings.push({ x: px, y: PLAYER_Y, life: 0.4, color: '#7fe9ff' }) }   // the shield takes it
            else {
              hull--; safe = 1.2   // a hit costs one hull segment, then a moment of grace
              if (hull <= 0) {
                alive = false; burst(px, PLAYER_Y, '#eef0f2', 30, 260); burst(px, PLAYER_Y, '#ffb46a', 24, 200)
                const record = score > best
                if (record) try { localStorage.setItem(BEST_KEY, String(score)) } catch { /* storage blocked: the record just is not kept */ }
                setOver({ score, best: record })
              }
            }
          }
        }
      }
      for (let i = bodies.length - 1; i >= 0; i--) { const b = bodies[i]; if (b.hp <= 0 || b.y > H + 40 || b.x < -60 || b.x > W + 60) bodies.splice(i, 1) }
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].y < -10) shots.splice(i, 1)
    }

    // effects keep running after the ship is lost, so the last explosion plays out
    function fade(dt: number) {
      for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt }
      for (const r of rings) r.life -= dt
      for (const p of popups) { p.y -= 30 * dt; p.life -= dt }
      for (const list of [sparks, rings, popups] as { life: number }[][]) for (let i = list.length - 1; i >= 0; i--) if (list[i].life <= 0) list.splice(i, 1)
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
    }

    function draw() {
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.fillStyle = '#04050c'; g.fillRect(0, 0, W, H)
      if (shake > 0) g.translate((Math.random() - 0.5) * shake * 18, (Math.random() - 0.5) * shake * 18)

      // Gargantua ahead: its glow, and the lower arc of the disk curving across the top
      const glow = g.createRadialGradient(W / 2, -150, 20, W / 2, -150, 430)
      glow.addColorStop(0, 'rgba(241,194,125,.3)'); glow.addColorStop(1, 'rgba(241,194,125,0)')
      g.fillStyle = glow; g.fillRect(0, 0, W, H)
      for (const [radius, width, alpha] of [[250, 14, 0.1], [238, 5, 0.2], [232, 1.5, 0.55]] as const) {
        g.beginPath(); g.arc(W / 2, -190, radius, 0.25, Math.PI - 0.25)
        g.strokeStyle = `rgba(255,214,150,${alpha})`; g.lineWidth = width; g.stroke()
      }

      for (const s of stars) {   // the nearest stars streak
        g.fillStyle = `rgba(255,255,255,${0.2 + s.depth * 0.22})`
        g.fillRect(s.x, s.y, s.depth > 2 ? 1.5 : 1, s.depth > 2 ? 5 : s.depth)
      }

      for (const s of shots) {
        g.fillStyle = 'rgba(255,210,138,.25)'; g.fillRect(s.x - 4, s.y - 10, 8, 18)   // glow
        g.fillStyle = '#ffe2b0'; g.fillRect(s.x - 1.5, s.y - 8, 3, 14)
      }

      for (const b of bodies) {
        g.save(); g.translate(b.x, b.y)
        const tint = PICKUP[b.kind]
        if (tint) {   // pickups pulse so they stand out from the debris
          const pulse = 1 + 0.12 * Math.sin(time * 8)
          g.scale(pulse, pulse); g.strokeStyle = tint; g.fillStyle = tint; g.lineWidth = 1.5
          g.strokeRect(-9, -9, 18, 18)
          if (b.kind === 'kit') { g.fillRect(-2, -6, 4, 12); g.fillRect(-6, -2, 12, 4) }
          if (b.kind === 'spread') { g.beginPath(); for (const x of [-5, 0, 5]) { g.moveTo(0, 6); g.lineTo(x, -6) } g.stroke() }
          if (b.kind === 'shield') { g.beginPath(); g.arc(0, 0, 5.5, 0, Math.PI * 2); g.stroke() }
        } else { g.rotate(b.angle); debris(b) }
        g.restore()
      }

      for (const r of rings) {   // expanding shock rings
        g.globalAlpha = Math.max(0, r.life / 0.4); g.strokeStyle = r.color; g.lineWidth = 1.5
        g.beginPath(); g.arc(r.x, r.y, 34 * (1 - r.life / 0.4) + 6, 0, Math.PI * 2); g.stroke()
      }
      for (const s of sparks) { g.globalAlpha = Math.max(0, s.life / s.max); g.fillStyle = s.color; g.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size) }
      g.globalAlpha = 1

      if (alive && !(safe > 0 && Math.floor(time * 12) % 2)) {   // blink while recovering from a hit
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
        g.fillStyle = '#ff4a4a'; g.fillRect(-16, 11, 2, 2); g.fillStyle = '#5dff8a'; g.fillRect(14, 11, 2, 2)   // nav lights
        g.fillStyle = Math.floor(time * 30) % 2 ? '#9fc8ff' : '#e6f1ff'    // engine flicker
        g.fillRect(-9, 14, 4, 6 + Math.random() * 5); g.fillRect(5, 14, 4, 6 + Math.random() * 5)
        g.restore()
        if (shield) {
          g.strokeStyle = `rgba(127,233,255,${0.5 + 0.3 * Math.sin(time * 6)})`; g.lineWidth = 1.5
          g.beginPath(); g.arc(px, PLAYER_Y - 2, 27, 0, Math.PI * 2); g.stroke()
        }
      }

      g.font = `10px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      for (const p of popups) { g.fillStyle = `rgba(241,194,125,${Math.max(0, Math.min(1, p.life * 2))})`; g.fillText(p.text, p.x, p.y) }

      // heads-up display, drawn without the shake
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.textBaseline = 'top'; g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.5)'; g.fillText('HULL', 12, 10)
      for (let i = 0; i < MAX_HULL; i++) {
        g.strokeStyle = '#f1c27d'; g.lineWidth = 1; g.strokeRect(12.5 + i * 20, 24.5, 16, 7)
        if (i < hull) { g.fillStyle = hull === 1 && Math.floor(time * 4) % 2 ? '#ff6b5a' : '#f1c27d'; g.fillRect(13 + i * 20, 25, 15, 6) }   // last segment flashes red
      }
      if (shield) { g.fillStyle = '#7fe9ff'; g.fillText('SHIELD', 12, 38) }
      if (spread > 0) {
        g.fillStyle = '#9fc8ff'; g.fillText('SPREAD', 12, shield ? 52 : 38)
        g.fillRect(58, (shield ? 52 : 38) + 3, (spread / 8) * 34, 3)
      }
      g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.5)'; g.fillText('SCORE', W - 12, 10)
      g.fillStyle = '#f1c27d'; g.font = `14px ${MONO}`; g.fillText(String(score).padStart(6, '0'), W - 12, 23)
      g.font = `10px ${MONO}`; g.fillStyle = 'rgba(255,255,255,.4)'; g.fillText(`BEST ${String(Math.max(best, score)).padStart(6, '0')}`, W - 12, 42)
      g.textAlign = 'center'; g.fillText(`SECTOR ${String(sector).padStart(2, '0')}`, W / 2, 10)
      if (banner > 0 && alive) {   // announce each new sector
        g.fillStyle = `rgba(241,194,125,${Math.min(1, banner)})`; g.font = `16px ${MONO}`
        g.fillText(sector === 1 ? 'ENTERING DEBRIS FIELD' : `SECTOR ${String(sector).padStart(2, '0')}`, W / 2, H * 0.36)
        g.font = `10px ${MONO}`
      }
      if (paused && alive) { g.fillStyle = '#f1c27d'; g.font = `16px ${MONO}`; g.fillText('PAUSED', W / 2, H * 0.45); g.font = `10px ${MONO}` }
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
            <button autoFocus onClick={() => { setOver(null); setRun(n => n + 1) }} className={`${button} border-amber-200/50 text-amber-200 hover:bg-amber-200/10`}>FLY AGAIN</button>
          </div>
        )}
      </div>
      <p className="text-center text-[9px] tracking-[.3em] text-white/40">← → OR MOUSE TO STEER · GUNS FIRE ON THEIR OWN · P TO PAUSE · ESC TO EXIT</p>
      <button onClick={onExit} className={`${button} border-white/20 text-white/70 hover:border-amber-200 hover:text-amber-200`}>← RETURN TO NAV-COM</button>
    </div>
  )
}
