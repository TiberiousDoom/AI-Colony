using System;
using UnityEngine;
using VoxelRPG.NPC.States;
using VoxelRPG.NPC.Tasks;

namespace VoxelRPG.NPC
{
    /// <summary>
    /// State machine for NPC behavior with interrupt/resume support.
    /// </summary>
    public class NPCStateMachine : MonoBehaviour
    {
        #region Private Fields

        private NPCController _npc;
        private INPCState _currentState;
        private INPCState _interruptedState; // State before interrupt
        private ITask _interruptedTask;      // Task that was interrupted

        #endregion

        #region Properties

        /// <summary>Current active state.</summary>
        public INPCState CurrentState => _currentState;

        /// <summary>Name of current state.</summary>
        public string CurrentStateName => _currentState?.Name ?? "None";

        /// <summary>True if currently in an interrupted state.</summary>
        public bool IsInterrupted => _interruptedState != null;

        /// <summary>The task that was interrupted (if any).</summary>
        public ITask InterruptedTask => _interruptedTask;

        #endregion

        #region Events

        /// <summary>Fired when state changes.</summary>
        public event Action<INPCState, INPCState> OnStateChanged;

        #endregion

        #region Public Methods

        /// <summary>
        /// Initializes the state machine with an NPC controller.
        /// Starts in IdleState by default.
        /// </summary>
        public void Initialize(NPCController npc)
        {
            _npc = npc;
            StartWithState(new IdleState());
        }

        /// <summary>
        /// Starts the state machine with an initial state.
        /// </summary>
        public void StartWithState(INPCState initialState)
        {
            if (initialState == null)
            {
                Debug.LogError("[NPCStateMachine] Cannot start with null state");
                return;
            }

            _currentState = initialState;
            _currentState.Enter(_npc);
        }

        /// <summary>
        /// Normal state change - clears any interrupted state.
        /// </summary>
        public void ChangeState(INPCState newState)
        {
            if (newState == null)
            {
                Debug.LogWarning("[NPCStateMachine] Attempted to change to null state");
                return;
            }

            var oldState = _currentState;
            string oldStateName = oldState?.Name ?? "None";
            string newStateName = newState?.Name ?? "None";

            _currentState?.Exit(_npc);

            // Clear interrupted state on normal transition
            _interruptedState = null;
            _interruptedTask = null;

            _currentState = newState;
            _currentState.Enter(_npc);

            Debug.Log($"[NPCStateMachine] {_npc?.gameObject.name}: {oldStateName} → {newStateName}");

            OnStateChanged?.Invoke(oldState, _currentState);
        }

        /// <summary>
        /// Interrupt current state (e.g., for hunger, fleeing).
        /// Can be resumed later with TryResumeInterrupted().
        /// </summary>
        /// <param name="interruptingState">The state to interrupt with.</param>
        /// <param name="currentTask">The task being worked on (optional).</param>
        public void Interrupt(INPCState interruptingState, ITask currentTask = null)
        {
            if (interruptingState == null)
            {
                Debug.LogWarning("[NPCStateMachine] Attempted to interrupt with null state");
                return;
            }

            // Don't interrupt dead state
            if (_currentState?.Name == "Dead")
            {
                return;
            }

            _interruptedState = _currentState;
            _interruptedTask = currentTask;

            _currentState?.Exit(_npc);
            _currentState = interruptingState;
            _currentState.Enter(_npc);

            OnStateChanged?.Invoke(_interruptedState, _currentState);
        }

        /// <summary>
        /// Try to resume the interrupted state/task.
        /// </summary>
        /// <returns>True if resumed, false if nothing to resume.</returns>
        public bool TryResumeInterrupted()
        {
            if (_interruptedState == null)
            {
                return false;
            }

            var stateToResume = _interruptedState;
            var taskToResume = _interruptedTask;

            _interruptedState = null;
            _interruptedTask = null;

            // Validate task is still valid before resuming
            if (taskToResume != null && !IsTaskStillValid(taskToResume))
            {
                Debug.Log($"[NPCStateMachine] Interrupted task {taskToResume.TaskId} is no longer valid, going to idle");
                _currentState?.Exit(_npc);
                _currentState = new IdleState();
                _currentState.Enter(_npc);
                OnStateChanged?.Invoke(null, _currentState);
                return false;
            }

            _currentState?.Exit(_npc);
            _currentState = stateToResume;

            // Re-enter with task context if it's a task state
            if (_currentState is ITaskState taskState && taskToResume != null)
            {
                taskState.ResumeWithTask(_npc, taskToResume);
            }
            else
            {
                _currentState.Enter(_npc);
            }

            OnStateChanged?.Invoke(null, _currentState);
            return true;
        }

