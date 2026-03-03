# AI Colony: Competitive Village Simulation — Project Plan

**Version:** 1.2
**Date:** March 3, 2026

---

## Project Summary

AI Colony is a browser-based, purely observational simulation where two or more villages survive in identical environments, each running a different AI decision-making system. The user watches the villages diverge and compares outcomes through a real-time metrics dashboard and an optional visual simulation view. The project serves as a learning tool for game AI architectures, a portfolio piece, and a direct skills pipeline into Shovel Monster NPC development.

---

## Technical Stack

- **Rendering:** PixiJS (2D sprite-based simulation view)
- **UI/Dashboard:** React + Recharts (metrics, event log, inspector panels)
- **Language:** TypeScript
- **Sprites:** 16x16 pixel art
- **World Size:** 64x64 tile grid per village (expandable to 128x128 for shared world mode)
- **Build Tool:** Vite
- **State Management:** Zustand (lightweight, minimal boilerplate)
- **Testing:** Vitest for unit tests, seeded simulation runs for regression testing
- **No backend required** — entirely client-side (until multiplayer observation in future scope)

---

## Views & Layout

### 1. Metrics Dashboard (Default View — "Stealth Mode")

This is the default landing view. It presents all simulation data as a professional-looking analytics dashboard. Someone glancing at the screen sees system monitoring, not a game.

**Layout:**

- **Top Bar:** Simulation controls (start, pause, speed slider 1x–8x, reset), elapsed time, current season, world seed display
- **Headline Cards:** One per village — population count, prosperity score, resource totals, structures built — styled like KPI cards
- **Main Area — Charts (Recharts):**
  - Population over time (line chart, one line per village)
  - Resource stockpiles over time (stacked area chart per village)
  - Villager activity breakdown (what % of villagers are foraging, building, resting, fleeing — bar chart per village)
  - Prosperity score over time (line chart, the single most important comparison metric)
- **Side Panel — Event Log:** Scrolling timestamped log of notable events across all villages, color-coded by village. Filterable by category (death, construction, crisis, milestone)
- **Bottom Strip:** Quick-compare table — villages as rows, key stats as columns, updated live

### 2. Simulation View (Toggle)

A toggle button switches to the visual view. Village worlds displayed side by side with pixel art rendering via PixiJS.

**Layout:**

- **Top Bar:** Same controls as metrics view (shared across both views)
- **Main Area:** Side-by-side PixiJS canvases, one per village (or single shared canvas in shared world mode). Tiles show terrain (grass, forest, stone, water). Sprites show villagers, structures, resources. Simple day/night lighting overlay. Camera can pan/zoom independently per village
- **Villager Inspector:** Click any villager to open an overlay showing their name, current needs (hunger, rest, safety as bars), current action, and a decision rationale panel:
  - Utility AI: shows scored action list with values
  - Behavior Tree: shows active node path in the tree
  - GOAP: shows current goal and planned action sequence
  - Evolutionary AI: shows genome weights and current fitness score
- **Minimap:** Small overview per village showing population density and resource distribution
- **Event Log:** Same shared log as metrics view, docked to the side

### 3. Results Summary (Post-Simulation)

When a village is eliminated or the user stops the simulation, show a summary screen.

- Final stats comparison table
- Key divergence moments highlighted from the event log
- Graphs of the full simulation run
- "Winner" callout (if one village was eliminated) or comparative analysis (if both survived)
- Simulation seed for reproducibility — "Run this seed again" button

---

## Simulation Design

### World Generation

- 64x64 tile grid generated identically for each village using a shared seed (expandable to 128x128 for shared world mode)
- Tile types: grass (passable), forest (harvestable wood + forage), stone deposit (harvestable stone), water (impassable, provides fish if adjacent), fertile soil (farmable in later phases)
- Resources regenerate slowly — forests regrow over multiple days, stone does not
- Perlin noise or simplex noise for natural-looking terrain distribution
- Villages start with a central campfire tile and 10 villagers in a clearing
- Seed is displayed in the UI and can be copied/shared for reproducible comparisons

### Biome Presets (Phase 5)

Each biome modifies the base world generation parameters and environmental pressures:

- **Temperate (default):** Balanced resources, moderate seasons, standard predator frequency
- **Desert:** Scarce water and food, no winter but extreme daytime heat (introduces a "cooling" need that functions like warmth in reverse), oases are high-value contested zones, stone is abundant
- **Tundra:** Permanent cold pressure, short growing season (spring only), abundant wood and stone but scarce food, longer nights. Tests long-term planning and winter survival strategy
- **Island Archipelago:** Land broken into small islands separated by water, resources clustered per island, forces exploration and risky travel between islands. Tests how AI handles isolated resource pockets and whether it "discovers" new territory
- **Lush/Easy:** Abundant everything, fast regeneration. Control biome to see what each AI does when survival is not the bottleneck — do they still build? Do they expand? Do they stagnate?

### Day/Night Cycle & Seasons

- One full day = ~30 seconds real time at 1x speed
- Day phase: safe, full visibility, normal activity
- Night phase: dangerous (predator chance), reduced foraging efficiency, rest is more valuable
- Seasonal cycle (every ~7 days): Spring (growth bonus), Summer (normal), Autumn (harvest bonus, preparation window), Winter (resource drain, exposure risk, no regeneration)
- Season length and severity are tunable per biome

### Villager Attributes

Each villager has:

