# Comparison Diagnostic Report

## 1. Run Configuration
- **Scenario:** Live Comparison
- **World Size:** 32
- **Seed:** 42
- **Total Ticks:** 904
- **Agent Count:** 1

## 2. Performance Comparison
| Metric | A* | HPA* |
|--------|-----|------|
| Pathfinding Time (last tick) | 0.000 ms | 0.000 ms |
| Trips Completed | 33 | 35 |
| Budget Overruns | 0 | 0 |
| Deferred Reroutes | 0 | 0 |
| Wait Events | 0 | 0 |
| Total Wait Ticks | 0 | 0 |
| Stuck Agents | 0 | 0 |
| Algorithm Errors | 0 | 0 |

## 3. Bug Detection / Anomaly Log
No anomalies detected on either side.

## 4. Plan Compliance Checklist
- [x] No algorithm errors
- [x] No stuck agents at end
- [x] No budget overruns

## 5. Agent Behavior Summary
### A*
| Agent | State | Position | Destination |
|-------|-------|----------|-------------|
| #1 | Navigating | (18, 1, 26) | (22, 1, 26) |

### HPA*
| Agent | State | Position | Destination |
|-------|-------|----------|-------------|
| #1 | Navigating | (18, 1, 24) | (18, 1, 27) |

## 6. Event Timeline
### A*
_(showing last 50 of 67 events)_
- **Tick 191** [destination_reached]: Agent #1 arrived at (22, 1, 5) in 32 ticks
- **Tick 191** [destination_assigned]: Agent #1 assigned (22, 1, 5) → (4, 1, 7) (path: 21 steps)
- **Tick 212** [destination_reached]: Agent #1 arrived at (4, 1, 7) in 20 ticks
- **Tick 212** [destination_assigned]: Agent #1 assigned (4, 1, 7) → (27, 1, 14) (path: 31 steps)
- **Tick 243** [destination_reached]: Agent #1 arrived at (27, 1, 14) in 30 ticks
- **Tick 243** [destination_assigned]: Agent #1 assigned (27, 1, 14) → (3, 1, 9) (path: 30 steps)
- **Tick 273** [destination_reached]: Agent #1 arrived at (3, 1, 9) in 29 ticks
- **Tick 273** [destination_assigned]: Agent #1 assigned (3, 1, 9) → (0, 1, 13) (path: 8 steps)
- **Tick 281** [destination_reached]: Agent #1 arrived at (0, 1, 13) in 7 ticks
- **Tick 281** [destination_assigned]: Agent #1 assigned (0, 1, 13) → (9, 1, 4) (path: 19 steps)
- **Tick 300** [destination_reached]: Agent #1 arrived at (9, 1, 4) in 18 ticks
- **Tick 300** [destination_assigned]: Agent #1 assigned (9, 1, 4) → (24, 1, 28) (path: 40 steps)
- **Tick 340** [destination_reached]: Agent #1 arrived at (24, 1, 28) in 39 ticks
- **Tick 340** [destination_assigned]: Agent #1 assigned (24, 1, 28) → (3, 1, 29) (path: 23 steps)
- **Tick 363** [destination_reached]: Agent #1 arrived at (3, 1, 29) in 22 ticks
- **Tick 363** [destination_assigned]: Agent #1 assigned (3, 1, 29) → (1, 1, 8) (path: 24 steps)
- **Tick 387** [destination_reached]: Agent #1 arrived at (1, 1, 8) in 23 ticks
- **Tick 387** [destination_assigned]: Agent #1 assigned (1, 1, 8) → (25, 1, 21) (path: 38 steps)
- **Tick 425** [destination_reached]: Agent #1 arrived at (25, 1, 21) in 37 ticks
- **Tick 425** [destination_assigned]: Agent #1 assigned (25, 1, 21) → (14, 1, 27) (path: 18 steps)
- **Tick 443** [destination_reached]: Agent #1 arrived at (14, 1, 27) in 17 ticks
- **Tick 443** [destination_assigned]: Agent #1 assigned (14, 1, 27) → (27, 1, 2) (path: 39 steps)
- **Tick 482** [destination_reached]: Agent #1 arrived at (27, 1, 2) in 38 ticks
- **Tick 482** [destination_assigned]: Agent #1 assigned (27, 1, 2) → (22, 1, 31) (path: 35 steps)
- **Tick 517** [destination_reached]: Agent #1 arrived at (22, 1, 31) in 34 ticks
- **Tick 517** [destination_assigned]: Agent #1 assigned (22, 1, 31) → (17, 1, 1) (path: 36 steps)
- **Tick 553** [destination_reached]: Agent #1 arrived at (17, 1, 1) in 35 ticks
- **Tick 553** [destination_assigned]: Agent #1 assigned (17, 1, 1) → (5, 1, 14) (path: 26 steps)
- **Tick 579** [destination_reached]: Agent #1 arrived at (5, 1, 14) in 25 ticks
- **Tick 579** [destination_assigned]: Agent #1 assigned (5, 1, 14) → (2, 1, 1) (path: 17 steps)
- **Tick 596** [destination_reached]: Agent #1 arrived at (2, 1, 1) in 16 ticks
- **Tick 596** [destination_assigned]: Agent #1 assigned (2, 1, 1) → (24, 1, 19) (path: 41 steps)
- **Tick 637** [destination_reached]: Agent #1 arrived at (24, 1, 19) in 40 ticks
- **Tick 637** [destination_assigned]: Agent #1 assigned (24, 1, 19) → (6, 1, 24) (path: 24 steps)
- **Tick 661** [destination_reached]: Agent #1 arrived at (6, 1, 24) in 23 ticks
- **Tick 661** [destination_assigned]: Agent #1 assigned (6, 1, 24) → (23, 1, 5) (path: 37 steps)
- **Tick 698** [destination_reached]: Agent #1 arrived at (23, 1, 5) in 36 ticks
- **Tick 698** [destination_assigned]: Agent #1 assigned (23, 1, 5) → (7, 1, 15) (path: 27 steps)
- **Tick 725** [destination_reached]: Agent #1 arrived at (7, 1, 15) in 26 ticks
- **Tick 725** [destination_assigned]: Agent #1 assigned (7, 1, 15) → (19, 1, 25) (path: 23 steps)
- **Tick 748** [destination_reached]: Agent #1 arrived at (19, 1, 25) in 22 ticks
- **Tick 748** [destination_assigned]: Agent #1 assigned (19, 1, 25) → (14, 1, 2) (path: 29 steps)
- **Tick 777** [destination_reached]: Agent #1 arrived at (14, 1, 2) in 28 ticks
- **Tick 777** [destination_assigned]: Agent #1 assigned (14, 1, 2) → (30, 1, 31) (path: 46 steps)
- **Tick 823** [destination_reached]: Agent #1 arrived at (30, 1, 31) in 45 ticks
- **Tick 823** [destination_assigned]: Agent #1 assigned (30, 1, 31) → (17, 1, 5) (path: 40 steps)
- **Tick 863** [destination_reached]: Agent #1 arrived at (17, 1, 5) in 39 ticks
- **Tick 863** [destination_assigned]: Agent #1 assigned (17, 1, 5) → (8, 1, 9) (path: 14 steps)
- **Tick 877** [destination_reached]: Agent #1 arrived at (8, 1, 9) in 13 ticks
- **Tick 877** [destination_assigned]: Agent #1 assigned (8, 1, 9) → (22, 1, 26) (path: 32 steps)