        /// <summary>
        /// Checks if a task is still valid for resumption.
        /// </summary>
        private bool IsTaskStillValid(ITask task)
        {
            if (task == null)
            {
                return false;
            }

            // Task must not be cancelled or completed
            if (task.Status == TaskStatus.Cancelled || task.Status == TaskStatus.Completed)
            {
                return false;
            }

            // Task must still be claimed by this NPC
            if (task.ClaimedBy != _npc.Id)
            {
                return false;
            }

            return true;
        }

        /// <summary>
        /// Clears the interrupted state without resuming.
        /// </summary>
        public void ClearInterrupted()
        {
            _interruptedState = null;
            _interruptedTask = null;
        }

        /// <summary>
        /// Called when NPC is attacked. Evaluates whether to fight or flee.
        /// </summary>
        /// <param name="attacker">The attacking entity.</param>
        public void OnAttacked(GameObject attacker)
        {
            if (_currentState?.Name == "Dead" || _currentState?.Name == "Fleeing"
                || _currentState?.Name == "Fighting")
            {
                return;
            }

            // Get current task if in a task state
            ITask currentTask = null;
            if (_currentState is ITaskState)
            {
                currentTask = _interruptedTask ?? GetCurrentTaskFromState();
            }

            if (ShouldFight(attacker))
            {
                var fightState = new NPCCombatState(attacker?.transform);
                Interrupt(fightState, currentTask);
                Debug.Log($"[NPCStateMachine] {_npc?.gameObject.name} fighting {attacker?.name}");
            }
            else
            {
                var fleeState = new FleeState(attacker?.transform);
                Interrupt(fleeState, currentTask);
                Debug.Log($"[NPCStateMachine] {_npc?.gameObject.name} fleeing from {attacker?.name}");
            }
        }

        /// <summary>
        /// Evaluates whether the NPC should fight or flee based on role, health, and capability.
        /// </summary>
        private bool ShouldFight(GameObject attacker)
        {
            if (_npc == null) return false;

            var definition = _npc.Definition;
            if (definition == null) return false;

            float healthPercent = _npc.HealthPercent;

            // Too hurt to fight — always flee
            if (healthPercent <= definition.FleeHealthThreshold)
                return false;

            // Combat-role NPCs always fight (unless below health threshold)
            if (definition.IsCombatRole)
                return true;

            // Non-combat NPCs without combat capability always flee
            if (definition.CombatCapability <= 0f)
                return false;

            // Non-combat NPCs with some capability: fight if healthy and capable enough
            return healthPercent > 0.5f && definition.CombatCapability > 0.3f;
        }

        /// <summary>
        /// Attempts to get the current task from a task state.
        /// </summary>
        private ITask GetCurrentTaskFromState()
        {
            // Get task from current state if it implements ITaskState
            if (_currentState is ITaskState taskState)
            {
                return taskState.CurrentTask;
            }
            return null;
        }

        #endregion

        #region Unity Lifecycle

        private void Update()
        {
            // Don't tick states while falling — gravity is handled by NPCController
            if (_npc != null && _npc.IsFalling) return;

            _currentState?.Update(_npc);
        }

        #endregion

        #region Save/Load

        /// <summary>
        /// Gets save data for the state machine.
        /// </summary>
        public NPCStateMachineSaveData GetSaveData()
        {
            return new NPCStateMachineSaveData
            {
                CurrentStateName = _currentState?.Name,
                InterruptedStateName = _interruptedState?.Name,
                InterruptedTaskId = _interruptedTask?.TaskId
            };
        }

        #endregion
    }

    /// <summary>
    /// Save data for NPC state machine.
    /// </summary>
    [Serializable]
    public class NPCStateMachineSaveData
    {
        public string CurrentStateName;
        public string InterruptedStateName;
        public string InterruptedTaskId;
    }
}