- **Hunger** (0–100): Depletes over time (~2 points per tick). At 0, health drains. Replenished by eating food
- **Energy** (0–100): Depletes from actions (~1–3 points per action depending on type). At 0, villager collapses and must rest. Replenished by resting at shelter or campfire
- **Health** (0–100): Damaged by starvation (1/tick at hunger 0), exposure (1/tick at warmth 0), predators (20–40 per attack). Heals slowly (+0.5/tick) when hunger > 50 and energy > 30. At 0, villager dies
- **Warmth** (0–100): Only relevant in winter or tundra biome. Drains when outside without shelter (~3/tick in winter). At 0, health drains. Replenished by fire or shelter

### Available Actions

- **Forage:** Gather food from forest tiles. Duration: 3 ticks. Depletes forest slowly. Yields 10–15 food
- **Chop Wood:** Harvest wood from forest tiles. Duration: 4 ticks. Yields 8–12 wood
- **Mine Stone:** Harvest stone from deposits. Duration: 5 ticks. Yields 6–10 stone
- **Build:** Construct a structure at a location. Duration varies by structure. Costs resources from village stockpile
- **Rest:** Recover energy. Duration: 2–4 ticks. +20 energy at campfire, +30 at shelter
- **Eat:** Consume food from village stockpile. Duration: 1 tick. +30 hunger
- **Flee:** Move away from threats at 2x speed. No resource cost but burns energy
- **Warm Up:** Move to fire/shelter to restore warmth. Duration: 2 ticks. +25 warmth
- **Haul:** Carry resources back to village stockpile. Duration depends on distance
- **Fish:** Gather food from water-adjacent tiles. Duration: 4 ticks. Yields 8–12 food. Available regardless of season (important for winter survival)

### Structures

- **Shelter:** Provides rest bonus (+10 energy), warmth in winter. Costs 20 wood. Capacity: 3 villagers
- **Storage:** Increases max resource stockpile by 100 per type. Costs 15 wood + 10 stone
- **Watchtower:** Increases predator detection radius by 8 tiles. Costs 10 wood + 15 stone
- **Farm:** Produces 5 food passively per day in spring/summer. Costs 15 wood, must be built on fertile soil
- **Wall Segment:** Slows predators to 0.5x speed in a 3-tile radius. Costs 12 stone
- **Well:** Provides water access away from natural water tiles. Costs 20 stone. Enables settlement in drier areas (critical for desert biome)

### Random Events (Mirrored Across Villages)

All events happen simultaneously to all villages to keep the comparison fair. In shared world mode, events affect the shared map and all villages experience them based on proximity.

- **Predator Attack:** A wolf or similar threat enters the map. Villagers must flee or risk 20–40 health damage. Detected earlier with watchtower
- **Blight:** Food sources in a 5-tile radius are temporarily destroyed (regrow after 3 days). Tests food stockpile management
- **Cold Snap:** Sudden temperature drop mid-autumn. Warmth drains at winter rate for 2 days. Tests winter preparedness
- **Resource Discovery:** A new resource deposit (forest or stone) appears at a random location. Tests exploration behavior and whether AI adapts to new opportunities
- **Illness:** One random villager gets sick (all stat drain rates doubled for 5 days). Tests whether the community compensates
- **Storm:** All outdoor action durations increased by 50% for 1 day. Tests efficiency under degraded conditions

### Population Growth

- When food stockpile > 50 AND at least one shelter has capacity, a new villager spawns every 12–15 in-game days
- New villagers start with all needs at 75 (not full, so they immediately need some care)
- Max population soft-capped by total shelter capacity (3 per shelter)
- Villages with no shelter capacity cannot grow regardless of food surplus
- This creates a strategic tension: invest resources in shelters to grow, or invest in other infrastructure

### Prosperity Score

A composite metric for comparison, calculated every in-game day:

    prosperity = (population x 10) + (avg_health x 0.5) + (food x 0.3) + (wood x 0.2) + (stone x 0.2) + (structures x 5) + (structure_variety_bonus) + (days_survived x 0.5)

- **population x 10:** Heaviest weight. Growing your population is the strongest indicator of a thriving village
- **avg_health x 0.5:** Healthy villagers matter. A large sick population scores lower than a small healthy one (relatively)
- **food/wood/stone x 0.3/0.2/0.2:** Resource stockpiles indicate surplus capacity. Food weighted highest
- **structures x 5:** Each structure is worth 5 points
- **structure_variety_bonus:** +10 for each unique structure type built (rewards diversification over spamming shelters)
- **days_survived x 0.5:** Small steady bonus for longevity

### Simulation End Conditions

The simulation needs explicit rules for when a village is eliminated and when the overall simulation ends, rather than running indefinitely or relying solely on the user pressing stop.

**Village elimination:**

- A village is eliminated when its population reaches 0 (all villagers dead)
- Elimination triggers a notable event in the event log with a timestamp and cause-of-death summary (e.g., "Village A eliminated — starvation during winter, day 47")
- The eliminated village's metrics freeze on the dashboard but remain visible for comparison
- In multi-village mode, the simulation continues as long as at least one village survives

**Simulation end triggers:**

- **All villages eliminated:** Simulation ends automatically. No winner — results summary shows comparative analysis of how long each survived and why each failed
- **Last village standing:** If all but one village is eliminated, the surviving village is declared the winner. Simulation continues for a configurable "victory lap" period (default: 10 more in-game days) so the user can see final metrics, then transitions to the results summary
- **User-defined time limit:** Optional setting on the setup screen — run for N in-game days (default: unlimited). When the limit is reached, the simulation ends and all surviving villages are compared on prosperity score
- **Manual stop:** User clicks stop at any time. Treated the same as a time limit — compare all surviving villages

**Edge cases:**

