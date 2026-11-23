# Project Lazarus — Gargantua Navigation System

An interactive, space-themed cybersecurity challenge inspired by the film *Interstellar*. You operate
the navigation computer of the Endurance, in orbit around the black hole Gargantua, and visit three
silent research stations: Miller, Mann and Edmunds.

**Live site: https://mikast14.github.io/project-lazarus/**

This repository holds the **frontend**. It currently runs on built-in placeholder data; the Flask
backend with the challenge logic is developed separately and is not published here.

## What is in it

- A ray-traced black hole with a lensed accretion disk, drawn in a WebGL shader
- Three procedurally shaded planets with clouds, atmosphere and station beacons
- The Endurance, with a Ranger or Lander that flies out to each planet and back
- A station screen for each planet, and a mission-complete ending (add `?complete` to the URL)
- A small shooter minigame: click the Endurance, or use "Flight simulator" on the home screen
- Synthesised sound (off by default; button at the bottom of the screen)

## Run it

Needs Node.js 20 or newer.

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173.

## Built with

React, TypeScript, Tailwind CSS, Three.js with React Three Fiber, and Motion.

## Notes

- A fan project made for study. Not affiliated with or endorsed by the makers of *Interstellar*.
- No music is included. To use your own, put an MP3 at `frontend/public/music.mp3`.
