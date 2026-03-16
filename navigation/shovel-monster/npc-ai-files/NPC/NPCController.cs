using System;
using UnityEngine;
using UnityEngine.AI;
using VoxelRPG.Building;
using VoxelRPG.Core.Items;
using VoxelRPG.Core.Reservation;
using VoxelRPG.NPC.States;
using VoxelRPG.NPC.Tasks;
using VoxelRPG.Voxel;

namespace VoxelRPG.NPC
{
    /// <summary>
    /// Main NPC controller component.
    /// Coordinates state machine, needs, navigation, and task execution.
    /// </summary>
    [RequireComponent(typeof(NavMeshAgent))]
    [RequireComponent(typeof(NPCStateMachine))]
    [RequireComponent(typeof(NPCNeeds))]
    [RequireComponent(typeof(StuckDetector))]
    [RequireComponent(typeof(NPCInventory))]
    public class NPCController : MonoBehaviour, INPCStatusProvider
    {
        #region Serialized Fields

        [Header("Identity")]
        [SerializeField] private string _npcId;
        [SerializeField] private NPCDefinition _definition;

        [Header("Runtime State")]
        [SerializeField] private float _currentHealth;
        [SerializeField] private bool _isAlive = true;

        [Header("Navigation")]
        [Tooltip("Step height for climbing terrain (1.0 = one block)")]
        [SerializeField] private float _stepHeight = 1.1f;
        [Tooltip("Jump height when teleporting over obstacles")]
        [SerializeField] private float _jumpHeight = 1.5f;

        [Header("Dependencies")]
        [SerializeField] private TaskManager _taskManager;
        [SerializeField] private ReservationManager _reservationManager;
        [SerializeField] private StockpileManager _stockpileManager;
        [SerializeField] private ItemRegistry _itemRegistry;

        #endregion

        #region Private Fields

        private NavMeshAgent _navAgent;
        private NPCStateMachine _stateMachine;
        private NPCNeeds _needs;
        private StuckDetector _stuckDetector;
        private NPCInventory _inventory;
        private IVoxelWorld _voxelWorld;
        private Animator _animator;
        private bool _hasAnimator;

        // Animation parameter hashes for performance
        private static readonly int AnimSpeed = Animator.StringToHash("Speed");
        private static readonly int AnimMoveSpeed = Animator.StringToHash("MoveSpeed");
        private static readonly int AnimMotionSpeed = Animator.StringToHash("MotionSpeed");
        private static readonly int AnimIsWalking = Animator.StringToHash("IsWalking");
        private static readonly int AnimGrounded = Animator.StringToHash("Grounded");

        // Cached animator parameter flags
        private bool _hasSpeedParam;
        private bool _hasMoveSpeedParam;
        private bool _hasMotionSpeedParam;
        private bool _hasIsWalkingParam;
        private bool _hasGroundedParam;

        // Floating detection
        private float _floatingCheckTimer;
        private const float FLOATING_CHECK_INTERVAL = 0.2f;

        // Gravity-based falling (replaces instant teleport)
        private bool _isFalling;
        private float _fallVelocity;
        private const float GRAVITY = -20f;
        private const float MAX_FALL_SPEED = -30f;
        private const float MAX_FALL_DISTANCE = 50f; // Kill-plane safety net

        // NavMesh reconnection after landing
        // When true, the agent is disabled and we're waiting to safely re-enable it
        // without it snapping to a wrong NavMesh height
        private bool _pendingNavMeshReconnect;
        private Vector3 _reconnectPosition; // The position we landed at
        private float _reconnectTimer;
        private const float NAVMESH_RECONNECT_TIMEOUT = 0.5f;

        // Procedural idle animation (breathing effect)
        private float _idleAnimTimer;
        private Vector3 _baseScale;
        private bool _useProceduralIdle = true;
        private const float IDLE_BREATH_SPEED = 1.5f;
        private const float IDLE_BREATH_AMOUNT = 0.005f; // Very subtle 0.5% scale change

        #endregion

        #region Properties

        /// <summary>Unique NPC instance ID.</summary>
        public string Id => _npcId;

        /// <summary>NPC definition data.</summary>
        public NPCDefinition Definition => _definition;

        /// <summary>Current world position.</summary>
        public Vector3 Position => transform.position;

        /// <summary>Current health value.</summary>
        public float CurrentHealth => _currentHealth;

