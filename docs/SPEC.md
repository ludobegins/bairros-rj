# Bairros RJ — Specification (v1)

A web geography game for learning and testing knowledge of Rio de Janeiro's neighborhoods (_bairros_) on an interactive map.

## 1. Scope of v1

- **Area:** two game options (§3.1):
  - **Só Rio** (Rio only): neighborhoods of the city of Rio de Janeiro.
  - **Grande Rio** (Greater Rio): Rio's neighborhoods + the other municipalities of the Metropolitan Region, each treated as a single unit (no neighborhoods outside Rio).
- **Platform:** static website (no backend), mobile-first, hosted on GitHub Pages.
- **Language:** UI in Brazilian Portuguese; code, identifiers, comments and docs in English.

**Terminology:** throughout this spec, a **place** is either a Rio neighborhood or a Metropolitan Region municipality.

## 2. Game modes

In both modes, every place is drawn on the map with its boundaries visible and **no name labels**.

### 2.1 "Qual é o lugar?" mode (type the name)

1. A randomly drawn place is highlighted on the map (blinking/pulsing accent color).
2. If the place is too small to be seen at the current view, the map smoothly zooms until it is visible while keeping surrounding context (it does not zoom all the way in on the place).
3. The user types the name into a text field and submits (Enter / button).
4. The answer is validated (§4).

### 2.2 "Onde fica?" mode (click the map)

1. The name of a randomly drawn place is shown prominently on screen.
2. The user taps/clicks the matching polygon on the map.
3. Pan and zoom (pinch on mobile) are free; a simple tap/click (not a drag) counts as an answer.
4. Clicking a place that was already a wrong answer for the current question is ignored (does not use an attempt).

## 3. Structure of a game

- **Setup (menu):** mode (type / click), area (Só Rio / Grande Rio), zone filter (§5), map background (§6).
- **Round:** 10 places drawn without repetition. If fewer than 10 are available, the round uses all of them.

### 3.1 Area: Só Rio vs. Grande Rio

- **Só Rio:** the map shows only the city of Rio; all 10 places are Rio neighborhoods (within the zone filter).
- **Grande Rio:** the map also shows the neighboring municipalities of the Metropolitan Region (Niterói, São Gonçalo, Duque de Caxias, Nova Iguaçu, etc.), drawn with their municipal outline and no internal subdivision.
  - When the drawn place is a municipality, the user only has to name/click **the municipality** (e.g. Niterói highlighted as a whole → answer "Niterói").
  - Round composition: **8 Rio neighborhoods + 2 municipalities**, in random order. Without a fixed quota, municipalities would almost never appear (~20 vs. ~165 neighborhoods).
  - The zone filter applies only to the Rio part (e.g. "Grande Rio + Zona Sul" = 8 Zona Sul neighborhoods + 2 municipalities).
  - "Rio de Janeiro" itself is never drawn as a municipality.

### 3.2 Attempts and scoring

- **Attempts:** up to 3 per place.
  - Correct on 1st attempt = 3 pts, 2nd = 2 pts, 3rd = 1 pt.
  - After the 3rd miss: 0 pts, the correct answer is revealed (place highlighted + name shown) and the game continues when the user taps "Próximo" (or after ~2 s).
  - A "Pular" (skip) button is available: equivalent to running out of attempts (0 pts, reveal).
- **Max score:** 30 pts per round.
- **Timer:** informational only — shows total round time; it doesn't limit anything or affect the score.
- **Map feedback during the round:** places already answered stay colored:
  - green = correct on 1st try, yellow = correct on 2nd/3rd, red = missed/skipped.
- **End screen:** score, time, list of the 10 places with the result for each; the map remains navigable with its colors. Buttons "Jogar de novo" (same setup) and "Menu".

## 4. Name validation (type mode)

- Normalize before comparing: lowercase, strip accents (NFD + remove diacritics), collapse spaces/hyphens/punctuation, trim.
- Typo tolerance: Levenshtein distance ≤ 1 for normalized names with ≥ 5 characters; ≤ 2 for ≥ 12 characters. Short names (< 5) require an exact match after normalization.
- **Aliases:** each place may have accepted aliases (e.g. "Recreio" → Recreio dos Bandeirantes). Beware of ambiguity ("Jacarepaguá" is a neighborhood in its own right). The alias list is curated manually in the data.
- **Homonyms:** some names are ambiguous (e.g. Freguesia (Jacarepaguá) vs. Freguesia (Ilha do Governador)). The official qualified name is always accepted; the short ambiguous name is accepted if it matches the highlighted place.
- **Answer that matches no known place** (within the active area): show "Não conheço esse lugar" and do **not** use an attempt. An answer matching a different real place uses an attempt ("Não, esse é outro lugar").

## 5. Zone filter