- **Simultaneous elimination:** If two villages hit 0 population on the same tick, both are eliminated simultaneously. The event log notes the tie. Neither is declared a winner
- **Stalemate detection:** If no village's prosperity score has changed by more than 5% over the last 30 in-game days, display a "stagnation warning" on the dashboard. This is informational only — the simulation does not auto-end, but it signals to the user that the interesting divergence may have already happened
- **Total resource depletion:** If all harvestable resources on the map are exhausted and no regeneration is pending, log a "resource exhaustion" event. This scenario is unlikely with forest regrowth but possible on small maps or after extended runs
- **Single villager remaining:** When a village is down to its last villager, log a "critical population" warning. The village cannot recover via population growth (requires shelter capacity + food surplus, and a single villager may not be able to sustain both), so this is effectively a slow elimination — but the simulation lets it play out rather than calling it early

### Save/Load & Data Export

Simulation state should be serializable for persistence and analysis. This avoids requiring users to re-run long simulations to revisit results.

**Simulation snapshots (Phase 2):**

- Serialize the full simulation state to JSON: world grid, all villager entities and their current state, village stockpiles, structure placements, event history, current tick number, RNG state, and active AI states
- Save snapshots to browser localStorage with a user-provided label or auto-generated name (seed + timestamp)
- Load a snapshot to resume a simulation from that exact point — useful for rewinding to a key moment and watching a different AI handle the same crisis
- Storage budget: cap at 5 saved snapshots in localStorage (each estimated at 200–500 KB for a 64x64 map). Show storage usage and allow deletion of old snapshots
- The RNG state must be captured so that loading a snapshot and pressing play produces the same sequence of events as the original run (deterministic replay)

**Run export (Phase 4):**

