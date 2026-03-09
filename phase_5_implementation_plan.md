# Phase 5: Final Polish & Configurability — Implementation Plan

**Version:** 1.0
**Date:** March 9, 2026
**Goal:** Centralized constants, game setup screen, scoring rebalance, event scaling, keyboard shortcuts, event toasts, timeline scrubber, save/load UI, and overall polish to make the project feel complete.

---

## Context

Phases 1–4 are complete: the simulation has three AI systems (Utility, Behavior Tree, GOAP) competing across three villages with full PixiJS rendering, inspector, minimap, particles, status icons, and a results screen with export. However, everything is hardcoded — users can't choose which AIs compete, adjust world size, or tweak difficulty. Magic numbers are scattered across 10+ files. The ViewToggle is missing a Results button. There are no keyboard shortcuts, no event notifications, and no way to save/load mid-game. Phase 5 addresses all of these gaps to deliver a polished, configurable final product.

---

## Implementation Blocks

### Block 1: Centralized Game Constants

Extract all magic numbers into a single importable constants file. Pure refactor — no behavioral changes.

**New file:** `src/config/game-constants.ts`

Exports a `DEFAULTS` object organized by category:
- `TIMING`: TICKS_PER_DAY (30), DAY_TICKS (20), DAYS_PER_SEASON (7)
- `POPULATION`: INITIAL_VILLAGERS (10), GROWTH_FOOD_THRESHOLD (50), GROWTH_TIMER_BASE (12), GROWTH_TIMER_VARIANCE (3)
- `STOCKPILE`: BASE_CAP (200), STORAGE_BONUS (100), INITIAL_FOOD (50), INITIAL_WOOD (30), INITIAL_STONE (10)
- `STRUCTURES`: costs per type, shelter capacity (3), farm food/day (5), watchtower bonus (8)
- `SCORING`: POP_WEIGHT (5), HEALTH_WEIGHT (1.0), FOOD_WEIGHT (0.3), WOOD_WEIGHT (0.2), STONE_WEIGHT (0.2), STRUCTURE_WEIGHT (5), UNIQUE_TYPE_WEIGHT (5), DAYS_WEIGHT (1.0)
- `EVENTS`: GRACE_PERIOD_DAYS (5), MIN_INTERVAL (5), MAX_INTERVAL (10), severity/duration per event type
- `COMPETITION`: VICTORY_LAP_DAYS (10), STAGNATION_WINDOW (30), STAGNATION_THRESHOLD (0.05)

**Files to modify:**
- `src/simulation/simulation-engine.ts` — import timing constants
- `src/simulation/competition-engine.ts` — import VICTORY_LAP_DAYS, STAGNATION_*, scoring weights
- `src/simulation/structures.ts` — import BASE_STOCKPILE_CAP, STRUCTURE_COSTS
- `src/simulation/events.ts` — import event severity/duration/interval values
- `src/utils/scoring.ts` — import scoring weights
- `src/simulation/villager.ts` — import need drain rates, initial stockpile values

**New test:** `tests/game-constants.test.ts` — verify default values match current behavior (regression guard)

**Constraint:** All 272 existing tests must still pass with identical numeric values.

---

### Block 2: GameConfig & Setup Screen

Add a pre-simulation setup UI so users can configure matchups, world size, and difficulty.

**New file:** `src/config/game-config.ts`

```typescript
interface GameConfig {
  seed: number
  worldSize: 'small' | 'medium' | 'large'          // 48x48, 64x64, 80x80
  aiSelection: { utility: boolean; bt: boolean; goap: boolean }  // min 2
  startingVillagers: 5 | 10 | 15
  startingResources: 'scarce' | 'normal' | 'abundant' // 0.5x, 1.0x, 2.0x initial stockpile
  eventFrequency: 'calm' | 'normal' | 'intense'       // 1.5x, 1.0x, 0.6x event interval
  timeLimit: number | null                             // null=unlimited, or 30/60/90 days
}
```

Exports `buildCompetitionConfig(gc: GameConfig): CompetitionConfig` — maps user settings to engine config.

