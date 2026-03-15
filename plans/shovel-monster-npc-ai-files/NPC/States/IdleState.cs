using UnityEngine;
using VoxelRPG.NPC.Tasks;

namespace VoxelRPG.NPC.States
{
    /// <summary>
    /// Idle state - NPC waits and periodically searches for tasks.
    /// </summary>
    public class IdleState : INPCState
    {
        #region Constants

        private const float TASK_SEARCH_INTERVAL = 1f;

        #endregion

        #region Private Fields

        private float _searchTimer;

        #endregion

        #region INPCState Implementation

        public string Name => "Idle";

        public void Enter(NPCController npc)
        {
            npc.RequestStopMovement();
            _searchTimer = 0f;
            Debug.Log($"[IdleState] {npc.gameObject.name} entered Idle state, will search for tasks");
        }

        public void Update(NPCController npc)
        {
            // Check needs first
            var interrupt = npc.Needs.CheckForInterrupt();
            if (interrupt != NeedInterruptType.None)
            {
                HandleNeedInterrupt(npc, interrupt);
                return;
            }

            // Periodically search for tasks
            _searchTimer += Time.deltaTime;
            if (_searchTimer >= TASK_SEARCH_INTERVAL)
            {
                _searchTimer = 0f;
                TryFindTask(npc);
            }
        }

        public void Exit(NPCController npc)
        {
            // Nothing to clean up
        }

        #endregion

        #region Private Methods

        private void TryFindTask(NPCController npc)
        {
            var taskManager = npc.GetTaskManager();
            if (taskManager == null)
            {
                Debug.LogWarning($"[IdleState] {npc.gameObject.name} has no TaskManager!");
                return;
            }

            var task = taskManager.FindBestTaskFor(npc.Id, npc.Position, npc.Needs);

            if (task == null)
            {
                // No task available - this is normal, don't spam log
                return;
            }

            if (taskManager.RequestTaskClaim(npc.Id, npc.Position, task.TaskId))
            {
                Debug.Log($"[IdleState] {npc.gameObject.name} claimed task: {task.Type} at {task.Location}");
                npc.StateMachine.ChangeState(new TravelingToTaskState(task));
            }
            else
            {
                Debug.Log($"[IdleState] {npc.gameObject.name} failed to claim task: {task.Type}");
            }
        }

        private void HandleNeedInterrupt(NPCController npc, NeedInterruptType interrupt)
        {
            switch (interrupt)
            {
                case NeedInterruptType.Hungry:
                case NeedInterruptType.Starving:
                    npc.StateMachine.ChangeState(new SeekFoodState());
                    break;

                case NeedInterruptType.Tired:
                case NeedInterruptType.Exhausted:
                    npc.StateMachine.ChangeState(new RestState());
                    break;
            }
        }

        #endregion
    }
}