        /// <summary>Maximum health value.</summary>
        public float MaxHealth => _definition?.MaxHealth ?? 100f;

        /// <summary>Health as percentage (0-1).</summary>
        public float HealthPercent => MaxHealth > 0 ? _currentHealth / MaxHealth : 0;

        /// <summary>True if NPC is alive.</summary>
        public bool IsAlive => _isAlive;

        /// <summary>The state machine component.</summary>
        public NPCStateMachine StateMachine => _stateMachine;

        /// <summary>The needs component.</summary>
        public NPCNeeds Needs => _needs;

        /// <summary>The NavMesh agent.</summary>
        public NavMeshAgent NavAgent => _navAgent;

        /// <summary>The stuck detector.</summary>
        public StuckDetector StuckDetector => _stuckDetector;

        /// <summary>The NPC inventory.</summary>
        public NPCInventory Inventory => _inventory;

        /// <summary>True if the NPC is currently falling or waiting to reconnect to NavMesh after landing.</summary>
        public bool IsFalling => _isFalling || _pendingNavMeshReconnect;

        #endregion

        #region INPCStatusProvider Implementation

        public string NPCId => _npcId;
        public string DisplayName => _definition?.DisplayName ?? "NPC";
        public string CurrentActivity => _stateMachine?.CurrentStateName ?? "Unknown";
        public string StatusMessage => GetStatusMessage();
        public float Morale => _needs?.CurrentMorale ?? 50f;
        float INPCStatusProvider.HealthPercent => HealthPercent;
        public bool IsWorking => _stateMachine?.CurrentStateName != "Idle";
        public bool HasUrgentNeed => _needs?.CheckForInterrupt() != NeedInterruptType.None;
        public string UrgentNeedDescription => GetUrgentNeedDescription();

        public event Action<INPCStatusProvider> OnStatusChanged;

        #endregion

        #region Events

        /// <summary>Fired when NPC reaches its movement destination.</summary>
        public event Action OnReachedDestination;

        /// <summary>Fired when NPC takes damage.</summary>
        public event Action<float, GameObject> OnDamageTaken;

        /// <summary>Fired when NPC dies.</summary>
        public event Action OnDeath;

        #endregion

        #region Unity Lifecycle

        private void Awake()
        {
            CacheComponents();
            ValidateReferences();
        }

        private void Start()
        {
            Initialize(_definition, _npcId);
            _baseScale = transform.localScale;
        }

        private void Update()
        {
            if (!_isAlive)
            {
                return;
            }

            // While falling, only apply gravity — skip all other logic
            if (_isFalling)
            {
                ApplyFalling();
                return;
            }

            // After landing, try to reconnect NavMeshAgent without it snapping away
            if (_pendingNavMeshReconnect)
            {
                TryReconnectNavMesh();
                return;
            }

            CheckDestinationReached();
            UpdateAnimator();
            UpdateProceduralIdleAnimation();
            CheckIfFloating();
        }

        private void OnDestroy()
        {
            // Unregister from TaskManager preference scoring
            if (_taskManager != null && !string.IsNullOrEmpty(_npcId))
            {
                _taskManager.UnregisterNPC(_npcId);
            }

            // Release all reservations when despawned
            if (_reservationManager != null && !string.IsNullOrEmpty(_npcId))
            {
                _reservationManager.ReleaseAllFor(_npcId);
            }

            // Unsubscribe from needs events
            if (_needs != null)
            {
                _needs.OnNeedsDamage -= HandleNeedsDamage;
                _needs.OnExhausted -= HandleExhausted;
            }
        }

        #endregion

        #region Public Methods - Initialization

        /// <summary>
        /// Initializes the NPC with a definition and ID.
        /// </summary>
        public void Initialize(NPCDefinition definition, string npcId)
        {
            _definition = definition;
            _npcId = npcId;

            if (string.IsNullOrEmpty(_npcId))
            {
                _npcId = Guid.NewGuid().ToString();
            }

            if (_definition != null)
            {
                _currentHealth = _definition.MaxHealth;
                _navAgent.speed = _definition.MoveSpeed;
                _needs.Initialize(_definition);
            }

            // Configure NavMeshAgent for voxel terrain
            ConfigureNavAgent();

            _stateMachine.Initialize(this);

            // Register NPC definition with TaskManager for preference scoring
            if (_taskManager != null && _definition != null)
            {
                _taskManager.RegisterNPC(_npcId, _definition);
            }

            // Subscribe to events
            _stuckDetector.OnStuckDetected += HandleStuckDetected;
            _stuckDetector.OnPermanentlyStuck += HandlePermanentlyStuck;
            _needs.OnStarving += HandleStarving;
            _needs.OnExhausted += HandleExhausted;
            _needs.OnNeedsDamage += HandleNeedsDamage;
        }

