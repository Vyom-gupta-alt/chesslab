# Grade Maxxer

AssessPrep-style IB practice and assessment app for the **Diploma Programme (DP)** and **Middle Years Programme (MYP)**: syllabus ingestion, AI-generated papers and markschemes, and an exam environment with Desmos tools.

Built with Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui (Radix), Framer Motion, Zustand and Zod.

**Open it:** https://vyom-gupta-alt.github.io/grade-maxxer/

Everyone starts fresh: nothing is preloaded, and everything a student does is saved only in their own browser.

## Run it locally

You need [Node.js 18 or newer](https://nodejs.org) and [Git](https://git-scm.com).

**Windows:** clone the repo, open the folder and double-click `start.bat`. It installs packages the first time and opens http://localhost:3000.

**Any OS:**

```bash
git clone https://github.com/vyom-gupta-alt/grade-maxxer.git
cd grade-maxxer
cp .env.example .env.local   # optional: add your own Desmos key
npm install
npm run dev                  # http://localhost:3000
```

`npm run typecheck`, `npm run lint` and `npm run build` should all pass.

## DP and MYP

Switch programme with the **DP / MYP** toggle at the top of the sidebar. Each programme keeps its own active syllabus.

| | DP | MYP |
| --- | --- | --- |
| Levels | SL / HL / AHL | Standard / Extended |
| Assessment | Papers 1–3, IA criteria | Criteria A–D, each 0–8 |
| Final grade | 1–7 from % boundaries | 1–7 from total /32 (`lib/grading.ts`) |
| Extra syllabus data | — | Key concepts, related concepts, global contexts |

## Build status

| Step | Status |
| --- | --- |
| 1. App shell: top bar with calculator launchers, syllabus sidebar, workspace | Done |
| 2. Desmos wrapper + slide-over calculator panel | Done |
| 3. Syllabus ingestion (PDF / text → Claude → `SyllabusSchema`) | Next |
| 4. Paper generator + split-screen exam environment, KaTeX, AI grading | Planned |

## Layout

```
src/
  app/                       routes: / (workspace), /syllabus, /generate, /exam
  components/
    desmos/
      desmos-provider.tsx    loads the Desmos API once via next/script, exposes it in context
      desmos-calculator.tsx  <DesmosCalculator kind="graphing|scientific|geometry|3d" />
      calculator-panel.tsx   non-modal slide-over with tabs, insert-into-answer, reset, widen
    layout/                  app shell, top bar, sidebar, collapsible topic tree
    workspace/               answer box (receives Desmos graphs), subtopic detail
    ui/                      shadcn primitives
  lib/store.ts               Zustand store, persisted to localStorage
  types/syllabus.ts          Zod schemas for syllabus, topics, outcomes, IB command terms
  types/desmos.d.ts          typings for the Desmos API surface used
  data/sample-syllabus.ts    placeholder Math AA syllabus
```

## Desmos

- The script is loaded once in `DesmosProvider` from `https://www.desmos.com/api/v1.12/calculator.js`.
- The key comes from `NEXT_PUBLIC_DESMOS_API_KEY`. Without one, the public demo key from the Desmos docs is used, which shows a "Trial Key" banner. Get a production key at https://www.desmos.com/my-api.
- Shortcuts: **Alt+G** graphing, **Alt+S** scientific, **Esc** closes the panel.
- Each calculator's state is saved (debounced) to localStorage and restored when it is created again.
- **Insert into answer** takes a PNG via `asyncScreenshot()` (graphing / geometry / 3D) together with the full `getState()`, so an attached graph can be reopened and edited. The scientific calculator has no screenshot API, so its typed lines are attached instead.
- Geometry and 3D tabs only appear when the loaded API exposes those constructors.