**New file:** `src/views/SetupScreen.tsx`

Full-screen setup shown before simulation starts:
- AI selection checkboxes with min-2 validation
- World size dropdown (Small 48x48 / Medium 64x64 / Large 80x80)
- Starting villagers radio (5 / 10 / 15)
- Starting resources radio (Scarce / Normal / Abundant)
- Event frequency radio (Calm / Normal / Intense)
- Time limit dropdown (Unlimited / 30 / 60 / 90 days)
- Seed input + randomize
- "Start Simulation" button

**Files to modify:**
- `src/store/simulation-store.ts` — add `gameConfig: GameConfig`, `showSetup: boolean`, `setGameConfig()`, modify `init()` to use `buildCompetitionConfig()`
- `src/App.tsx` — render `SetupScreen` when `showSetup` is true
- `src/simulation/villager.ts` — `createInitialStockpile()` accepts optional resource multiplier
- `src/simulation/events.ts` — `EventScheduler` accepts frequency multiplier for threshold range
- `src/components/TopBar.tsx` — add "Setup" button when simulation not running

**New test:** `tests/game-config.test.ts` — buildCompetitionConfig for all setting combos, min-2 AI validation

**Depends on:** Block 1

---

### Block 3: Game Balance Improvements

#### 3A. Prosperity Scoring Rebalance

File: `src/utils/scoring.ts`

New formula (changes in **bold**):
```
population * 5              (was 10 — reduced, pop shouldn't dominate)
+ avgHealth * 1.0           (was 0.5 — health maintenance matters more)
+ food * 0.3
+ wood * 0.2
+ stone * 0.2
+ structureCount * 5
+ uniqueStructureTypes * 5  (was 10 — overweighted for just 6 types)
+ daysSurvived * 1.0        (was 0.5 — longevity should matter more)
+ efficiencyBonus           (NEW: (avgHealth + avgHunger + avgEnergy) / 3 * pop * 0.02)
```

The efficiency bonus rewards villages that keep villagers well-fed and rested, not just alive.

**Files to modify:**
- `src/utils/scoring.ts` — update signature to accept avgHunger, avgEnergy; update formula
- `src/simulation/competition-engine.ts` `recordSnapshot()` — pass avgHunger, avgEnergy
- `src/simulation/simulation-engine.ts` `recordSnapshot()` — same

**Test updates:** `tests/scoring.test.ts` — update expected values, add efficiency bonus tests

#### 3B. Event Difficulty Scaling

File: `src/simulation/events.ts`

Add `getDifficultyMultiplier(dayCount: number): number`:
- Days 5–15: 1.0x (base)
- Days 16–30: 1.2x
- Days 31–50: 1.5x
- Days 51+: 1.8x

Apply to predator severity, cold snap drain, illness duration. Late game becomes progressively harder, breaking stagnation naturally.

#### 3C. Stagnation Breaker

File: `src/simulation/competition-engine.ts` `checkStagnation()`

Escalation: if stagnation persists for 2 consecutive windows (60 days), force a challenging event (predator or cold snap) via the existing `eventScheduler`. Maintains determinism through the RNG.

**Depends on:** Block 1

---

### Block 4: UI Polish (independent sub-blocks)

#### 4A. ViewToggle Results Button

File: `src/components/ViewToggle.tsx`

Add third "Results" button. Enable when `competitionState?.isOver` or when history data exists (allow viewing partial results mid-sim).

#### 4B. Keyboard Shortcuts

**New file:** `src/hooks/useKeyboardShortcuts.ts`

| Key | Action |
|-----|--------|
| Space | Toggle start/pause |
| 1/2/3/4 | Set speed 1x/2x/4x/8x |
| M | Switch to metrics view |
| S | Switch to simulation view |
| R | Switch to results view |
| Escape | Close inspector / modals |
| ? | Toggle help modal |

Checks no input element is focused before handling. Called from `src/App.tsx`.

#### 4C. Event Toast Notifications

**New files:** `src/components/EventToast.tsx`, `src/store/toast-store.ts`

Toast popups in top-right for significant events (predator, storm, illness, deaths, births). Auto-dismiss after 4 seconds.

