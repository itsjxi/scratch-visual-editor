# Scratch Visual Editor

A Scratch-style block programming editor in React. You drag motion and looks blocks onto sprites and run them, with support for multiple sprites and collision detection.

**Live demo:** https://agent-692ec47f444d9009e1656051--scratchanimation.netlify.app

---

## Highlights

- **Data-driven block engine.** Blocks are declared in `config/blockDefinitions.js`, and each definition points to a handler in `engine/ExecutionHandlers.js`. To add a new block you write config plus one handler; no component changes are needed.
- **Async sequential executor** (`useDataDrivenEngine`) with support for `REPEAT` loops and event flags.
- **Multiple sprites with collision detection.** A distance check runs during execution (throttled to 500 ms). When two sprites collide, their animation scripts are swapped.
- **Drag-and-drop** from the palette to the script area.
- **Central sprite store** (context + reducer) shared by the palette, script area and stage.

## Architecture

```
src/
├── config/blockDefinitions.js   Block schema: type, params, UI, execution handler
├── engine/
│   ├── DataDrivenEngine.js      Executes block sequences per sprite
│   └── ExecutionHandlers.js     moveSteps, turnDegrees, goTo, ...
├── store/SpriteStore.js         Sprite state, reducer and actions
└── components/                  Sidebar (palette), MidArea (scripts), PreviewArea (stage), GenericBlock
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design.

## Tech stack

React · Webpack · Tailwind CSS

## Getting started

```bash
npm install
npm start      # http://localhost:3000
```