- Options: **Todos**, **Centro**, **Zona Sul**, **Zona Norte**, **Zona Oeste**, **Zona Sudoeste**.
- **Zona Sudoeste:** created by municipal law in Sep 2025; the Barra da Tijuca / Jacarepaguá region (Barra, Recreio, Jacarepaguá, Freguesia, Taquara, Vargens, Grumari, etc. — the 20 neighborhoods of Planning Area 4), separate from Zona Oeste (Campo Grande, Bangu, Santa Cruz, Guaratiba, etc. — Planning Area 5).
- Uses the popular division (how _cariocas_ talk), not the official Planning Areas (APs). Requires a curated `neighborhood → zone` mapping versioned in the repo (e.g. Barra da Tijuca = Zona Sudoeste; Bangu = Zona Oeste; Tijuca = Zona Norte; Ilha do Governador and Paquetá per the convention adopted and documented in the file).
- With a filter active, the map frames the chosen zone; neighborhoods outside it are dimmed and not clickable. In Grande Rio, municipalities remain active regardless of the filter.

## 6. Map visuals

- **No background (default):** only place polygons over a flat background (water/city limits suggested by color). "Hard" mode.
- **With background:** label-free basemap tiles (streets, terrain, beaches) under semi-transparent polygons. "Easy" mode.
- Toggleable in the menu and also during the game.
- Boundaries always visible; on desktop, hover highlights the polygon under the cursor in click mode.
- Light/dark theme following the system setting.

## 7. Persistence (localStorage)

- High score (best score, best time as tie-breaker) per **mode × area × zone** combination.
- Per-place stats: times asked, correct answers per attempt number, misses.
- Simple "Estatísticas" screen: places the user misses most (groundwork for a future practice mode).
- All access wrapped in try/catch: the game works normally if localStorage is unavailable.

## 8. Data

- **Rio neighborhoods:** official boundaries from the Rio city government (Data.Rio / IPP — "Limite de Bairros"), GeoJSON.
- **Metropolitan Region municipalities:** official IBGE municipal boundaries, filtered to the RMRJ municipalities.
- **Build-time processing (script, not runtime):**
  - simplify geometry (target: final file < ~500 KB; preferably TopoJSON to share borders);
  - normalize properties into a unified place format: `id`, `kind` (`neighborhood` | `municipality`), `name`, `zone` (Rio neighborhoods only), `aliases[]`;
  - merge with the curated zones/aliases file;
  - validate: every neighborhood has a zone, unique ids, no empty polygons.
- Raw downloads are not committed; processed data is (so the site works without running the pipeline).

## 9. Non-functional requirements

- Mobile-first: adequate touch targets, the on-screen keyboard must not hide the input/map in a disruptive way, no horizontal scrolling.
- Fast initial load (small place data, no unnecessary heavy dependencies).
- Basic accessibility: keyboard navigation in type mode, sufficient contrast for feedback colors (don't rely on green/red alone — also use an icon/pattern in the end-screen list).
- Offline support: **not in v1**.

## 10. Technical decisions (proposed)

- **Stack:** Vite + TypeScript, no UI framework (plain DOM) — the game has few screens.
- **Map:** MapLibre GL JS (good touch/pinch support, polygons as layers, background tiles can be toggled). Background: label-free raster tiles (e.g. CARTO `light_nolabels` / `dark_nolabels`), with attribution.
- **Tests:** Vitest for pure logic (name normalization/validation, drawing, scoring, persistence).
- **Data pipeline:** Node script + `mapshaper` for simplification/conversion.
- **Deploy:** GitHub Actions → GitHub Pages on every push to `main`.

## 11. Out of scope for v1 (future ideas)

- Neighborhoods of other Greater Rio municipalities (e.g. Niterói, which has good official data). Caveats: heterogeneous sources, names repeated across municipalities (every city has a "Centro"), filter by municipality.
- Practice mode focused on the most-missed places.
- Filter by Planning Areas / Administrative Regions.
- Online leaderboard, result sharing.
- "Complete the map" mode (all places), endless mode, time limits.
- PWA/offline.

## 12. Resolved questions (Phase 1)

- **Zones:** derived from the official Planning Areas — AP1 = Centro, AP2.1 = Zona Sul, AP2.2 (Grande Tijuca) + AP3 = Zona Norte, AP4 = Zona Sudoeste, AP5 = Zona Oeste. Paquetá, Caju, São Cristóvão, Benfica, Mangueira and Vasco da Gama stay in Centro; Ilha do Governador is Zona Norte. Rationale in `data/curated/zones.json`.
- **Aliases:** initial list in `data/curated/overrides.json`.
- **RMRJ:** 21 municipalities besides Rio, per IBGE's 2025 composition list (State Complementary Law 184/2018, includes Petrópolis).
- **Neighborhood count:** 167 in the current IPP data (includes recent ones such as Argentino, Ingleses, Barra Olímpica, Jabour).