        #endregion

        #region Public Methods - Movement

        /// <summary>
        /// Requests movement to a destination.
        /// </summary>
        public void RequestMoveTo(Vector3 destination)
        {
            if (!_isAlive || _navAgent == null)
            {
                return;
            }

            // Check if agent is on a valid NavMesh before setting destination
            if (!_navAgent.isOnNavMesh)
            {
                Debug.LogWarning($"[NPCController] {gameObject.name} cannot navigate - not on NavMesh. " +
                    "Use VoxelRPG > Build NavMesh (Around Player) to create NavMesh.");
                return;
            }

            _navAgent.SetDestination(destination);

            // Check if path is valid - if not and destination is below, try to handle drop
            StartCoroutine(CheckPathAndHandleDrop(destination));

            _stuckDetector.Reset();
        }

        /// <summary>
        /// Checks if path calculation succeeded, and if not, attempts to handle drops.
        /// </summary>
        private System.Collections.IEnumerator CheckPathAndHandleDrop(Vector3 destination)
        {
            // Wait for path calculation
            yield return new WaitForSeconds(0.2f);

            if (_navAgent == null || !_navAgent.isOnNavMesh) yield break;

            // Check if path is complete or partial
            if (_navAgent.pathStatus == NavMeshPathStatus.PathPartial ||
                _navAgent.pathStatus == NavMeshPathStatus.PathInvalid)
            {
                // Destination might be unreachable via normal navigation
                float heightDiff = transform.position.y - destination.y;

                // If destination is below us (more than 1 block), try to find a drop point
                if (heightDiff > 1f)
                {
                    TryNavigateViaDrops(destination);
                }
            }
        }

        /// <summary>
        /// Attempts to reach a destination below by finding a drop edge to walk toward.
        /// Gravity-based falling will handle the actual drop once the NPC reaches the edge.
        /// </summary>
        private void TryNavigateViaDrops(Vector3 destination)
        {
            if (_voxelWorld == null) return;

            Vector3 currentPos = transform.position;

            // Look for drop points in the direction of the destination
            Vector3 direction = (destination - currentPos).normalized;
            direction.y = 0;

            for (int dist = 1; dist <= 5; dist++)
            {
                Vector3 checkPos = currentPos + direction * dist;
                Vector3Int blockPos = new Vector3Int(
                    Mathf.FloorToInt(checkPos.x),
                    Mathf.FloorToInt(checkPos.y),
                    Mathf.FloorToInt(checkPos.z)
                );

                Vector3Int belowPos = blockPos + new Vector3Int(0, -1, 0);
                var blockBelow = _voxelWorld.GetBlock(belowPos);

                if (blockBelow == null || blockBelow.IsAir)
                {
                    // Found a drop edge — navigate there; gravity will handle the fall
                    Vector3 edgePos = new Vector3(blockPos.x + 0.5f, currentPos.y, blockPos.z + 0.5f);

                    if (NavMesh.SamplePosition(edgePos, out NavMeshHit edgeHit, 2f, NavMesh.AllAreas))
                    {
                        _navAgent.SetDestination(edgeHit.position);
                        Debug.Log($"[NPCController] {DisplayName} navigating to drop edge at {edgeHit.position}");
                        return;
                    }
                }
            }
        }

        /// <summary>
        /// Stops current movement.
        /// </summary>
        public void RequestStopMovement()
        {
            if (_navAgent != null && _navAgent.isOnNavMesh)
            {
                _navAgent.ResetPath();
            }

            _stuckDetector.StopMonitoring();
        }

        /// <summary>
        /// Checks if NPC has reached its destination.
        /// </summary>
        public bool HasReachedDestination()
        {
            if (_navAgent == null || !_navAgent.isOnNavMesh)
            {
                return true;
            }

            if (_navAgent.pathPending)
            {
                return false;
            }

            return _navAgent.remainingDistance <= _navAgent.stoppingDistance;
        }

