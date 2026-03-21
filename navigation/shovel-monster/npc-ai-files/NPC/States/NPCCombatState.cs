using UnityEngine;
using VoxelRPG.Core;

namespace VoxelRPG.NPC.States
{
    /// <summary>
    /// State for NPCs that choose to fight back against attackers.
    /// Uses IDamageable from VoxelRPG.Core to deal damage (avoids VoxelRPG.Combat dependency).
    /// </summary>
    public class NPCCombatState : INPCState
    {
        #region Constants

        private const float ATTACK_RANGE = 2.5f;
        private const float ATTACK_COOLDOWN = 1.5f;
        private const float MAX_CHASE_DISTANCE = 25f;
        private const float HEALTH_CHECK_INTERVAL = 0.5f;
        private const float RETARGET_INTERVAL = 1f;

        #endregion

        #region Private Fields

        private Transform _target;
        private Vector3 _startPosition;
        private float _attackTimer;
        private float _healthCheckTimer;
        private float _retargetTimer;
        private IDamageable _targetDamageable;

        #endregion

        #region Properties

        public string Name => "Fighting";

        #endregion

        #region Constructor

        public NPCCombatState(Transform target)
        {
            _target = target;
        }

        #endregion

        #region INPCState Implementation

        public void Enter(NPCController npc)
        {
            _startPosition = npc.Position;
            _attackTimer = 0f;
            _healthCheckTimer = 0f;
            _retargetTimer = 0f;

            // Cache IDamageable from target
            if (_target != null)
            {
                _targetDamageable = _target.GetComponent<IDamageable>();
            }

            // Less morale loss than fleeing (-10)
            npc.Needs.AdjustMorale(-5f);

            // Move toward target
            if (_target != null)
            {
                npc.RequestMoveTo(_target.position);
            }
        }

        public void Update(NPCController npc)
        {
            _attackTimer += Time.deltaTime;
            _healthCheckTimer += Time.deltaTime;
            _retargetTimer += Time.deltaTime;

            // Target gone or dead
            if (_target == null || (_targetDamageable != null && !_targetDamageable.IsAlive))
            {
                FinishCombat(npc);
                return;
            }

            // Periodic health and distance checks
            if (_healthCheckTimer >= HEALTH_CHECK_INTERVAL)
            {
                _healthCheckTimer = 0f;

                var def = npc.Definition;
                if (def != null && npc.HealthPercent <= def.FleeHealthThreshold)
                {
                    TransitionToFlee(npc);
                    return;
                }

                // Chase limit — don't follow forever
                float distFromStart = Vector3.Distance(npc.Position, _startPosition);
                if (distFromStart > MAX_CHASE_DISTANCE)
                {
                    FinishCombat(npc);
                    return;
                }
            }

            float distToTarget = Vector3.Distance(npc.Position, _target.position);

            if (distToTarget <= ATTACK_RANGE)
            {
                // In range — attack on cooldown
                if (_attackTimer >= ATTACK_COOLDOWN)
                {
                    _attackTimer = 0f;
                    PerformAttack(npc);
                }
            }
            else
            {
                // Chase target — periodically update destination
                if (_retargetTimer >= RETARGET_INTERVAL)
                {
                    _retargetTimer = 0f;
                    npc.RequestMoveTo(_target.position);
                }
            }
        }

        public void Exit(NPCController npc)
        {
            // Nothing to clean up
        }

        #endregion

        #region Private Methods

        private void PerformAttack(NPCController npc)
        {
            if (_targetDamageable == null || !_targetDamageable.IsAlive) return;

            float damage = npc.Definition?.BaseAttackDamage ?? 5f;
            _targetDamageable.TakeDamage(damage, npc.gameObject);
        }

        private void TransitionToFlee(NPCController npc)
        {
            npc.StateMachine.ClearInterrupted();
            npc.StateMachine.ChangeState(new FleeState(_target));
        }

        private void FinishCombat(NPCController npc)
        {
            npc.StateMachine.ClearInterrupted();
            npc.StateMachine.ChangeState(new IdleState());
        }

        #endregion
    }
}
