# Shovel Monster 3D — NPC AI Improvements

## Context

The Shovel Monster NPC AI system has three core issues:

1. **Task scoring is naive** — linear distance
2. **No starvation/exhaustion consequences**
3. **NPCs always flee, never fight** — even when armed

All three changes are scoped to `/tmp/shovel_monster/Scripts/NPC/NPCController.cs` and related files.

---

## Improvement 1 — Task Scoring

Replace linear distance with sqrt curve, add needs-urgency multiplier (1.5x distance penalty when hungry/tired), add exponential age boost after 5 minutes to prevent task starvation.

### Files: TaskManager.cs, ITaskManager.cs, IdleState.cs

- `CalculateScore()` now uses `Mathf.Sqrt(distance)` instead of linear distance — nearby tasks matter more, far tasks penalized less per unit
- Added `NEEDS_URGENCY_MULTIPLIER` (1.5x) that increases distance penalty when NPC is hungry/tired, making them prefer closer tasks
- Added capped exponential age boost (`AGE_BOOST_BASE^(age - 300s)`, capped at 500) so tasks older than 5 minutes ramp up priority
- `FindBestTaskFor` now accepts optional `NPCNeeds` parameter; `IdleState` passes `npc.Needs`

---

## Improvement 2 — Survival Guards

