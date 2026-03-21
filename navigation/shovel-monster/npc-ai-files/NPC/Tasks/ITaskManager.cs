using System;
using System.Collections.Generic;
using UnityEngine;

namespace VoxelRPG.NPC.Tasks
{
    /// <summary>
    /// Interface for task management.
    /// Multiplayer-ready: All modifications go through Request methods.
    /// </summary>
    public interface ITaskManager
    {
        /// <summary>
        /// Adds a new task to the manager.
        /// </summary>
        /// <param name="task">The task to add.</param>
        void AddTask(ITask task);

        /// <summary>
        /// Removes a task from the manager.
        /// </summary>
        /// <param name="taskId">ID of the task to remove.</param>
        void RemoveTask(string taskId);

        /// <summary>
        /// Cancels a task, releasing any reservations.
        /// </summary>
        /// <param name="taskId">ID of the task to cancel.</param>
        void CancelTask(string taskId);

        /// <summary>
        /// Gets a task by ID.
        /// </summary>
        /// <param name="taskId">ID of the task to get.</param>
        /// <returns>The task, or null if not found.</returns>
        ITask GetTask(string taskId);

        /// <summary>
        /// Requests to claim a task for an NPC.
        /// </summary>
        /// <param name="npcId">ID of the NPC claiming the task.</param>
        /// <param name="npcPosition">Position of the NPC.</param>
        /// <param name="taskId">ID of the task to claim.</param>
        /// <returns>True if claim succeeded, false otherwise.</returns>
        bool RequestTaskClaim(string npcId, Vector3 npcPosition, string taskId);

        /// <summary>
        /// Reports progress on a task (for UI/debugging).
        /// </summary>
        /// <param name="taskId">ID of the task.</param>
        /// <param name="progress">Progress value (0-1).</param>
        void ReportTaskProgress(string taskId, float progress);

        /// <summary>
        /// Reports that a task has been completed.
        /// </summary>
        /// <param name="taskId">ID of the completed task.</param>
        void ReportTaskComplete(string taskId);

        /// <summary>
        /// Reports that a task has failed.
        /// </summary>
        /// <param name="taskId">ID of the failed task.</param>
        /// <param name="reason">Reason for failure.</param>
        void ReportTaskFailed(string taskId, string reason);

        /// <summary>
        /// Finds the best available task for an NPC.
        /// </summary>
        /// <param name="npcId">ID of the NPC.</param>
        /// <param name="npcPosition">Position of the NPC.</param>
        /// <param name="needs">Optional NPC needs for urgency-based scoring.</param>
        /// <returns>The best task, or null if none available.</returns>
        ITask FindBestTaskFor(string npcId, Vector3 npcPosition, NPCNeeds needs = null);

        /// <summary>
        /// Gets all tasks of a specific type.
        /// </summary>
        /// <param name="type">Type of tasks to get.</param>
        /// <returns>Enumerable of matching tasks.</returns>
        IEnumerable<ITask> GetTasksByType(TaskType type);

        /// <summary>
        /// Gets tasks near a position (for efficient searching).
        /// </summary>
        /// <param name="position">Center position.</param>
        /// <param name="radius">Search radius in world units.</param>
        /// <returns>Enumerable of nearby tasks.</returns>
        IEnumerable<ITask> GetTasksNear(Vector3 position, float radius);

        /// <summary>
        /// Gets the total number of tasks.
        /// </summary>
        int TaskCount { get; }

        /// <summary>
        /// Gets the number of pending (unclaimed) tasks.
        /// </summary>
        int PendingTaskCount { get; }

        /// <summary>
        /// Fired when a task is added.
        /// </summary>
        event Action<ITask> OnTaskAdded;

        /// <summary>
        /// Fired when a task is completed.
        /// </summary>
        event Action<ITask> OnTaskCompleted;

        /// <summary>
        /// Fired when a task fails.
        /// </summary>
        event Action<ITask, string> OnTaskFailed;

        /// <summary>
        /// Fired when a task is cancelled.
        /// </summary>
        event Action<ITask> OnTaskCancelled;
    }
}
