# Bairros RJ — Implementation Plan (v1)

Implements [SPEC.md](SPEC.md). Work is split into phases that each end in a working, committable state. Pure game logic is kept separate from the map and the DOM so it can be unit-tested.

## Project layout (target)

```
bairros-rj/
├── data/
│   ├── raw/                     # downloaded sources (gitignored)
│   └── curated/
│       ├── zones.json           # zone → official neighborhood names
│       ├── overrides.json       # display names + extra accepted names
│       └── rmrj.json            # IBGE codes of Metropolitan Region municipalities
├── scripts/
│   ├── fetch-data.ts            # downloads IPP + IBGE sources into data/raw
│   ├── build-data.ts            # merge curated, validate, simplify → public/data
│   └── lib/places.ts            # pure build/validation logic (unit-tested)
├── public/
│   └── data/places.json         # processed output (committed; TopoJSON)
├── src/
│   ├── main.ts                  # bootstraps app, loads data, routes between screens
│   ├── types.ts                 # Place, Zone, Area, Mode, GameConfig, …
│   ├── core/                    # pure logic, no DOM/map imports
│   │   ├── normalize.ts         # text normalization + Levenshtein
│   │   ├── matcher.ts           # answer → matched place / unknown
│   │   ├── round.ts             # draw places for a round (quota, filter)
│   │   ├── session.ts           # game state machine (attempts, scoring, timer)
│   │   └── storage.ts           # localStorage wrapper: high scores + per-place stats
│   ├── map/
│   │   ├── mapView.ts           # MapLibre setup, layers, feature-state API
│   │   └── style.ts             # colors/theme tokens for map layers
│   ├── ui/
│   │   ├── menu.ts
│   │   ├── game.ts              # HUD, input (type mode), prompt (click mode), feedback
│   │   ├── results.ts
│   │   └── stats.ts
│   └── styles.css
├── tests/                       # Vitest, mirrors src/core
├── .github/workflows/deploy.yml
└── docs/
    ├── SPEC.md
    └── PLAN.md
```

## Phase 0 — Scaffolding ✅

1. `npm create vite` (vanilla-ts template); add `maplibre-gl`, `topojson-client`; dev deps `vitest`, `mapshaper`, `tsx`, `topojson-server`, `prettier`, `eslint`.
2. Set `base` in `vite.config.ts` to the repo name for GitHub Pages.
3. npm scripts: `dev`, `build`, `test`, `lint`, `data:fetch`, `data:build`.
4. `.gitignore` (`node_modules`, `dist`, `data/raw`).
5. GitHub Actions workflow: on push to `main` → install, lint, test, build, deploy to Pages.

**Done when:** blank page deploys to GitHub Pages; `npm test` runs (with a trivial test).

## Phase 1 — Data pipeline ✅

> Done. Sources and curation rules are documented in [data/README.md](../data/README.md). 167 neighborhoods + 21 municipalities, 187 KB (61 KB gzipped) at 20% simplification.

1. **Find sources** and record URLs + license/attribution in `data/README.md`:
   - Data.Rio "Limite de Bairros" (GeoJSON, ArcGIS Hub export).
   - IBGE municipal mesh for RJ state (IBGE malhas API, GeoJSON, municipality level).
2. `scripts/fetch-data.ts`: download both into `data/raw/`.
3. Curated files:
   - `rmrj.json`: list of RMRJ municipalities (IBGE code + name) per current state law, excluding Rio itself.
   - `zones.json`: every Rio neighborhood → one of `centro | sul | norte | oeste | sudoeste`. Document borderline decisions (Ilha do Governador, Paquetá, Grumari, Guaratiba…) in a `_notes` field.
   - `aliases.json`: initial alias list (Recreio, Barra, Freguesia variants, etc.).