        #endregion

        #region Public Methods - Combat

        /// <summary>
        /// Applies damage to this NPC.
        /// </summary>
        public void TakeDamage(float amount, GameObject source = null)
        {
            if (!_isAlive)
            {
                return;
            }

            _currentHealth = Mathf.Max(0, _currentHealth - amount);
            OnDamageTaken?.Invoke(amount, source);
            OnStatusChanged?.Invoke(this);

            // Notify state machine of attack
            if (source != null)
            {
                _stateMachine.OnAttacked(source);
            }

            if (_currentHealth <= 0)
            {
                Die();
            }
        }

        /// <summary>
        /// Heals the NPC.
        /// </summary>
        public void Heal(float amount)
        {
            if (!_isAlive)
            {
                return;
            }

            _currentHealth = Mathf.Min(MaxHealth, _currentHealth + amount);
            OnStatusChanged?.Invoke(this);
        }

        /// <summary>
        /// Kills the NPC.
        /// </summary>
        public void Die()
        {
            if (!_isAlive)
            {
                return;
            }

            _isAlive = false;
            _currentHealth = 0;

            // Release all reservations
            if (_reservationManager != null)
            {
                _reservationManager.ReleaseAllFor(_npcId);
            }

            RequestStopMovement();
            OnDeath?.Invoke();
            OnStatusChanged?.Invoke(this);

            Debug.Log($"[NPCController] {DisplayName} ({_npcId}) has died");
        }

        #endregion

        #region Public Methods - Task Access

        /// <summary>
        /// Gets the task manager for this NPC.
        /// </summary>
        public TaskManager GetTaskManager() => _taskManager;

        /// <summary>
        /// Gets the reservation manager.
        /// </summary>
        public ReservationManager GetReservationManager() => _reservationManager;

        /// <summary>
        /// Gets the voxel world interface.
        /// </summary>
        public IVoxelWorld GetVoxelWorld() => _voxelWorld;

        /// <summary>
        /// Gets the stockpile manager.
        /// </summary>
        public StockpileManager GetStockpileManager() => _stockpileManager;

        /// <summary>
        /// Gets the item registry.
        /// </summary>
        public ItemRegistry GetItemRegistry() => _itemRegistry;

        #endregion

        #region Private Methods

        private void CacheComponents()
        {
            _navAgent = GetComponent<NavMeshAgent>();
            _stateMachine = GetComponent<NPCStateMachine>();
            _needs = GetComponent<NPCNeeds>();
            _stuckDetector = GetComponent<StuckDetector>();
            _inventory = GetComponent<NPCInventory>();
            _animator = GetComponent<Animator>();

            // Validate and cache animator parameters
            if (_animator != null && _animator.runtimeAnimatorController != null)
            {
                _hasAnimator = true;
                CacheAnimatorParameters();
            }

            // Cache external manager references (avoid FindObjectOfType in Update/getters)
            CacheExternalManagers();
        }

        private void CacheExternalManagers()
        {
            if (_taskManager == null)
            {
                _taskManager = FindObjectOfType<TaskManager>();
            }
            if (_reservationManager == null)
            {
                _reservationManager = FindObjectOfType<ReservationManager>();
            }
            if (_stockpileManager == null)
            {
                _stockpileManager = FindObjectOfType<StockpileManager>();
            }
            if (_itemRegistry == null)
            {
                _itemRegistry = FindObjectOfType<ItemRegistry>();
            }
            if (_voxelWorld == null)
            {
                _voxelWorld = FindObjectOfType<VoxelWorld>();
            }
        }

        private void ValidateReferences()
        {
            if (_navAgent == null)
            {
                Debug.LogError($"[{nameof(NPCController)}] NavMeshAgent not found!", this);
            }

            if (_stateMachine == null)
            {
                Debug.LogError($"[{nameof(NPCController)}] NPCStateMachine not found!", this);
            }

            if (_needs == null)
            {
                Debug.LogError($"[{nameof(NPCController)}] NPCNeeds not found!", this);
            }
        }

        private void CheckDestinationReached()
        {
            if (_navAgent == null || !_navAgent.hasPath)
            {
                return;
            }

            if (HasReachedDestination())
            {
                OnReachedDestination?.Invoke();
            }
        }