Add health drain at 1 HP/s for starvation and 0.5 HP/s for exhaustion via `OnNeedsDamage` event, wired to NPCController separately from `TakeDamage()` (so NPCs don't flee from hunger).

### Files: NPCNeeds.cs, NPCController.cs

- `NPCNeeds` fires `OnNeedsDamage(float)` each frame while hunger=0 (1 HP/s) or energy=0 (0.5 HP/s)
- `NPCController.HandleNeedsDamage()` applies health loss directly (bypasses `TakeDamage` so it doesn't trigger flee/fight)
- Properly subscribes/unsubscribes in `Initialize()` and `OnDestroy()`

---

## Improvement 3 — Flee-vs-Fight (Hybrid)

Add `IsCombatRole`, `CombatCapability`, `FleeHealthThreshold` to `NPCDefinition`. Rewrite `OnAttacked()` with `ShouldFight()` decision: combat-role NPCs always fight (unless too hurt), armed workers fight weak threats only, unarmed workers always flee. New `NPCCombatState` handles melee combat with chase limits and health-check transitions to flee.

### Files: NPCDefinition.cs, NPCStateMachine.cs, NPCCombatState.cs (new)

- `NPCDefinition` gains 4 new fields: `IsCombatRole`, `CombatCapability` (0-1), `FleeHealthThreshold` (default 0.25), `BaseAttackDamage` (default 5)
- `NPCStateMachine.ShouldFight()` evaluates: combat-role NPCs always fight (unless below health threshold), non-combat NPCs fight only if `CombatCapability > 0.3` and health > 50%
- New `NPCCombatState`: chases target, attacks on cooldown using `IDamageable`, transitions to flee if health drops below threshold, disengages if chase > 25 units

---

## Gaps Found During Review

### Gap 1: HasEquippedWeapon() is wrong — NPCInventory has no equipment concept

NPCInventory is a simple hauling system — it carries one item type at a time (`_carriedItemId` + `_carriedAmount`) and has no concept of equipped weapons, item categories, or slots. There's no `HasItemOfCategory()` to add because it doesn't store `ItemDefinition` references at all, just a string ID.

**Fix:** Instead of trying to bolt equipment onto NPCInventory, the `ShouldFight()` check uses `CombatCapability > 0` from `NPCDefinition` as a proxy for "this NPC can fight." The definition already stores all NPC-type data. A guard NPC definition would have `_isCombatRole = true` and `_combatCapability = 0.8`, while a farmer would have `_combatCapability = 0`. Removed `HasEquippedWeapon()` entirely.

### Gap 2: VoxelRPG.NPC doesn't reference VoxelRPG.Combat

The assembly definition shows NPC only depends on Core, Voxel, Building, Utilities. The `MeleeWeapon`, `Hitbox`, and `MonsterHealth` classes live in `VoxelRPG.Combat`, which NPC can't access.

**Fix:** `NPCCombatState` deals damage through `IDamageable` (from `VoxelRPG.Core`) instead of using combat-specific classes. Call `attacker.GetComponent<IDamageable>()?.TakeDamage(damage, npc.gameObject)`. No assembly reference changes needed.

### Gap 3: NPCStateMachine already has _npc cached — don't use GetComponent

The plan originally showed `ShouldFight()` calling `GetComponent<NPCController>()`, but `_npc` is already a private field on `NPCStateMachine`. Uses `_npc` directly.

### Gap 4: ITaskManager.FindBestTaskFor interface signature change ripple

The interface is used by both `TaskManager` (concrete) and `IdleState` (caller). Changing the interface signature to add `NPCNeeds` breaks the contract.

**Fix:** Added `NPCNeeds` as an optional parameter with default null:
```csharp
ITask FindBestTaskFor(string npcId, Vector3 npcPosition, NPCNeeds needs = null);
```
And updated the single call site in `IdleState.TryFindTask()` to pass `npc.Needs`.

### Gap 5: NPCController.TakeDamage returns void but IDamageable.TakeDamage returns float

NPCController doesn't implement `IDamageable`. For `NPCCombatState` to deal damage to the attacker, it needs the attacker to implement `IDamageable` — which `MonsterHealth` does. That direction is fine. `NPCCombatState` doesn't need to receive damage itself (that goes through `NPCController.TakeDamage` called by the monster's attack).

### Gap 6: FleeState.FinishFleeing calls ClearInterrupted — NPCCombatState should handle task resumption

When fleeing finishes, `ClearInterrupted()` is called and the NPC goes to `IdleState`, losing its previous task. For combat, after winning a fight, the NPC should resume its interrupted task.

**Fix:** `NPCCombatState.FinishFighting` follows the same `ClearInterrupted()` pattern to avoid stale task resumption.

### Gap 7: Exponential age boost can overflow

`Mathf.Pow(1.005f, ageSeconds - 300f)` grows without bound. A task alive for 2 hours (7200s) produces `1.005^6900` — effectively infinity.

**Fix:** Cap the age boost: `Mathf.Min(Mathf.Pow(1.005f, ageSeconds - 300f), 500f)`.

### Gap 8: No unsubscribe for OnNeedsDamage

The plan subscribes `_needs.OnNeedsDamage += HandleNeedsDamage` but never unsubscribes. If the NPC is destroyed/disabled, this leaks.

**Fix:** Added `OnDestroy()` cleanup: `_needs.OnNeedsDamage -= HandleNeedsDamage`.

### Gap 9: NPCCombatState needs to handle re-attack during combat

If an NPC is already fighting one monster and a second monster attacks, `OnAttacked()` currently returns early because `_currentState?.Name == "Fighting"`. The NPC ignores the new threat.

**Fix:** Known limitation for v1 — the early return is acceptable but noted.

### Gap 10: OnExhausted never subscribed

`NPCController` subscribes to `OnStarving` but never `OnExhausted`. Added subscription.

### Gap 11: HandleStarving() is a TODO stub

It only logs a warning with a comment "Could trigger damage over time." The `OnNeedsDamage` event now provides the actual damage, so the stub stays for logging while the new event handles the real consequence.

---

## Files Summary

| # | File | Action | Changes |
|---|------|--------|---------|
| 1 | `NPCController.cs` | Modify | Subscribe OnNeedsDamage + OnExhausted, add HandleNeedsDamage(), OnDestroy cleanup |
| 2 | `NPCNeeds.cs` | Modify | Add OnNeedsDamage event, fire in Update() when hunger=0 or energy=0 |
| 3 | `NPCDefinition.cs` | Modify | Add IsCombatRole, CombatCapability, FleeHealthThreshold, BaseAttackDamage fields |
| 4 | `NPCStateMachine.cs` | Modify | Add ShouldFight(), wire OnAttacked to choose fight vs flee |
| 5 | `NPCCombatState.cs` | **New** | Chase/attack/disengage state using IDamageable |
| 6 | `TaskManager.cs` | Modify | Sqrt distance, needs urgency multiplier, capped age boost |
| 7 | `ITaskManager.cs` | Modify | Add optional NPCNeeds param to FindBestTaskFor |
| 8 | `IdleState.cs` | Modify | Pass npc.Needs to FindBestTaskFor |
