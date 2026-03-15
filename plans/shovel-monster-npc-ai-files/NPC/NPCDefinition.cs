using UnityEngine;
using VoxelRPG.NPC.Tasks;

namespace VoxelRPG.NPC
{
    /// <summary>
    /// ScriptableObject defining NPC characteristics and stats.
    /// </summary>
    [CreateAssetMenu(menuName = "VoxelRPG/NPC/NPC Definition", fileName = "NewNPCDefinition")]
    public class NPCDefinition : ScriptableObject
    {
        #region Serialized Fields

        [Header("Identity")]
        [SerializeField] private string _id;
        [SerializeField] private string _displayName;
        [SerializeField] private Sprite _portrait;

        [Header("Prefab")]
        [SerializeField] private GameObject _prefab;

        [Header("Stats")]
        [SerializeField] private float _maxHealth = 100f;
        [SerializeField] private float _moveSpeed = 3.5f;
        [SerializeField] private float _workSpeed = 1f;

        [Header("Needs")]
        [SerializeField] private float _maxHunger = 100f;
        [SerializeField] private float _hungerDecayRate = 1f; // Per minute
        [SerializeField] private float _maxEnergy = 100f;
        [SerializeField] private float _energyDecayRate = 0.5f; // Per minute

        [Header("Thresholds")]
        [SerializeField] private float _criticalHungerThreshold = 20f;
        [SerializeField] private float _criticalEnergyThreshold = 15f;

        [Header("Task Preferences")]
        [Tooltip("Bonus score for mining tasks (0 = no preference, 80 = strong preference)")]
        [SerializeField] private float _miningPreference;
        [Tooltip("Bonus score for hauling/delivery tasks")]
        [SerializeField] private float _haulingPreference;
        [Tooltip("Bonus score for building tasks")]
        [SerializeField] private float _buildingPreference;

        [Header("Combat")]
        [Tooltip("Whether this NPC has a combat role (guard, soldier). Combat NPCs always fight unless critically wounded.")]
        [SerializeField] private bool _isCombatRole;
        [Tooltip("Combat capability 0-1. Higher = braver in fight decisions for non-combat NPCs.")]
        [Range(0f, 1f)]
        [SerializeField] private float _combatCapability = 0f;
        [Tooltip("Health percentage below which this NPC will flee even if combat-capable.")]
        [Range(0f, 1f)]
        [SerializeField] private float _fleeHealthThreshold = 0.25f;
        [Tooltip("Base attack damage when fighting.")]
        [SerializeField] private float _baseAttackDamage = 5f;

        #endregion

        #region Properties

        /// <summary>Unique identifier for this NPC type.</summary>
        public string Id => _id;

        /// <summary>Display name shown in UI.</summary>
        public string DisplayName => _displayName;

        /// <summary>Portrait sprite for UI.</summary>
        public Sprite Portrait => _portrait;

        /// <summary>Prefab to instantiate for this NPC.</summary>
        public GameObject Prefab => _prefab;

        /// <summary>Maximum health points.</summary>
        public float MaxHealth => _maxHealth;

        /// <summary>Base movement speed in units per second.</summary>
        public float MoveSpeed => _moveSpeed;

        /// <summary>Work speed multiplier (1 = normal, 2 = twice as fast).</summary>
        public float WorkSpeed => _workSpeed;

        /// <summary>Maximum hunger value.</summary>
        public float MaxHunger => _maxHunger;

        /// <summary>Hunger decrease per minute.</summary>
        public float HungerDecayRate => _hungerDecayRate;

        /// <summary>Maximum energy value.</summary>
        public float MaxEnergy => _maxEnergy;

        /// <summary>Energy decrease per minute.</summary>
        public float EnergyDecayRate => _energyDecayRate;

        /// <summary>Hunger level that triggers interrupt.</summary>
        public float CriticalHungerThreshold => _criticalHungerThreshold;

        /// <summary>Energy level that triggers interrupt.</summary>
        public float CriticalEnergyThreshold => _criticalEnergyThreshold;

        /// <summary>True if this NPC type has any task preferences configured.</summary>
        public bool HasTaskPreferences => _miningPreference != 0 || _haulingPreference != 0 || _buildingPreference != 0;

        /// <summary>Whether this NPC has a combat role (guard, soldier).</summary>
        public bool IsCombatRole => _isCombatRole;

        /// <summary>Combat capability 0-1. Higher = braver in fight decisions.</summary>
        public float CombatCapability => _combatCapability;

        /// <summary>Health percentage below which this NPC will flee.</summary>
        public float FleeHealthThreshold => _fleeHealthThreshold;

        /// <summary>Base attack damage when fighting.</summary>
        public float BaseAttackDamage => _baseAttackDamage;

        #endregion

        #region Public Methods

        /// <summary>
        /// Gets the preference bonus score for a given task type.
        /// </summary>
        public float GetTaskPreference(TaskType type)
        {
            return type switch
            {
                TaskType.Mine => _miningPreference,
                TaskType.Haul => _haulingPreference,
                TaskType.Deliver => _haulingPreference,
                TaskType.Build => _buildingPreference,
                _ => 0f
            };
        }

        #endregion
    }
}