- After a simulation ends, export the full run as a downloadable JSON file containing: simulation config (seed, biome, AI types, time limit), tick-by-tick prosperity scores per village, event log, and final state snapshot
- CSV export option for the metrics data specifically (one row per in-game day, columns for each village's prosperity, population, resources, structures) — easy to open in a spreadsheet for custom analysis
- PNG export of the final prosperity chart — one-click screenshot of the key comparison graph for sharing

**Evolved genome persistence (Phase 5):**

- Trained genomes are saved separately from simulation snapshots — they represent hours of training and should not be lost
- Export/import genome files (JSON) so users can share evolved strategies
- Genome library: a dropdown on the setup screen listing all saved genomes with their training metadata (biome, generation count, best fitness)

---

## AI Systems

### System 1: Utility AI

Each villager evaluates every available action and assigns a score based on their current state and the environment.

**Scoring formula (per action):**

    score = sum(need_weight x need_relevance x urgency_curve(need_value)) + environmental_modifier + random(0, 0.1)

- **need_weight:** How important this need is to this action. Eating has hunger_weight = 1.0, energy_weight = 0.0
- **need_relevance:** Binary or graduated flag for whether this need applies
- **urgency_curve:** Exponential curve — `(1 - need_value/100)^2` — so hunger at 10 scores 0.81 while hunger at 60 scores 0.16
- **environmental_modifier:** Contextual adjustments (foraging at night: -0.3, warming up in winter: +0.2)
- **random factor:** Small noise (0–0.1) prevents all villagers from making identical choices

The highest-scoring action wins. Ties broken by random factor.

**Characteristics:** Reactive, adaptive, good at moment-to-moment optimization. Weakness: no long-term planning — may not build shelter until warmth is already critical. Tends to "thrash" between equally urgent needs.

### System 2: Behavior Trees

Each villager follows a hierarchical decision tree evaluated top to bottom each tick.

**Tree structure:**

```
Root (Selector)
+-- Emergency (Sequence)
|   +-- Check: health < 20? -> Find food/shelter, eat/rest (highest priority recovery)
|   +-- Check: threat within 5 tiles? -> Flee to nearest safe area
+-- Critical Needs (Priority Selector)
|   +-- Check: hunger < 25? -> Go to stockpile -> Eat (or forage if stockpile empty)
|   +-- Check: energy < 20? -> Go to shelter/campfire -> Rest
|   +-- Check: warmth < 25 AND winter? -> Go to fire/shelter -> Warm up
+-- Village Tasks (Priority Selector)
|   +-- Check: food stockpile < 30? -> Find forest -> Forage -> Haul
|   +-- Check: wood stockpile < 20? -> Find forest -> Chop -> Haul
|   +-- Check: shelters < population/3? -> Gather materials -> Build shelter
|   +-- Check: no storage AND resources near cap? -> Build storage
|   +-- Check: no watchtower AND population > 5? -> Build watchtower
+-- Proactive (Priority Selector)
|   +-- Check: season is autumn? -> Stockpile bias (+50% to forage/chop thresholds)
|   +-- Check: fertile soil available AND no farm? -> Build farm
+-- Idle -> Wander toward unexplored tiles / Rest if energy < 60
```

**Characteristics:** Predictable, easy to debug, reliable under normal conditions. Weakness: rigid priority ordering means it may neglect lower-priority tasks even when they would be strategically valuable. The autumn preparation behavior is hand-coded rather than emergent. Bad at balancing competing moderate needs.

### System 3: GOAP (Phase 4)

Each villager maintains a goal (desired world state) and uses A* search over an action graph to find the cheapest sequence of actions to achieve it.

**Action definitions (simplified):**

```
Action: Eat
Preconditions: { has_food: true }
Effects: { hunger: +30 }
Cost: 1

Action: Take from stockpile
Preconditions: { at_stockpile: true, stockpile_has_food: true }
Effects: { has_food: true }
Cost: 1

Action: Forage
Preconditions: { at_forest: true }
Effects: { stockpile_has_food: true }
Cost: 4

Action: Go to [location]
Preconditions: {}
Effects: { at_[location]: true }
Cost: distance / speed
```

**Example plan resolution:**

```
Goal: hunger > 50
Current state: hunger = 15, no food, stockpile empty, forest 8 tiles away
Plan: [Go to forest (cost 8)] -> [Forage (cost 4)] -> [Haul (cost 8)] -> [Take food (cost 1)] -> [Eat (cost 1)]
Total plan cost: 22
```

**Goal selection** uses a utility-style scorer to pick which goal is most important right now. The difference from pure Utility AI is that execution is a planned sequence rather than a single reactive action.

**Replanning triggers:** Plan becomes invalid when a precondition fails (e.g., someone else took the last food), a higher-priority goal emerges (health emergency), or the current action fails (blocked path). Replanning has a small cooldown (2 ticks) to prevent thrashing.

**Characteristics:** Plans ahead, handles complex multi-step tasks elegantly, can reason about dependencies. Weakness: planning is computationally expensive (mitigated by caching and plan reuse), plans can become invalid when the world changes mid-execution, and the system is the most complex to implement and debug.

### System 4: Evolutionary AI (Phase 5)

Instead of hand-designed decision logic, this system uses a set of numeric weights (a "genome") that get tuned through simulated natural selection across generations.

**Genome structure:**

Each villager carries a genome — a vector of ~20–30 floating-point weights that parameterize a simple decision function:

```
action_score = genome[action_id] x urgency(hunger) 
             + genome[action_id + offset] x urgency(energy)
             + genome[action_id + offset2] x urgency(health)
             + genome[action_id + offset3] x environmental_factor
             + genome[action_id + offset4] x seasonal_factor
```

This is structurally similar to Utility AI, but the weights are not designed — they are evolved.

**Evolution mechanics:**

- **Generation:** A full simulation run (or a fixed number of in-game days, e.g., 30 days = ~1 year)
- **Fitness function:** Prosperity score at end of generation, plus bonus for population growth and structure variety
- **Selection:** Top 30% of villagers by individual contribution to village prosperity are selected as parents
- **Crossover:** Two parents produce offspring genomes via single-point crossover
- **Mutation:** Each weight has a 5% chance of being perturbed by a random value in [-0.2, +0.2]
- **Seeding:** Generation 0 starts with random genomes (uniformly distributed weights in [0, 1])
- **Training mode:** Run N generations silently (fast-forward, no rendering) to pre-train a genome before competition. User can configure N (default: 50 generations). Training runs in a Web Worker to keep the UI responsive
- **Training UX:** The training progress UI should display: current generation number, estimated time remaining (based on average time per generation so far), best fitness score with a sparkline graph of fitness over generations, and a "Stop Early" button that halts training and uses the best genome found so far. If the user stops early, the genome is still fully usable — it just may not have converged to its best possible strategy. Additionally, display a convergence indicator: if the best fitness has not improved by more than 1% over the last 10 generations, show a "Plateaued" label suggesting the user can stop without losing much
- **Competition mode:** The best genome from training competes against the other AI systems in a standard simulation run

**Visualization in inspector:**

- Show the genome as a heatmap of weights
- Show current fitness score and generation number
- Show which weights are driving the current decision

**What makes this interesting:** The evolutionary AI might discover strategies no human designer thought of. It might over-specialize in ways that are brilliant in one biome and catastrophic in another. Comparing it against hand-crafted systems tests the fundamental question: is evolved intelligence competitive with designed intelligence?

**Characteristics:** Unpredictable, potentially creative, improves over generations. Weakness: requires training time, no guarantee of convergence, may develop degenerate strategies, hard to interpret why it makes specific decisions.

---

## Shared World Mode (Phase 6)

### Concept

Instead of isolated villages on mirrored maps, all villages exist on a single larger map (128x128) with shared resources. Villages start in different corners and must expand, explore, and inevitably compete for the same resource nodes.

### New Mechanics

**Territory:** Each village implicitly "claims" tiles that its villagers frequently visit. Claimed territory is visible on the minimap as color-coded zones. Territory has no mechanical enforcement — it is purely a visualization of where each village operates.

**Resource Competition:** When two villagers from different villages target the same resource tile, they both attempt to harvest it. First to finish gets the resource. The remaining yield is reduced for the next harvester. This creates natural economic competition without explicit combat.

**Contested Zones:** The metrics dashboard tracks which resource tiles are being harvested by multiple villages. A "contested resources" chart shows how much overlap exists and which village is winning the competition.

**Proximity Events:** Some events become location-based rather than mirrored. A predator spawns at a specific map location and threatens whichever village is nearby. A blight hits a specific forest that one village may depend on more than another. This makes positioning and exploration strategy meaningful.

**No Direct Combat (v1):** Villages do not attack each other. Competition is purely economic — who can harvest more efficiently, who claims the best resource nodes first, who adapts when a shared forest is depleted. This keeps the focus on AI decision-making rather than combat AI, which is a different problem entirely.

### New Metrics for Shared World

- **Territory size:** Tiles visited by each village in the last N days
- **Resource efficiency:** Resources gathered per villager per day
- **Exploration rate:** How quickly each village discovers new areas of the map
- **Conflict rate:** How often villagers from different villages target the same resource
- **Adaptation speed:** How quickly a village shifts to new resource sources when current ones are contested or depleted

### Map Layout

The 128x128 shared map uses the same noise-based generation but with guaranteed starting clearings in each corner. Resource distribution ensures each starting area is viable but the richest deposits are toward the center, creating a natural incentive to expand and eventually overlap.

---

## Development Phases

### Phase 1: Foundation (Target: 1–2 weeks)

**Goal:** One village running with Utility AI, viewable in the metrics dashboard.

- Project scaffolding (Vite + React + TypeScript + PixiJS + Zustand + Vitest)
- Seeded world generation (64x64 tile grid with Perlin noise resource distribution)
- Core simulation loop (tick-based, decoupled from rendering via requestAnimationFrame)
- A* pathfinding for villager movement on the tile grid
- Villager entity with needs system (hunger, energy, health — warmth deferred to Phase 2)
- Basic actions: forage, eat, rest, chop wood, haul, fish
- AI interface definition (shared TypeScript interface that all AI systems will implement)
- Utility AI scoring system (first implementation of the interface)
- Metrics dashboard with population, resources, and activity charts (Recharts)
- Simulation controls (start, pause, speed slider 1x–8x, reset)
- Day/night cycle (visual indication on dashboard via background color or icon, mechanical effect on action efficiency)
- Seed display + input field for reproducible runs
- Unit tests for simulation engine tick logic, pathfinding, and utility scoring
- **Deterministic snapshot test:** Run a simulation with a fixed seed for exactly 100 ticks, then assert the exact world state (villager positions, need values, resource counts, stockpile totals). This single test catches regressions across the entire simulation pipeline — if any change to tick logic, pathfinding, action resolution, or utility scoring alters the outcome, this test fails. Update the snapshot whenever intentional behavior changes are made. This is the single most valuable test in the project and should be written as soon as the simulation loop is functional
- **Stress test:** Run 1,000 ticks with a random seed and assert no crashes, no NaN values in villager attributes, no villagers outside map bounds, and no negative resource counts. This catches edge cases that a single snapshot test might miss

**Milestone deliverable:** A single village of utility AI villagers surviving (or dying) on the metrics dashboard. Looks like a monitoring tool. Simulation is playable, watchable, and reproducible via seed.

### Phase 2: Competition (Target: 1–2 weeks)

**Goal:** Two villages side by side, Utility AI vs Behavior Trees, full comparison.

- Behavior tree AI system (second implementation of the AI interface)
- Dual village simulation running on shared world seed
- Side-by-side metrics comparison (dashboard view — two columns of charts)
- Event log with timestamped notable moments, color-coded per village
- Mirrored random events system (predators, blight, cold snap)
- Prosperity score calculation with explicit weights (see formula in Simulation Design)
- Seasonal cycle (spring/summer/autumn/winter with mechanical effects)
- Warmth system + winter mechanics
- Population growth system (food surplus + shelter capacity triggers)
- Structures: shelter, storage (first buildable structures — build action now functional)
- Quick-compare table (bottom strip of dashboard)
- Unit tests for behavior tree evaluation and event mirroring
- **Cross-AI determinism test:** Run identical seeds with Utility AI and Behavior Trees separately, verify that the world generation and event sequence are identical (only AI decisions should differ). This validates that the comparison is fair — both AI systems are reacting to the same world, not subtly different ones
- **Event mirroring test:** Trigger each event type in a dual-village simulation and assert that both villages receive the event on the same tick with the same parameters (location offset, severity, duration)

**Milestone deliverable:** Two villages competing on the dashboard. Clear divergence visible in metrics. Event log tells the story. Population growth and winter survival create meaningful strategic differentiation.

### Phase 3: Visual Layer (Target: 1–2 weeks)

**Goal:** Add the pixel art simulation view as a toggle alongside the dashboard.

- PixiJS rendering layer for tile grid and villager sprites
- 16x16 sprite set: terrain tiles (6 types), villager animations (walk, work, rest, flee — 4 frames each), structures (5 types), resources
- Side-by-side village canvases with independent pan/zoom
- Villager inspector panel (click to see decision rationale — utility scores or BT active node)
- Day/night visual overlay (darken + blue tint at night)
- Seasonal visual changes (green to gold to brown to white palette shifts)
- Minimap per village showing population density and resource distribution
- Toggle between metrics view and simulation view (shared top bar)
- **Sprite asset pipeline:** Use `free-tex-packer-cli` (open source, no license cost) to pack individual 16x16 PNGs into optimized sprite sheets with a JSON atlas file. Add an npm script (`npm run pack-sprites`) that watches `src/assets/sprites/source/` and outputs packed sheets to `src/assets/sprites/packed/`. PixiJS loads the JSON atlas via `Assets.load()` which handles frame lookup automatically. This keeps the art workflow simple: drop a new PNG in the source folder, run the packer, and the sprite is available in-engine. For the initial Phase 3 sprite set (~30–40 individual frames across terrain, villagers, and structures), a single 256x256 sprite sheet should suffice

**Milestone deliverable:** Full dual-view experience. Metrics dashboard as default, toggle to watch the villages visually. Click villagers to see their AI thinking in real time.

### Phase 4: GOAP & Polish (Target: 2–3 weeks)

**Goal:** Third AI system, more content, results summary.

- GOAP planning system with action graph, preconditions, effects, and A* plan search
- Plan caching and reuse (don't replan every tick — only on invalidation or cooldown)
- Three-village comparison mode (dashboard and sim view both scale to 3 columns)
- Additional structures: watchtower, farm, wall segment, well
- Additional events: illness, storm, resource discovery
- Results summary screen (post-simulation analysis with final stats, key moments, graphs, winner callout)
- "Run again with same seed" button on results screen
- Performance optimization: simulation tick profiling, spatial hashing for proximity checks, batch rendering
- Visual polish: simple particle effects for actions (chop sparks, forage leaf scatter), status icons above villagers (hungry, tired, fleeing)
- Villager inspector updated for GOAP (shows current goal, planned action sequence, plan cost)
- Integration tests: run 100 seeded simulations per AI type, verify no crashes, log average prosperity for regression tracking

**Milestone deliverable:** The three-AI-system experience. GOAP, Utility, and Behavior Trees competing head to head, viewable as either a data dashboard or a pixel art simulation, with full post-run analysis.

### Phase 5: Evolutionary AI & Biomes (Target: 2–3 weeks)

**Goal:** Fourth AI system via evolutionary training, plus multiple biome presets that stress-test all AI systems differently.

- Evolutionary AI genome structure and decision function
- Training mode: headless fast-forward simulation for N generations with selection, crossover, and mutation
- Training progress UI: generation count, best fitness over time, genome heatmap visualization
- Pre-train button on setup screen ("Train for 50 generations" with progress bar)
- Competition mode: evolved genome enters the standard simulation alongside hand-crafted AI systems
- Villager inspector updated for evolutionary AI (genome heatmap, fitness score, weight-driven decision breakdown)
- Biome preset system: parameterized world generation that modifies tile distribution, seasonal intensity, event frequency, and environmental pressures
- Biome implementations: Temperate (default), Desert, Tundra, Island Archipelago, Lush/Easy
- Desert-specific mechanic: "cooling" need (functions like inverted warmth — drains in daytime, replenished by shade/well)
- Biome selector on setup screen (dropdown or visual cards)
- Setup screen: choose number of villages (2–4), assign AI type per village, select biome, enter seed
- Dashboard additions: biome indicator, generation/fitness display for evolutionary village
- Automated biome benchmark: run each AI type across all biomes (headless), export results as CSV for analysis
- Unit tests for genome crossover/mutation, biome generation parameters

**Milestone deliverable:** Four AI systems competing across five distinct biomes. The evolutionary AI brings an unpredictable wildcard to the competition. Biome variety reveals which AI architectures are robust generalists vs environment-specific specialists.

### Phase 6: Shared World Mode (Target: 3–4 weeks)

**Goal:** All villages on a single shared map competing for the same resources.

- Shared world map generation (128x128 with guaranteed starting clearings per village)
- Resource competition mechanics (simultaneous harvesting, yield reduction, depletion tracking)
- Territory visualization (minimap color-coding based on villager visit frequency)
- Single shared PixiJS canvas with color-coded villager sprites per village
- Proximity-based events (location-specific rather than mirrored)
- New metrics: territory size, resource efficiency, exploration rate, conflict rate, adaptation speed
- Dashboard updates: contested resources chart, territory map, efficiency comparison
- Villager AI updates: all four AI systems need awareness of other-village villagers (not as threats in v1, but as resource competitors). This means utility scores, behavior tree conditions, GOAP preconditions, and evolutionary inputs all need a "competition pressure" signal
- Shared world setup screen: choose number of villages (2–4), assign AI types, select biome, enter seed
- Performance optimization: 128x128 map with up to 4 villages means potentially 40+ active villagers. Spatial partitioning (grid-based or quadtree) for efficient proximity queries. Simulation tick budget targeting 60fps at 1x speed
- Camera controls: free-roam across the full shared map, click village name in dashboard to snap camera to that village territory
- Integration tests: verify resource competition fairness, no village gets systematic advantage from map position
- Shovel Monster export notes: document which AI interface patterns, pathfinding utilities, and entity structures could transfer to Unity/C#. Flag any TypeScript-specific patterns that would need rethinking

**Milestone deliverable:** The full shared-world experience. Multiple villages on one map, competing economically for shared resources, with territory visualization and competition metrics. This is the capstone version — a genuine AI ecosystem where different decision architectures interact indirectly through the environment.

---

## File Structure (Planned)

```
ai-colony/
|-- src/
|   |-- simulation/
|   |   |-- world.ts              # World generation, tile grid, resources
|   |   |-- biomes.ts             # Biome presets and parameter definitions (Phase 5)
|   |   |-- villager.ts           # Villager entity, needs, actions
|   |   |-- simulation-engine.ts  # Core tick loop, event scheduling
|   |   |-- events.ts             # Random event definitions and triggers
|   |   |-- structures.ts         # Building types, construction logic
|   |   |-- territory.ts          # Territory tracking for shared world (Phase 6)
|   |   |-- competition.ts        # Resource competition logic (Phase 6)
|   |   +-- ai/
|   |       |-- ai-interface.ts   # Shared interface all AI systems implement
|   |       |-- utility-ai.ts     # Utility scoring system
|   |       |-- behavior-tree.ts  # BT node definitions and evaluation
|   |       |-- goap.ts           # GOAP planner (Phase 4)
|   |       |-- evolutionary.ts   # Genome, training loop, evolution (Phase 5)
|   |       +-- competition-signals.ts  # Competition environment data for AI consumption (Phase 6)
|   |-- training/
|   |   |-- trainer.ts            # Headless generation runner (Phase 5)
|   |   |-- fitness.ts            # Fitness evaluation functions (Phase 5)
|   |   +-- genome.ts             # Genome operations: crossover, mutation (Phase 5)
|   |-- views/
|   |   |-- MetricsDashboard.tsx  # Default "stealth mode" analytics view
|   |   |-- SimulationView.tsx    # PixiJS village rendering (Phase 3)
|   |   |-- SharedWorldView.tsx   # Single-canvas shared map rendering (Phase 6)
|   |   |-- VillagerInspector.tsx # Decision rationale overlay
|   |   |-- EventLog.tsx          # Shared scrolling event timeline
|   |   |-- ResultsSummary.tsx    # Post-simulation analysis (Phase 4)
|   |   |-- TrainingView.tsx      # Evolution training progress UI (Phase 5)
|   |   +-- SetupScreen.tsx       # Pre-sim config: AI types, biome, seed, mode
|   |-- components/
|   |   |-- TopBar.tsx            # Sim controls, speed, time display
|   |   |-- KPICard.tsx           # Headline stat cards per village
|   |   |-- CompareTable.tsx      # Quick-compare stats table
|   |   |-- ViewToggle.tsx        # Switch between metrics and sim view
|   |   |-- GenomeHeatmap.tsx     # Evolutionary AI weight visualization (Phase 5)
|   |   |-- TerritoryMap.tsx      # Shared world territory overlay (Phase 6)
|   |   +-- BiomeSelector.tsx     # Biome picker for setup screen (Phase 5)
|   |-- store/
|   |   +-- simulation-store.ts   # Zustand store for sim state
|   |-- utils/
|   |   |-- noise.ts              # Perlin/simplex noise for world gen
|   |   |-- pathfinding.ts        # A* for villager movement
|   |   |-- spatial.ts            # Spatial partitioning for proximity queries
|   |   |-- scoring.ts            # Prosperity score calculation
|   |   |-- seed.ts               # Seeded RNG utility
|   |   |-- serialization.ts     # Simulation state snapshot save/load (Phase 2)
|   |   +-- export.ts             # JSON/CSV/PNG run export (Phase 4)
|   |-- assets/
|   |   +-- sprites/
|   |       |-- source/           # Individual 16x16 PNGs (art source files)
|   |       +-- packed/           # Generated sprite sheets + JSON atlas (Phase 3)
|   |-- App.tsx
|   +-- main.tsx
|-- tests/
|   |-- simulation-engine.test.ts
|   |-- pathfinding.test.ts
|   |-- utility-ai.test.ts
|   |-- behavior-tree.test.ts
|   |-- goap.test.ts
|   |-- genome.test.ts
|   |-- events.test.ts
|   |-- deterministic-snapshot.test.ts  # Fixed-seed 100-tick state assertion (Phase 1)
|   |-- stress.test.ts                  # 1000-tick crash/NaN/bounds check (Phase 1)
|   |-- event-mirroring.test.ts         # Cross-village event fairness (Phase 2)
|   +-- benchmarks/
|       +-- biome-benchmark.ts    # Automated multi-biome AI comparison (Phase 5)
|-- index.html
|-- package.json
|-- tsconfig.json
|-- vitest.config.ts
+-- vite.config.ts
```

---

## Shovel Monster Export Notes

Throughout development, the following patterns and systems should be built with eventual Unity/C# portability in mind:

- **AI Interface:** The shared IAISystem interface (evaluate state then choose action) maps directly to a C# interface. Keep it clean and avoid TypeScript-specific patterns like union types in the interface boundary
- **Behavior Tree:** Node-based BT architecture is essentially identical in C# Unity. Libraries like NodeCanvas or custom implementations follow the same selector/sequence/decorator pattern
- **GOAP:** The action graph + A* planner is language-agnostic. The main translation effort is converting TypeScript action definitions to C# ScriptableObjects or similar Unity data containers
- **Utility AI:** Scoring curves and weight systems transfer trivially. Unity AnimationCurve could replace the exponential urgency functions
- **Pathfinding:** A* on a tile grid is the same everywhere. Unity has NavMesh for 3D but the grid-based implementation is still useful for voxel terrain
- **Needs System:** Hunger/energy/health/warmth as depleting floats with thresholds — identical pattern in any language
- **Event System:** The mirrored/proximity event architecture could become a Unity event bus or ScriptableObject-based event system

---

## Design Considerations

### Competition Awareness Architecture (Phase 6)

The file structure currently lists `competition-aware.ts` as a standalone module under `ai/`. In practice, competition awareness needs to integrate differently into each AI system — Utility AI needs a new scoring term, Behavior Trees need new condition nodes, GOAP needs new preconditions and possibly new actions, and Evolutionary AI needs additional genome inputs. A standalone module would either become a grab-bag of unrelated helpers or force an awkward adapter pattern.

A better approach: define a `CompetitionSignals` interface in `ai-interface.ts` that provides each AI system with a standardized view of the competitive environment — nearby rival villagers, contested resource tiles, territory pressure scores. Each AI system then consumes these signals in its own idiomatic way:

- **Utility AI:** Add a `competition_modifier` term to the scoring formula. When a resource tile has rival villagers nearby, reduce its score (the resource might be taken before you arrive). When an uncontested tile exists farther away, boost its score relative to a contested closer one
- **Behavior Trees:** Add a new condition branch under Village Tasks: `Check: target resource is contested? -> Find uncontested alternative`. This slots naturally into the existing priority structure
- **GOAP:** Add a `tile_is_uncontested` precondition to harvesting actions. When contested, the planner will automatically find alternative plans (different resource tiles, different action sequences) because the precondition fails on contested tiles. This is GOAP's strength — it handles disruption through replanning rather than explicit branching
- **Evolutionary AI:** Add competition signal inputs to the genome's decision function (e.g., `genome[offset] x nearby_rival_count`). Evolution will discover whether to avoid rivals, race them, or ignore them entirely — this is one of the most interesting things to watch evolve

The `competition-aware.ts` file should be renamed to `competition-signals.ts` and contain only the `CompetitionSignals` computation logic (scanning for nearby rivals, calculating contested tile maps, territory pressure). It provides data; each AI system decides what to do with it.

### Prosperity Score Weighting

The current prosperity formula weights population at ×10, which is significantly heavier than any other factor. This creates a scoring dynamic where:

- **Early game (days 1–15):** Population is fixed at 10 (no growth yet — requires food surplus + shelter). The score is dominated by resource stockpiles (food ×0.3, wood ×0.2, stone ×0.2) and structures (×5 each). Differences between AI systems show up as resource management efficiency
- **Mid game (days 15–30):** Population growth kicks in. Each new villager adds 10 points — equivalent to building two structures or stockpiling 50 food. The score begins tilting toward whichever AI system invests in shelters earlier
- **Late game (days 30+):** Population dominates. A village with 20 villagers has a 100-point advantage over a village with 10, regardless of resource efficiency or infrastructure

This isn't necessarily wrong — population growth *is* the strongest indicator of a thriving village. But it means the prosperity chart will show a relatively flat early period followed by exponential divergence once growth begins, which could make the early game metrics look uninteresting on the dashboard.

**Recommendation:** Consider a normalized scoring variant displayed alongside the raw prosperity score — a "per-capita prosperity" metric that divides by population. This shows efficiency rather than scale and keeps the early-game comparison meaningful. The raw prosperity score remains the primary comparison metric, but per-capita prosperity reveals which AI system is running a *healthier* village rather than just a *bigger* one.

### Variable-Length Need Vectors

The current design has four hardcoded needs: hunger, energy, health, and warmth. The desert biome (Phase 5) adds a fifth: cooling. If future biomes or gameplay experiments add more needs (morale, hydration as distinct from hunger, etc.), the AI interface must handle this gracefully.

**Problem:** If the AI interface hardcodes `hunger: number, energy: number, health: number, warmth: number` as separate fields, every new need requires changes to the interface, every AI implementation, every inspector panel, and every scoring function. This is fragile and scales poorly.

**Recommendation:** Define needs as a `Map<NeedType, NeedState>` (or a typed record with a string enum key) rather than individual fields. The `NeedType` enum starts with `hunger | energy | health | warmth` and is extended per biome. Each `NeedState` contains the current value (0–100), drain rate, and replenishment sources.

This affects each AI system:

- **Utility AI:** The scoring formula already iterates over needs conceptually (`sum(need_weight x need_relevance x urgency_curve(need_value))`). Making this iteration literal over a `Map<NeedType, number>` is trivial and means new needs are automatically scored if weights are provided
- **Behavior Trees:** The Critical Needs branch becomes a loop over active needs rather than hardcoded checks. Each need maps to a response action (warmth → warm up, cooling → find shade/well, hunger → eat). New needs require adding the mapping entry but not restructuring the tree
- **GOAP:** Preconditions and effects reference needs by `NeedType` key rather than hardcoded field names. Adding a new need means defining new actions that affect it, which GOAP handles naturally
- **Evolutionary AI:** The genome size becomes dynamic — `num_actions x num_active_needs x num_modifiers`. Training on a biome with more needs produces a larger genome. Genomes trained on one biome won't directly transfer to another with different needs, but this is actually interesting behavior to observe and discuss

The AI interface in `ai-interface.ts` should define needs generically from day one, even though Phase 1 only uses hunger, energy, and health. This avoids a painful refactor when warmth is added in Phase 2 and cooling in Phase 5.

---

## Open Questions & Future Ideas

- **Multiplayer observation:** Could multiple people watch the same simulation in real time? (WebSocket sync, requires backend)
- **Custom AI scripting:** Let users write their own AI logic in a simple DSL and pit it against the built-in systems
- **Direct combat:** In shared world mode, should villages eventually be able to attack each other? (Separate problem from economic competition, may warrant its own phase)
- **Diplomacy/trading:** Could villages in shared world mode develop implicit or explicit resource trading?
- **Twitch integration:** Stream a simulation and let chat vote on which events to trigger

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-03 | 1.0 | Initial project plan created from brainstorming session. Core concept, technical stack, simulation design, three AI systems, four development phases, and file structure defined. |
| 2026-03-03 | 1.1 | Added Phase 5 (Evolutionary AI & Biomes) and Phase 6 (Shared World Mode). Fixed GOAP phase labeling. Moved population growth from Phase 4 to Phase 2. Added pathfinding to Phase 1 task list. Added explicit numeric values for villager attributes, action durations, structure costs, and prosperity score formula. Added testing strategy throughout all phases. Added Fish action and Well structure. Added Shovel Monster export notes section. Expanded file structure for new phases. Added Setup Screen to views. Updated open questions. Removed items promoted to phases from open questions list. |
| 2026-03-03 | 1.2 | Added Simulation End Conditions section covering village elimination, end triggers, and edge cases (stalemate detection, simultaneous elimination, total resource depletion, single villager remaining). Added Save/Load & Data Export section with simulation snapshots (Phase 2), run export in JSON/CSV/PNG (Phase 4), and evolved genome persistence (Phase 5). Expanded evolutionary AI training UX with estimated time remaining, stop-early support, and convergence/plateau detection. Strengthened Phase 1 testing with deterministic snapshot test and stress test. Strengthened Phase 2 testing with cross-AI determinism and event mirroring tests. Specified sprite pipeline tooling (free-tex-packer-cli) in Phase 3. Added Design Considerations section covering competition awareness architecture (recommending CompetitionSignals interface over standalone module, renamed competition-aware.ts to competition-signals.ts), prosperity score weighting analysis with per-capita prosperity recommendation, and variable-length need vectors using Map<NeedType, NeedState> for biome extensibility. Updated file structure with serialization.ts, export.ts, sprite source/packed directories, and new test files. |