4. `scripts/build-data.ts`:
   - Read raw sources, map to `{ id, kind, name, zone?, aliases[] }`. Neighborhood ids from the official code; municipality ids `mun-<ibgeCode>`.
   - Give homonyms a qualified display name (e.g. "Freguesia (Jacarepaguá)").
   - Simplify with mapshaper (tune % until output < ~500 KB while small neighborhoods keep their shape), merging both layers into one TopoJSON with objects `neighborhoods` and `municipalities`.
   - Validation that fails the build: unique ids, every neighborhood has a zone, every zone/alias key refers to an existing place, no empty geometry, alias doesn't collide with another place's name.
   - Write `public/data/places.json`.
5. Quick visual check: open the output on mapshaper.org (or the dev map in Phase 3).

**Done when:** `npm run data:fetch && npm run data:build` produces a validated `places.json` that is committed; open questions on zones/aliases/RMRJ list are resolved in the curated files.

## Phase 2 — Core logic (TDD, no DOM) ✅

1. `normalize.ts`: `normalize(s)` (lowercase, NFD strip diacritics, collapse non-alphanumerics to single space, trim); `levenshtein(a, b)`.
2. `matcher.ts`: `buildMatcher(places)` → `match(input, target)` returning:
   - `{ kind: 'correct' }` — input matches target name/alias within tolerance (≤1 for ≥5 chars, ≤2 for ≥12, exact for <5); ambiguous short names accepted when they match the target;
   - `{ kind: 'other', place }` — matches a different place in the active area;
   - `{ kind: 'unknown' }`.
   - Exact matches are checked before fuzzy ones so a near-miss to the target doesn't get stolen by another place, and vice versa.
3. `round.ts`: `drawRound(places, config, rng)` — Só Rio: 10 neighborhoods in the zone filter; Grande Rio: 8 filtered neighborhoods + 2 municipalities, shuffled; fewer if the pool is smaller. Injectable RNG for tests.
4. `session.ts`: `GameSession` state machine:
   - states: `asking` → (`wrong` → `asking`) → `revealed` → next … → `finished`;
   - actions: `answerByName(input)`, `answerByPlace(id)`, `skip()`, `next()`;
   - tracks attempts (max 3), points (3/2/1/0), results per place, wrong place ids per question (repeated wrong clicks ignored), start/end timestamps;
   - emits events (`onChange`) that the UI and map subscribe to.
5. `storage.ts`: versioned key (`bairros-rj:v1`), `getHighScore(mode, area, zone)`, `recordGame(result)`, `getPlaceStats()`; all calls in try/catch with in-memory fallback.
6. Tests for each module, including edge cases: accents, hyphens, homonyms, unknown vs. other, pool < 10, quota in Grande Rio, skip, repeated wrong click, storage unavailable.

**Done when:** `npm test` green with good coverage of `src/core`.

## Phase 3 — Map view ✅

> Done. Notes: MapLibre v6 needs `setWorkerUrl` with the worker emitted by Vite (`?url` import). CARTO basemaps now require an API key, so the background uses OpenFreeMap vector styles with symbol layers stripped. Zone filter dims via fill opacity so playable municipalities stay distinct. Verified with headless Firefox screenshots (desktop, mobile, dark theme) and a tap on the smallest neighborhood (Argentino) after `ensureVisible`.