        /// <summary>
        /// Periodically checks if the NPC is floating (ground below was removed).
        /// If floating, disables NavMeshAgent and starts gravity-based falling.
        /// </summary>
        private void CheckIfFloating()
        {
            _floatingCheckTimer -= Time.deltaTime;
            if (_floatingCheckTimer > 0)
            {
                return;
            }
            _floatingCheckTimer = FLOATING_CHECK_INTERVAL;

            if (_navAgent == null || _voxelWorld == null)
            {
                return;
            }

            Vector3 pos = transform.position;
            int baseX = Mathf.FloorToInt(pos.x);
            int baseY = Mathf.FloorToInt(pos.y);
            int baseZ = Mathf.FloorToInt(pos.z);

            // Check the block directly below feet
            var block = _voxelWorld.GetBlock(new Vector3Int(baseX, baseY - 1, baseZ));
            if (block != null && block.IsSolid)
            {
                return; // Standing on solid ground
            }

            // No ground below — start gravity-based falling
            StartFalling();
        }

        /// <summary>
        /// Called by MiningWorldIntegrator when a block is mined nearby.
        /// Forces an immediate floating check so the NPC starts falling right away.
        /// </summary>
        public void NotifyBlockMinedNearby()
        {
            if (!_isAlive || _isFalling) return;

            // Force immediate check on next frame
            _floatingCheckTimer = 0f;
        }

        /// <summary>
        /// Forces the NPC into gravity-based falling. Called by states (e.g. TravelingToTaskState)
        /// when the NPC needs to drop down to reach a destination below.
        /// </summary>
        public void ForceStartFalling()
        {
            if (!_isAlive || _isFalling) return;
            StartFalling();
        }

        /// <summary>
        /// Disables NavMeshAgent and begins gravity-based falling.
        /// The NPC will fall each frame until landing on solid ground.
        /// </summary>
        private void StartFalling()
        {
            if (_isFalling) return;

            _isFalling = true;
            _fallVelocity = 0f;

            // Stop any active coroutines (drop-edge navigation, etc.)
            StopAllCoroutines();

            // Disable NavMeshAgent so it can't fight our position changes
            if (_navAgent != null && _navAgent.enabled)
            {
                if (_navAgent.isOnNavMesh)
                {
                    _navAgent.ResetPath();
                }
                _navAgent.enabled = false;
            }

            // Update grounded animator param
            if (_hasAnimator && _hasGroundedParam)
            {
                _animator.SetBool(AnimGrounded, false);
            }
        }

        /// <summary>
        /// Applies gravity each frame while falling. Checks for solid ground below
        /// and lands the NPC when it reaches ground level.
        /// </summary>
        private void ApplyFalling()
        {
            // Apply gravity
            _fallVelocity += GRAVITY * Time.deltaTime;
            if (_fallVelocity < MAX_FALL_SPEED)
            {
                _fallVelocity = MAX_FALL_SPEED;
            }

            // Move down
            Vector3 pos = transform.position;
            float newY = pos.y + _fallVelocity * Time.deltaTime;

            // Safety net: kill NPC if fallen too far (into void)
            if (pos.y < -MAX_FALL_DISTANCE)
            {
                Debug.LogWarning($"[NPCController] {DisplayName} fell into void, killing");
                _isFalling = false;
                Die();
                return;
            }

            // Check for landing: is there a solid block under our new position?
            if (_voxelWorld != null)
            {
                int checkX = Mathf.FloorToInt(pos.x);
                int checkZ = Mathf.FloorToInt(pos.z);
                int feetBlockY = Mathf.FloorToInt(newY);

                // Check the block at our feet level and one below
                for (int y = feetBlockY; y >= feetBlockY - 1; y--)
                {
                    var block = _voxelWorld.GetBlock(new Vector3Int(checkX, y, checkZ));
                    if (block != null && block.IsSolid)
                    {
                        // Land on top of this solid block
                        float landY = y + 1.0f;

                        // Only land if we've actually reached or passed the landing height
                        if (newY <= landY + 0.1f)
                        {
                            Land(new Vector3(pos.x, landY, pos.z));
                            return;
                        }
                    }
                }
            }

            // No ground yet — keep falling
            transform.position = new Vector3(pos.x, newY, pos.z);
        }