Modify `src/store/simulation-store.ts` — detect new events in `gameLoop()` by comparing event array lengths, call `addToast`.

#### 4D. Structure Tooltips

Modify `src/views/SimulationView.tsx` — extend click handler to detect structure clicks. Show a small floating panel with structure type, position, and "built on day N".

Add `structureHitTest(localX, localY)` to `src/rendering/village-renderer.ts`.

#### 4E. FPS Counter

**New file:** `src/components/FPSCounter.tsx`

Small overlay in corner showing FPS from rAF timestamps. Toggle with `F` key.

Add `showFPS: boolean` to simulation store.

#### 4F. Help/About Modal

**New file:** `src/components/HelpModal.tsx`

Keyboard shortcuts reference, AI system descriptions, scoring formula, credits. Toggled from TopBar `?` button or `?` key.

---

### Block 5: Replay Timeline

Leverages the existing deterministic seed system and daily history snapshots — no new simulation state needed.

#### 5A. Timeline Scrubber on Results Screen

Modify `src/views/ResultsSummary.tsx`:

Add `<input type="range">` scrubber from day 0 to maxDays. As user scrubs:
- Charts show a vertical `ReferenceLine` at the current day
- Panel below shows snapshot data for that day: population, resources, avg health, events

Reads from existing `history.daily` arrays.

#### 5B. Share Config String

Add "Share Config" button to ResultsSummary that copies a config string to clipboard: `seed=12345&size=medium&ais=utility,goap&villagers=10&resources=normal&events=normal&limit=60`

Add "Paste Config" input to SetupScreen that parses this string and populates the form.

**Depends on:** Block 2

---

### Block 6: Save/Load UI

Wire the existing serialization module (`src/utils/serialization.ts`) to the UI.

**New file:** `src/components/SaveLoadPanel.tsx`

Panel accessible from TopBar:
- "Save" button (auto-label from seed + day count)
- List of saved snapshots with "Load" and "Delete"
- Storage usage bar (uses existing `getStorageUsage()`)

**Files to modify:**
- `src/store/simulation-store.ts` — add `saveGame()` and `loadGame(label)` actions
- `src/components/TopBar.tsx` — add save/load button

**Note:** Full engine state restoration from snapshot requires RNG state save/restore. If RNG state serialization is too complex, fall back to seed-only replay (already works).

---

### Block 7: Phase 5 Acceptance Checks & Final Testing

#### 7A. Acceptance Checks

File: `src/utils/acceptance-checks.ts`

Change `type Phase = 1|2|3|4` to `1|2|3|4|5`. Add Phase 5 to `AcceptanceChecklist.tsx` labels/colors.

New checks:
- `p5-setup-screen`: SetupScreen renders with all config options
- `p5-ai-selection-min2`: Min 2 AIs validation works
- `p5-world-size-config`: Different world sizes produce correct dimensions
- `p5-scoring-rebalanced`: New formula returns expected values
- `p5-keyboard-shortcuts`: Space toggles pause, number keys set speed
- `p5-view-toggle-results`: 3 view modes available
- `p5-event-scaling`: Event severity increases with day count
- `p5-constants-centralized`: game-constants.ts exports all expected keys

#### 7B. New Test Files

- `tests/game-constants.test.ts` — constants regression guard
- `tests/game-config.test.ts` — config builder + validation
- `tests/event-scaling.test.ts` — difficulty multiplier at various day counts
- `tests/scoring-rebalanced.test.ts` — new formula edge cases

Update `tests/scoring.test.ts` for new formula values.

#### 7C. Final Verification

- `npx tsc --noEmit` — no errors
- `npx vitest run` — all tests pass

---

## Dependency Graph

```
Block 1 (Constants) ──────┬──> Block 2 (Setup/Config) ──> Block 5 (Replay)
                          │
                          ├──> Block 3 (Balance)
                          │
Block 4A-F (UI Polish) ───┤   (independent, parallel with all)
                          │
Block 6 (Save/Load) ──────┤
                          │
Block 7 (Tests/Acceptance) ◄── all blocks
```