1. `mapView.ts` wrapping MapLibre:
   - Load TopoJSON → GeoJSON sources (`neighborhoods`, `municipalities`), with `promoteId: 'id'` so feature-state works.
   - Layers: fill (color driven by feature-state: `default | dimmed | hover | highlight | correct1 | correctLate | missed`), outline line layer, and an optional raster background source (CARTO no-labels, light/dark per theme) toggled via layer visibility.
   - Blank background style (flat land/water colors) when tiles are off.
   - API: `setArea(area)`, `setZoneFilter(zone)` (dims + disables clicks outside), `highlight(id)` (pulse via animated opacity), `setResult(id, result)`, `clearAll()`, `fitTo(zone | area)`, `ensureVisible(id)` (zoom out/in to a level where the feature's bbox is ≥ N px, keeping context), `onPlaceClick(cb)`, `setBackground(on)`.
   - Hover highlight on desktop only (`(hover: hover)` media query).
   - Attribution for tiles and data.
2. Temporary dev harness page to eyeball polygons, small neighborhoods, tap accuracy on a phone (via `vite --host`).

**Done when:** map renders all places correctly on desktop and phone, toggles background, dims by zone, and reports taps (not drags) with the right place id.

## Phase 4 — UI and game flow ✅

> Done. Both modes and both areas playable end-to-end (verified with a scripted Firefox run: full rounds, wrong/unknown/skip/3-miss paths, results, high score, stats). Extras beyond the plan: tapping the map in menu/results shows the place name (study aid); panels report the screen area they cover so map framing and zoom-to-place keep targets visible above bottom sheets; last menu choices are remembered.

1. App shell: map takes the full viewport; overlays for HUD and panels. Uses `visualViewport` to keep the input above the on-screen keyboard on mobile.
2. `menu.ts`: mode, area, zone, background toggle, high score for the selected combination, links to "Estatísticas".
3. `game.ts`:
   - HUD: question counter (n/10), score, elapsed timer, attempts left, "Pular", background toggle.
   - Type mode: text input + submit; feedback messages ("Não conheço esse lugar", "Não, esse é outro lugar", "Acertou!"); reveal shows the name.
   - Click mode: prompt card with the place name; wrong clicks flash the clicked place red briefly.
   - Reveal state: "Próximo" button + ~2 s auto-advance.
   - Wires `GameSession` events ↔ `mapView` (highlight, results colors, ensureVisible).
4. `results.ts`: score, time, new-record badge, list of 10 places with icon + color per result; tapping a row flies the map to it; "Jogar de novo" / "Menu".
5. `stats.ts`: most-missed places list from storage; reset stats button (with confirmation).
6. Styling: CSS custom properties, light/dark via `prefers-color-scheme`, large touch targets, no horizontal scroll at 360 px width.

**Done when:** full rounds playable in both modes and both areas, on desktop and mobile, with results and stats persisted.

## Playtest feedback (after Phase 4)

- Map was hard to read: opaque neighborhood fills hid the basemap, positron/dark basemaps were too washed out, and the no-background mode was far too hard. → Always-on OpenFreeMap "liberty" basemap (light even in dark theme), near-transparent fills with haloed borders, background toggle removed (single "easy" level). See SPEC §6.
- Custom favicon (Pão de Açúcar) instead of Vite's default.

## Phase 5 — Polish and release ✅

> Done. Accessibility: focus moves to each new screen's heading (or the answer input), `aria-live` feedback, labelled map canvas and attribution button (pt-BR), `prefers-reduced-motion` disables camera animations and the pulse, results/stats use icon + color. Performance: game code ~10 KB gzipped; MapLibre (~287 KB gzipped) split into its own long-cached chunk; place data ~61 KB gzipped; loading message and basemap preconnect. The scripted Firefox playthrough lives in `tests/e2e/play.e2e.ts` (`npm run test:e2e`, not in CI). README rewritten. Playtested on a real phone by the owner.

1. Accessibility pass: keyboard flow in type mode, focus management between screens, `aria-live` for feedback, color + icon in results.
2. Performance: check bundle size and data size; lazy-load MapLibre CSS/JS if needed; verify load time on a throttled mobile profile.
3. README: what the game is, how to run, how to regenerate data, data attribution/licenses.
4. Final deploy to GitHub Pages and playtest on a real phone.

**Done when:** deployed, playtested, README complete.

## Risks / notes

- **Data.Rio URL stability:** ArcGIS Hub export URLs change; keep the processed file committed so the site never depends on fetching at runtime.
- **Tiny neighborhoods on mobile** (click mode): if tap accuracy is poor in playtests, consider a slightly larger hit area (query rendered features in a small bbox around the tap) — decide after Phase 3.
- **Zone curation is subjective:** document choices in `zones.json` so they're easy to revisit.
- **Basemap:** OpenFreeMap is a free community service; if it becomes unavailable the game falls back to a plain background (still playable, much harder).