        /// <summary>
        /// Lands the NPC after falling. Snaps to ground but does NOT re-enable
        /// the NavMeshAgent yet — that's handled by TryReconnectNavMesh() to prevent
        /// the agent from snapping back to a higher NavMesh surface.
        /// </summary>
        private void Land(Vector3 landPosition)
        {
            transform.position = landPosition;
            _isFalling = false;
            _fallVelocity = 0f;

            // Don't re-enable NavMeshAgent here — it would snap us to the wrong height.
            // Instead, set up a pending reconnect that Update() will handle.
            _pendingNavMeshReconnect = true;
            _reconnectPosition = landPosition;
            _reconnectTimer = NAVMESH_RECONNECT_TIMEOUT;

            // Update grounded animator param
            if (_hasAnimator && _hasGroundedParam)
            {
                _animator.SetBool(AnimGrounded, true);
            }

            Debug.Log($"[NPCController] {DisplayName} landed at {landPosition}");
        }

        /// <summary>
        /// Probes for NavMesh at the landing height WITHOUT enabling the agent.
        /// Only enables the agent once NavMesh is confirmed at the correct level,
        /// preventing the enable→snap→disable flicker cycle.
        /// </summary>
        private void TryReconnectNavMesh()
        {
            if (_navAgent == null)
            {
                _pendingNavMeshReconnect = false;
                return;
            }

            // Keep NPC pinned at landing position
            transform.position = _reconnectPosition;

            // Probe for NavMesh at our landing position WITHOUT enabling the agent
            if (NavMesh.SamplePosition(_reconnectPosition, out NavMeshHit hit, 1f, NavMesh.AllAreas))
            {
                // Only accept NavMesh that's at roughly our height (not a surface above)
                if (Mathf.Abs(hit.position.y - _reconnectPosition.y) < 0.3f)
                {
                    // NavMesh exists at our level — safe to enable
                    transform.position = hit.position;
                    _navAgent.enabled = true;
                    _pendingNavMeshReconnect = false;
                    Debug.Log($"[NPCController] {DisplayName} reconnected to NavMesh at {hit.position}");
                    return;
                }
            }

            // No suitable NavMesh yet — count down timeout
            _reconnectTimer -= Time.deltaTime;
            if (_reconnectTimer <= 0f)
            {
                // Give up waiting for NavMesh. Leave agent disabled so the state machine
                // can resume — the NPC can still mine adjacent blocks without navigation.
                _pendingNavMeshReconnect = false;
                Debug.Log($"[NPCController] {DisplayName} NavMesh reconnect timed out at {_reconnectPosition}, resuming without NavMesh");
            }
        }

        /// <summary>
        /// Checks if a solid block position has two air blocks above it (room for an NPC to stand).
        /// </summary>
        private bool HasHeadroom(Vector3Int solidBlockPos)
        {
            var above1 = _voxelWorld.GetBlock(solidBlockPos + Vector3Int.up);
            var above2 = _voxelWorld.GetBlock(solidBlockPos + new Vector3Int(0, 2, 0));
            return (above1 == null || above1.IsAir) && (above2 == null || above2.IsAir);
        }

        private void ConfigureNavAgent()
        {
            if (_navAgent == null) return;

            // Configure step height for voxel terrain (allows climbing 1-block heights)
            // This is crucial for navigating terrain with height changes
            _navAgent.autoTraverseOffMeshLink = true;

            // The NavMesh itself needs to be baked with appropriate settings,
            // but we can help by setting agent properties.
            // Note: stepHeight is baked into NavMesh, but we can use baseOffset
            // and custom jump logic to handle height differences

            Debug.Log($"[NPCController] {DisplayName} configured with step height support");
        }

        /// <summary>
        /// Caches which animator parameters exist for efficient updates.
        /// </summary>
        private void CacheAnimatorParameters()
        {
            if (_animator == null || _animator.runtimeAnimatorController == null)
                return;

            foreach (var param in _animator.parameters)
            {
                int hash = param.nameHash;
                if (hash == AnimSpeed) _hasSpeedParam = true;
                else if (hash == AnimMoveSpeed) _hasMoveSpeedParam = true;
                else if (hash == AnimMotionSpeed) _hasMotionSpeedParam = true;
                else if (hash == AnimIsWalking) _hasIsWalkingParam = true;
                else if (hash == AnimGrounded) _hasGroundedParam = true;
            }

            Debug.Log($"[NPCController] {DisplayName} animator params cached - Speed:{_hasSpeedParam}, MoveSpeed:{_hasMoveSpeedParam}, MotionSpeed:{_hasMotionSpeedParam}, IsWalking:{_hasIsWalkingParam}, Grounded:{_hasGroundedParam}");
        }

