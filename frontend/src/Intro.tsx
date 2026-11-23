import { motion } from 'motion/react'
import { useEffect } from 'react'

// The opening: a mission briefing over black, which lifts to show the Endurance arriving at
// Gargantua. It also covers the few seconds the black hole shader needs to compile.
// [seconds in, text, is it the title]
const LINES: [at: number, text: string, title?: boolean][] = [
  [0.6, 'ENDURANCE // NAV-COM ONLINE'],
  [2.4, 'WORMHOLE TRANSIT COMPLETE · SYSTEM: GARGANTUA'],
  [4.6, 'MISSION LAZARUS', true],
  [6.6, 'Twelve went out to find a new home. Three signalled back.'],
  [8.8, 'Miller. Mann. Edmunds.'],
  [10.8, 'All three stations have gone silent. Find out why.'],
]
const LIFT_AT = 8.2      // when the black starts to clear
const LENGTH = 14.5      // when the intro hands over to the navigation screen

export function Intro({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, LENGTH * 1000)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') onDone() }
    addEventListener('keydown', key)
    return () => { clearTimeout(timer); removeEventListener('keydown', key) }
  }, [onDone])

  return (
    <motion.div exit={{ opacity: 0 }} transition={{ duration: 1.2 }} className="ui absolute inset-0 z-20">
      <motion.div aria-hidden className="absolute inset-0 bg-black" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 4.5, delay: LIFT_AT }} />
      {['top-0', 'bottom-0'].map(edge => <div key={edge} aria-hidden className={`absolute inset-x-0 h-[11vh] bg-black ${edge}`} />)}
      <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center [text-shadow:0_0_24px_#000,0_0_8px_#000]">
        {LINES.map(([at, text, title]) => title ? (
          <motion.h1 key={text} className="my-3 text-3xl font-extralight text-white md:text-5xl" initial={{ opacity: 0, letterSpacing: '1.2em' }}
            animate={{ opacity: 1, letterSpacing: '0.5em' }} transition={{ duration: 2.4, delay: at, ease: 'easeOut' }}>{text}</motion.h1>
        ) : (
          <motion.p key={text} className="text-[11px] tracking-[.35em] text-white/70" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: at }}>{text}</motion.p>
        ))}
      </div>
      <button onClick={onDone} className="absolute right-6 bottom-[13vh] cursor-pointer border border-white/20 bg-black/40 px-3 py-1 text-[9px] tracking-[.3em] text-white/60 hover:border-amber-200 hover:text-amber-200">
        SKIP INTRO
      </button>
    </motion.div>
  )
}