**Critical path:** Block 1 → Block 2 → Block 5 → Block 7
**Parallel:** Block 4 (all sub-blocks) can proceed independently at any time

**Recommended execution order:**
1. Block 1 (constants refactor — low risk, unlocks everything)
2. Block 4A + 4B (ViewToggle fix + keyboard shortcuts — quick wins)
3. Block 2 (setup screen — highest user value)
4. Block 3 (balance — simulation improvements)
5. Block 4C–F (toasts, tooltips, FPS, help — polish)
6. Block 5 (timeline scrubber)
7. Block 6 (save/load UI)
8. Block 7 (acceptance checks + final tests)

---

## New Files (15)

| File | Purpose |
|------|---------|
| `src/config/game-constants.ts` | All tunable constants in one place |
| `src/config/game-config.ts` | GameConfig type and builder function |
| `src/views/SetupScreen.tsx` | Pre-simulation configuration UI |
| `src/hooks/useKeyboardShortcuts.ts` | Keyboard shortcut handler hook |
| `src/components/EventToast.tsx` | Toast notification component |
| `src/store/toast-store.ts` | Toast state management |
| `src/components/FPSCounter.tsx` | Debug FPS overlay |
| `src/components/HelpModal.tsx` | Help and keyboard reference modal |
| `src/components/SaveLoadPanel.tsx` | Save/load game UI panel |
| `tests/game-constants.test.ts` | Constants regression tests |
| `tests/game-config.test.ts` | Config builder tests |
| `tests/event-scaling.test.ts` | Difficulty scaling tests |
| `tests/scoring-rebalanced.test.ts` | Updated scoring formula tests |
| `tests/setup-screen.test.ts` | Setup screen component tests |
| `tests/keyboard-shortcuts.test.ts` | Shortcut hook tests |

## Modified Files (16)

| File | Changes |
|------|---------|
| `src/utils/scoring.ts` | New formula with efficiency bonus |
| `src/simulation/events.ts` | Difficulty scaling, frequency multiplier |
| `src/simulation/competition-engine.ts` | Centralized constants, stagnation escalation, scoring args |
| `src/simulation/simulation-engine.ts` | Centralized constants, scoring args |
| `src/simulation/structures.ts` | Import costs from constants |
| `src/simulation/villager.ts` | Import drain rates, stockpile multiplier param |
| `src/store/simulation-store.ts` | GameConfig state, setup screen, save/load, toast detection |
| `src/components/ViewToggle.tsx` | Add Results button |
| `src/components/TopBar.tsx` | Setup, save/load, help buttons |
| `src/views/ResultsSummary.tsx` | Timeline scrubber, share config |
| `src/views/SimulationView.tsx` | Structure click handling |
| `src/rendering/village-renderer.ts` | Structure hit test method |
| `src/App.tsx` | Setup screen, keyboard shortcuts, toasts, FPS, help modal |
| `src/utils/acceptance-checks.ts` | Phase 5 checks |
| `src/components/AcceptanceChecklist.tsx` | Phase 5 label/color |
| `tests/scoring.test.ts` | Updated expected values |

---

## Verification

1. **Type check:** `npx tsc --noEmit` — no errors
2. **Tests:** `npx vitest run` — all existing + new tests pass
3. **Manual verification:**
   - Launch app → setup screen appears with all config options
   - Select 2 AIs, small world, scarce resources → start
   - Simulation runs with configured settings
   - Press Space → pauses; press 1/2/3/4 → speed changes
   - Event toast appears when predator/storm/illness fires
   - Click structure in sim view → tooltip with type and build day
   - Press `?` → help modal with shortcuts and AI descriptions
   - ViewToggle shows Metrics / Sim / Results (Results enabled mid-sim)
   - Simulation ends → results screen with timeline scrubber
   - Scrub timeline → charts highlight day, snapshot panel updates
   - "Share Config" → copies config string to clipboard
   - Save game → appears in save/load panel
   - Load saved game → simulation resumes from snapshot
   - Events get harder in late game (predator damage increases)
   - Stagnant villages get forced events after 60 days