        /// <summary>
        /// Applies a subtle breathing/bobbing animation when idle.
        /// This provides visual feedback that the NPC is alive even without an Animator.
        /// </summary>
        private void UpdateProceduralIdleAnimation()
        {
            if (!_useProceduralIdle || _baseScale == Vector3.zero)
            {
                return;
            }

            // Only apply breathing when not moving
            bool isMoving = _navAgent != null && _navAgent.velocity.magnitude > 0.1f;

            if (!isMoving)
            {
                _idleAnimTimer += Time.deltaTime * IDLE_BREATH_SPEED;

                // Subtle breathing effect - scale oscillation
                float breathScale = 1f + Mathf.Sin(_idleAnimTimer) * IDLE_BREATH_AMOUNT;
                transform.localScale = new Vector3(
                    _baseScale.x * breathScale,
                    _baseScale.y * (1f + Mathf.Sin(_idleAnimTimer) * IDLE_BREATH_AMOUNT * 0.5f),
                    _baseScale.z * breathScale
                );
            }
            else
            {
                // Reset to base scale when moving
                transform.localScale = _baseScale;
                _idleAnimTimer = 0f;
            }
        }

        /// <summary>
        /// Updates animator parameters based on NavMeshAgent velocity.
        /// </summary>
        private void UpdateAnimator()
        {
            if (!_hasAnimator || _navAgent == null)
                return;

            // Calculate movement speed from NavMeshAgent velocity
            float velocity = _navAgent.velocity.magnitude;
            float maxSpeed = _navAgent.speed > 0 ? _navAgent.speed : 3.5f;
            float normalizedSpeed = Mathf.Clamp01(velocity / maxSpeed);

            // NPC animator uses Speed thresholds: <0.1=Idle, 0.1-0.5=Walk, >0.5=Run
            // Map our 0-1 range to appropriate values for these thresholds
            if (_hasSpeedParam)
            {
                // Scale normalized speed so walking starts properly and running at higher speeds
                // At 30% max speed = walk (0.3), at 60%+ = run (0.6+)
                float animSpeed = normalizedSpeed;
                _animator.SetFloat(AnimSpeed, animSpeed);
            }

            if (_hasMoveSpeedParam)
            {
                // Used by many asset store controllers (0-1 normalized)
                _animator.SetFloat(AnimMoveSpeed, normalizedSpeed);
            }

            if (_hasMotionSpeedParam)
            {
                // Used by StarterAssets to control animation playback rate
                float motionSpeed = velocity > 0.1f ? 1f : 0f;
                _animator.SetFloat(AnimMotionSpeed, motionSpeed);
            }

            if (_hasIsWalkingParam)
            {
                // Boolean walking state
                _animator.SetBool(AnimIsWalking, velocity > 0.1f);
            }

            if (_hasGroundedParam)
            {
                // Always grounded for NavMesh NPCs
                _animator.SetBool(AnimGrounded, true);
            }
        }

        private void HandleStuckDetected()
        {
            Debug.LogWarning($"[NPCController] {DisplayName} appears stuck, attempting recovery");

            // Try to jump over obstacle if stuck
            TryJumpToDestination();
        }

        /// <summary>
        /// Attempts to teleport-jump the NPC to a nearby valid position when stuck.
        /// </summary>
        private void TryJumpToDestination()
        {
            if (_navAgent == null || !_navAgent.hasPath) return;

            // Check if there's a height difference blocking us
            Vector3 currentPos = transform.position;
            Vector3 targetPos = _navAgent.destination;

            // Sample NavMesh near target to find valid position
            if (NavMesh.SamplePosition(targetPos, out NavMeshHit hit, 3f, NavMesh.AllAreas))
            {
                float heightDiff = Mathf.Abs(hit.position.y - currentPos.y);

                // If the height difference is within jump range, teleport there
                if (heightDiff <= _jumpHeight && heightDiff > 0.3f)
                {
                    // Find a position closer to us that's on the NavMesh
                    Vector3 direction = (hit.position - currentPos).normalized;
                    Vector3 jumpTarget = currentPos + direction * 1.5f;
                    jumpTarget.y = hit.position.y;

                    if (NavMesh.SamplePosition(jumpTarget, out NavMeshHit jumpHit, 2f, NavMesh.AllAreas))
                    {
                        // Warp to the new position
                        _navAgent.Warp(jumpHit.position);
                        Debug.Log($"[NPCController] {DisplayName} jumped to {jumpHit.position} (height diff: {heightDiff:F1}m)");
                        _stuckDetector.Reset();
                    }
                }
            }
        }

