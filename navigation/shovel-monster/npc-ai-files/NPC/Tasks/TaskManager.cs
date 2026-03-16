using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using VoxelRPG.Core;
using VoxelRPG.Core.Reservation;

namespace VoxelRPG.NPC.Tasks
{
    /// <summary>
    /// Manages all NPC tasks, providing task assignment, tracking, and completion.
    /// </summary>
    public class TaskManager : MonoBehaviour, ITaskManager
    {
        #region Constants

        private const float DISTANCE_WEIGHT = 3.0f; // Scaled for sqrt distance curve
        private const float PRIORITY_WEIGHT = 100f;
        private const float AGE_WEIGHT = 0.1f; // Older tasks get slight priority boost
        private const float AGE_BOOST_THRESHOLD = 300f; // 5 minutes before exponential age boost kicks in
        private const float AGE_BOOST_BASE = 1.005f;
        private const float AGE_BOOST_CAP = 500f; // Prevent overflow for very old tasks
        private const float NEEDS_URGENCY_MULTIPLIER = 1.5f; // Distance penalty multiplier when needs are critical
        private const float LOCKOUT_CLEANUP_INTERVAL = 30f;

        #endregion

        #region Serialized Fields

        [Header("Dependencies")]
        [SerializeField] private ReservationManager _reservationManager;

        [Header("Configuration")]
        [SerializeField] private int _maxSearchRadius = 5; // In chunks

        #endregion

        #region Private Fields

        private readonly Dictionary<string, ITask> _tasks = new();
        private readonly ChunkTaskIndex _chunkIndex = new();
        private readonly FailureLockoutManager _lockouts = new();
        private readonly Dictionary<string, NPCDefinition> _npcDefinitions = new();
        private float _lastLockoutCleanup;

        #endregion

        #region Events

        public event Action<ITask> OnTaskAdded;
        public event Action<ITask> OnTaskCompleted;
        public event Action<ITask, string> OnTaskFailed;
        public event Action<ITask> OnTaskCancelled;

        #endregion

        #region Properties

        public int TaskCount => _tasks.Count;

        public int PendingTaskCount => _tasks.Values.Count(t => t.Status == TaskStatus.Pending);

        #endregion

        #region Unity Lifecycle

        private void Awake()
        {
            ValidateReferences();
            ServiceLocator.Register<ITaskManager>(this);
        }

        private void OnDestroy()
        {
            ServiceLocator.Unregister<ITaskManager>();
        }

        private void Update()
        {
            // Periodic cleanup of expired lockouts
            if (Time.time - _lastLockoutCleanup > LOCKOUT_CLEANUP_INTERVAL)
            {
                _lockouts.CleanupExpired();
                _lastLockoutCleanup = Time.time;
            }
        }

        #endregion

        #region Public Methods - NPC Registration

        /// <summary>
        /// Registers an NPC's definition for task preference scoring.
        /// </summary>
        public void RegisterNPC(string npcId, NPCDefinition definition)
        {
            if (string.IsNullOrEmpty(npcId) || definition == null) return;
            _npcDefinitions[npcId] = definition;
        }

        /// <summary>
        /// Unregisters an NPC's definition.
        /// </summary>
        public void UnregisterNPC(string npcId)
        {
            if (string.IsNullOrEmpty(npcId)) return;
            _npcDefinitions.Remove(npcId);
        }

        #endregion

        #region Public Methods - Task Management

        public void AddTask(ITask task)
        {
            if (task == null)
            {
                Debug.LogWarning("[TaskManager] Attempted to add null task");
                return;
            }

            if (_tasks.ContainsKey(task.TaskId))
            {
                Debug.LogWarning($"[TaskManager] Task already exists: {task.TaskId}");
                return;
            }

            _tasks[task.TaskId] = task;
            _chunkIndex.Add(task);

            OnTaskAdded?.Invoke(task);
        }

        public void RemoveTask(string taskId)
        {
            if (!_tasks.TryGetValue(taskId, out var task))
            {
                return;
            }

            task.Release(_reservationManager);
            _chunkIndex.Remove(task);
            _tasks.Remove(taskId);
        }

        public void CancelTask(string taskId)
        {
            if (!_tasks.TryGetValue(taskId, out var task))
            {
                return;
            }

            task.Status = TaskStatus.Cancelled;
            task.Release(_reservationManager);
            _chunkIndex.Remove(task);
            _tasks.Remove(taskId);

            OnTaskCancelled?.Invoke(task);
        }

        public ITask GetTask(string taskId)
        {
            return _tasks.TryGetValue(taskId, out var task) ? task : null;
        }

        #endregion

        #region Public Methods - Task Claims

        public bool RequestTaskClaim(string npcId, Vector3 npcPosition, string taskId)
        {
            if (string.IsNullOrEmpty(npcId))
            {
                return false;
            }

            if (!_tasks.TryGetValue(taskId, out var task))
            {
                return false;
            }

            if (!task.CanBePerformedBy(npcId, npcPosition))
            {
                return false;
            }

            if (_lockouts.IsLockedOut(npcId, taskId))
            {
                return false;
            }

            return task.TryClaim(npcId, _reservationManager);
        }

        #endregion

        #region Public Methods - Task Reporting

        public void ReportTaskProgress(string taskId, float progress)
        {
            // Can be used for UI updates or debugging
            // Currently no-op, but keeps the interface clean
        }