### HPA*
_(showing last 50 of 71 events)_
- **Tick 243** [destination_reached]: Agent #1 arrived at (27, 1, 14) in 30 ticks
- **Tick 243** [destination_assigned]: Agent #1 assigned (27, 1, 14) → (3, 1, 9) (path: 30 steps)
- **Tick 273** [destination_reached]: Agent #1 arrived at (3, 1, 9) in 29 ticks
- **Tick 273** [destination_assigned]: Agent #1 assigned (3, 1, 9) → (0, 1, 13) (path: 10 steps)
- **Tick 283** [destination_reached]: Agent #1 arrived at (0, 1, 13) in 9 ticks
- **Tick 283** [destination_assigned]: Agent #1 assigned (0, 1, 13) → (16, 1, 30) (path: 34 steps)
- **Tick 317** [destination_reached]: Agent #1 arrived at (16, 1, 30) in 33 ticks
- **Tick 317** [destination_assigned]: Agent #1 assigned (16, 1, 30) → (0, 1, 13) (path: 34 steps)
- **Tick 351** [destination_reached]: Agent #1 arrived at (0, 1, 13) in 33 ticks
- **Tick 351** [destination_assigned]: Agent #1 assigned (0, 1, 13) → (12, 1, 0) (path: 26 steps)
- **Tick 377** [destination_reached]: Agent #1 arrived at (12, 1, 0) in 25 ticks
- **Tick 377** [destination_assigned]: Agent #1 assigned (12, 1, 0) → (15, 1, 29) (path: 33 steps)
- **Tick 410** [destination_reached]: Agent #1 arrived at (15, 1, 29) in 32 ticks
- **Tick 410** [destination_assigned]: Agent #1 assigned (15, 1, 29) → (0, 1, 15) (path: 30 steps)
- **Tick 440** [destination_reached]: Agent #1 arrived at (0, 1, 15) in 29 ticks
- **Tick 440** [destination_assigned]: Agent #1 assigned (0, 1, 15) → (27, 1, 4) (path: 39 steps)
- **Tick 479** [destination_reached]: Agent #1 arrived at (27, 1, 4) in 38 ticks
- **Tick 479** [destination_assigned]: Agent #1 assigned (27, 1, 4) → (10, 1, 30) (path: 44 steps)
- **Tick 523** [destination_reached]: Agent #1 arrived at (10, 1, 30) in 43 ticks
- **Tick 523** [destination_assigned]: Agent #1 assigned (10, 1, 30) → (28, 1, 10) (path: 39 steps)
- **Tick 562** [destination_reached]: Agent #1 arrived at (28, 1, 10) in 38 ticks
- **Tick 562** [destination_assigned]: Agent #1 assigned (28, 1, 10) → (21, 1, 9) (path: 9 steps)
- **Tick 571** [destination_reached]: Agent #1 arrived at (21, 1, 9) in 8 ticks
- **Tick 571** [destination_assigned]: Agent #1 assigned (21, 1, 9) → (26, 1, 0) (path: 15 steps)
- **Tick 586** [destination_reached]: Agent #1 arrived at (26, 1, 0) in 14 ticks
- **Tick 586** [destination_assigned]: Agent #1 assigned (26, 1, 0) → (13, 1, 16) (path: 30 steps)
- **Tick 616** [destination_reached]: Agent #1 arrived at (13, 1, 16) in 29 ticks
- **Tick 616** [destination_assigned]: Agent #1 assigned (13, 1, 16) → (28, 1, 17) (path: 17 steps)
- **Tick 633** [destination_reached]: Agent #1 arrived at (28, 1, 17) in 16 ticks
- **Tick 633** [destination_assigned]: Agent #1 assigned (28, 1, 17) → (19, 1, 26) (path: 19 steps)
- **Tick 652** [destination_reached]: Agent #1 arrived at (19, 1, 26) in 18 ticks
- **Tick 652** [destination_assigned]: Agent #1 assigned (19, 1, 26) → (7, 1, 11) (path: 28 steps)
- **Tick 680** [destination_reached]: Agent #1 arrived at (7, 1, 11) in 27 ticks
- **Tick 680** [destination_assigned]: Agent #1 assigned (7, 1, 11) → (20, 1, 30) (path: 33 steps)
- **Tick 713** [destination_reached]: Agent #1 arrived at (20, 1, 30) in 32 ticks
- **Tick 713** [destination_assigned]: Agent #1 assigned (20, 1, 30) → (7, 1, 23) (path: 21 steps)
- **Tick 734** [destination_reached]: Agent #1 arrived at (7, 1, 23) in 20 ticks
- **Tick 734** [destination_assigned]: Agent #1 assigned (7, 1, 23) → (5, 1, 12) (path: 14 steps)
- **Tick 748** [destination_reached]: Agent #1 arrived at (5, 1, 12) in 13 ticks
- **Tick 748** [destination_assigned]: Agent #1 assigned (5, 1, 12) → (14, 1, 2) (path: 20 steps)
- **Tick 768** [destination_reached]: Agent #1 arrived at (14, 1, 2) in 19 ticks
- **Tick 768** [destination_assigned]: Agent #1 assigned (14, 1, 2) → (12, 1, 8) (path: 9 steps)
- **Tick 777** [destination_reached]: Agent #1 arrived at (12, 1, 8) in 8 ticks
- **Tick 777** [destination_assigned]: Agent #1 assigned (12, 1, 8) → (30, 1, 31) (path: 42 steps)
- **Tick 819** [destination_reached]: Agent #1 arrived at (30, 1, 31) in 41 ticks
- **Tick 819** [destination_assigned]: Agent #1 assigned (30, 1, 31) → (2, 1, 23) (path: 37 steps)
- **Tick 856** [destination_reached]: Agent #1 arrived at (2, 1, 23) in 36 ticks
- **Tick 856** [destination_assigned]: Agent #1 assigned (2, 1, 23) → (17, 1, 8) (path: 31 steps)
- **Tick 887** [destination_reached]: Agent #1 arrived at (17, 1, 8) in 30 ticks
- **Tick 887** [destination_assigned]: Agent #1 assigned (17, 1, 8) → (18, 1, 27) (path: 21 steps)