        private void HandlePermanentlyStuck()
        {
            Debug.LogError($"[NPCController] {DisplayName} is permanently stuck, failing current task");

            // Get current task from state machine if in a task state
            ITask currentTask = null;
            if (_stateMachine.CurrentState is ITaskState taskState)
            {
                currentTask = taskState.CurrentTask;
            }
            else
            {
                currentTask = _stateMachine.InterruptedTask;
            }

            // Fail the current task
            if (currentTask != null && _taskManager != null)
            {
                _taskManager.ReportTaskFailed(currentTask.TaskId, "NPC permanently stuck");
            }

            // Release all reservations for this NPC
            _reservationManager?.ReleaseAllFor(_npcId);

            // Drop any carried items
            if (_inventory != null && _inventory.IsCarryingItems)
            {
                _inventory.DropAllItems();
                Debug.Log($"[NPCController] {DisplayName} dropped items due to being stuck");
            }

            // Clear interrupted state and return to idle
            _stateMachine.ClearInterrupted();
            _stateMachine.ChangeState(new IdleState());
        }

        private void HandleStarving()
        {
            Debug.LogWarning($"[NPCController] {DisplayName} is starving!");
        }

        private void HandleExhausted()
        {
            Debug.LogWarning($"[NPCController] {DisplayName} is exhausted!");
        }

        private void HandleNeedsDamage(float damage)
        {
            if (!_isAlive) return;

            // Apply damage without triggering OnAttacked (no flee from starvation)
            _currentHealth = Mathf.Max(0, _currentHealth - damage);
            OnStatusChanged?.Invoke(this);
            if (_currentHealth <= 0)
            {
                Die();
            }
        }

        private string GetStatusMessage()
        {
            var state = _stateMachine?.CurrentStateName ?? "Unknown";
            return $"{state}";
        }

        private string GetUrgentNeedDescription()
        {
            var interrupt = _needs?.CheckForInterrupt() ?? NeedInterruptType.None;
            return interrupt switch
            {
                NeedInterruptType.Hungry => "Hungry",
                NeedInterruptType.Tired => "Tired",
                NeedInterruptType.Starving => "Starving!",
                NeedInterruptType.Exhausted => "Exhausted!",
                _ => string.Empty
            };
        }

        #endregion

        #region Save/Load

        /// <summary>
        /// Gets save data for serialization.
        /// </summary>
        public NPCControllerSaveData GetSaveData()
        {
            return new NPCControllerSaveData
            {
                NpcId = _npcId,
                DefinitionId = _definition?.Id,
                Position = transform.position,
                Rotation = transform.rotation.eulerAngles,
                CurrentHealth = _currentHealth,
                IsAlive = _isAlive,
                Needs = _needs?.GetSaveData(),
                StateMachine = _stateMachine?.GetSaveData()
            };
        }

        /// <summary>
        /// Loads save data from deserialization.
        /// </summary>
        public void LoadSaveData(NPCControllerSaveData data)
        {
            _npcId = data.NpcId;
            transform.position = data.Position;
            transform.rotation = Quaternion.Euler(data.Rotation);
            _currentHealth = data.CurrentHealth;
            _isAlive = data.IsAlive;

            if (data.Needs != null)
            {
                _needs?.LoadSaveData(data.Needs);
            }
        }

        #endregion
    }

    /// <summary>
    /// Save data for NPC controller.
    /// </summary>
    [Serializable]
    public class NPCControllerSaveData
    {
        public string NpcId;
        public string DefinitionId;
        public Vector3 Position;
        public Vector3 Rotation;
        public float CurrentHealth;
        public bool IsAlive;
        public NPCNeedsSaveData Needs;
        public NPCStateMachineSaveData StateMachine;
    }
}