        public void ReportTaskComplete(string taskId)
        {
            if (!_tasks.TryGetValue(taskId, out var task))
            {
                return;
            }

            task.Status = TaskStatus.Completed;
            task.Release(_reservationManager);
            _chunkIndex.Remove(task);
            _tasks.Remove(taskId);

            OnTaskCompleted?.Invoke(task);
        }

        public void ReportTaskFailed(string taskId, string reason)
        {
            if (!_tasks.TryGetValue(taskId, out var task))
            {
                return;
            }

            // Record lockout so NPC doesn't immediately retry
            if (!string.IsNullOrEmpty(task.ClaimedBy))
            {
                _lockouts.RecordFailure(task.ClaimedBy, taskId);
            }

            task.Status = TaskStatus.Failed;
            task.Release(_reservationManager);

            OnTaskFailed?.Invoke(task, reason);

            // Failed tasks return to pending (another NPC might succeed)
            task.Status = TaskStatus.Pending;
        }

        #endregion

        #region Public Methods - Task Finding

        public ITask FindBestTaskFor(string npcId, Vector3 npcPosition, NPCNeeds needs = null)
        {
            if (string.IsNullOrEmpty(npcId))
            {
                return null;
            }

            float bestScore = float.MinValue;
            ITask bestTask = null;

            foreach (var task in _chunkIndex.FindTasksNear(npcPosition, _maxSearchRadius))
            {
                if (task.Status != TaskStatus.Pending)
                {
                    continue;
                }

                if (!task.CanBePerformedBy(npcId, npcPosition))
                {
                    continue;
                }

                if (_lockouts.IsLockedOut(npcId, task.TaskId))
                {
                    continue;
                }

                if (_reservationManager != null && _reservationManager.IsReserved(task.ReservableId))
                {
                    continue;
                }

                float score = CalculateScore(npcId, npcPosition, task, needs);
                if (score > bestScore)
                {
                    bestScore = score;
                    bestTask = task;
                }
            }

            return bestTask;
        }

        public IEnumerable<ITask> GetTasksByType(TaskType type)
        {
            return _tasks.Values.Where(t => t.Type == type);
        }

        public IEnumerable<ITask> GetTasksNear(Vector3 position, float radius)
        {
            int chunkRadius = Mathf.CeilToInt(radius / 16f);
            return _chunkIndex.FindTasksNear(position, chunkRadius);
        }

        #endregion

        #region Save/Load

        /// <summary>
        /// Gets save data for serialization.
        /// Note: Type-specific task data requires custom serialization in subclasses.
        /// </summary>
        public TaskManagerSaveData GetSaveData()
        {
            var tasks = _tasks.Values.Select(SerializeTask).ToList();

            return new TaskManagerSaveData
            {
                Tasks = tasks,
                Lockouts = _lockouts.GetSaveData()
            };
        }

        /// <summary>
        /// Loads save data from deserialization.
        /// Note: Requires task factory to reconstruct typed tasks.
        /// </summary>
        public void LoadLockoutData(FailureLockoutSaveData lockoutData)
        {
            _lockouts.LoadSaveData(lockoutData);
        }

        #endregion

        #region Private Methods

        private void ValidateReferences()
        {
            if (_reservationManager == null)
            {
                _reservationManager = FindObjectOfType<ReservationManager>();

                if (_reservationManager == null)
                {
                    Debug.LogError($"[{nameof(TaskManager)}] ReservationManager not found!");
                }
            }
        }

        private float CalculateScore(string npcId, Vector3 npcPosition, ITask task, NPCNeeds needs = null)
        {
            float distance = Vector3.Distance(npcPosition, task.Location);

            // Sqrt distance curve: close tasks matter more, far tasks penalized less per unit
            float urgencyMultiplier = 1f;
            if (needs != null && (needs.NeedsFood || needs.NeedsRest))
            {
                urgencyMultiplier = NEEDS_URGENCY_MULTIPLIER;
            }
            float distancePenalty = Mathf.Sqrt(distance) * DISTANCE_WEIGHT * urgencyMultiplier;

            // Higher priority = lower enum value = higher score
            float priorityScore = ((int)TaskPriority.Idle - (int)task.Priority) * PRIORITY_WEIGHT;

            // Older tasks get boost to prevent starvation, with exponential ramp after threshold
            float ageSeconds = Time.time - task.CreatedAt;
            float ageScore = ageSeconds * AGE_WEIGHT;
            if (ageSeconds > AGE_BOOST_THRESHOLD)
            {
                ageScore += Mathf.Min(Mathf.Pow(AGE_BOOST_BASE, ageSeconds - AGE_BOOST_THRESHOLD), AGE_BOOST_CAP);
            }

            // NPC personality preference bonus
            float preferenceBonus = 0f;
            if (!string.IsNullOrEmpty(npcId) && _npcDefinitions.TryGetValue(npcId, out var definition))
            {
                preferenceBonus = definition.GetTaskPreference(task.Type);
            }

            return priorityScore - distancePenalty + ageScore + preferenceBonus;
        }

        private TaskSaveData SerializeTask(ITask task)
        {
            return new TaskSaveData
            {
                TaskId = task.TaskId,
                Type = task.Type,
                Status = task.Status,
                Priority = task.Priority,
                Location = task.Location,
                ClaimedBy = task.ClaimedBy,
                CreatedAt = task.CreatedAt
                // TypeSpecificJson handled by subclasses
            };
        }

        #endregion
    }
}
