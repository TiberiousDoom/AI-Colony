using System;
using UnityEngine;

namespace VoxelRPG.NPC
{
    /// <summary>
    /// Types of need-based interruptions.
    /// </summary>
    public enum NeedInterruptType
    {
        /// <summary>No interrupt needed.</summary>
        None,

        /// <summary>NPC needs food but isn't critical.</summary>
        Hungry,

        /// <summary>NPC needs rest but isn't critical.</summary>
        Tired,

        /// <summary>NPC is starving (will die soon).</summary>
        Starving,

        /// <summary>NPC is exhausted (will collapse).</summary>
        Exhausted
    }

    /// <summary>
    /// Manages NPC needs (hunger, energy) and interruption checks.
    /// </summary>
    public class NPCNeeds : MonoBehaviour
    {
        #region Constants

        private const float STARVATION_DAMAGE_PER_SECOND = 1f;
        private const float EXHAUSTION_DAMAGE_PER_SECOND = 0.5f;

        #endregion

        #region Serialized Fields

        [Header("Current Values")]
        [SerializeField] private float _currentHunger = 100f;
        [SerializeField] private float _currentEnergy = 100f;

        [Header("Configuration")]
        [SerializeField] private float _maxHunger = 100f;
        [SerializeField] private float _maxEnergy = 100f;
        [SerializeField] private float _hungerDecayRate = 1f; // Per minute
        [SerializeField] private float _energyDecayRate = 0.5f; // Per minute

        [Header("Thresholds")]
        [SerializeField] private float _criticalHungerThreshold = 20f;
        [SerializeField] private float _criticalEnergyThreshold = 15f;

        [Header("Morale")]
        [SerializeField] private float _currentMorale = 75f;

        #endregion

        #region Properties

        /// <summary>Current hunger value (0 = starving, max = full).</summary>
        public float CurrentHunger => _currentHunger;

        /// <summary>Current energy value (0 = exhausted, max = rested).</summary>
        public float CurrentEnergy => _currentEnergy;

        /// <summary>Maximum hunger value.</summary>
        public float MaxHunger => _maxHunger;

        /// <summary>Maximum energy value.</summary>
        public float MaxEnergy => _maxEnergy;

        /// <summary>Hunger as percentage (0-1).</summary>
        public float HungerPercent => _maxHunger > 0 ? _currentHunger / _maxHunger : 0;

        /// <summary>Energy as percentage (0-1).</summary>
        public float EnergyPercent => _maxEnergy > 0 ? _currentEnergy / _maxEnergy : 0;

        /// <summary>True if hunger is below critical threshold.</summary>
        public bool NeedsFood => _currentHunger <= _criticalHungerThreshold;

        /// <summary>True if energy is below critical threshold.</summary>
        public bool NeedsRest => _currentEnergy <= _criticalEnergyThreshold;

        /// <summary>Current morale value (0-100).</summary>
        public float CurrentMorale => _currentMorale;

        #endregion

        #region Events

        /// <summary>Fired when hunger changes significantly.</summary>
        public event Action<float> OnHungerChanged;

        /// <summary>Fired when energy changes significantly.</summary>
        public event Action<float> OnEnergyChanged;

        /// <summary>Fired when morale changes.</summary>
        public event Action<float> OnMoraleChanged;

        /// <summary>Fired when NPC is starving (hunger = 0).</summary>
        public event Action OnStarving;

        /// <summary>Fired when NPC is exhausted (energy = 0).</summary>
        public event Action OnExhausted;

        /// <summary>Fired each frame while starving or exhausted, with damage amount to apply.</summary>
        public event Action<float> OnNeedsDamage;

        #endregion

        #region Unity Lifecycle

        private void Update()
        {
            UpdateNeeds(Time.deltaTime);
        }

        #endregion

        #region Public Methods

        /// <summary>
        /// Initializes needs from an NPC definition.
        /// </summary>
        public void Initialize(NPCDefinition definition)
        {
            _maxHunger = definition.MaxHunger;
            _maxEnergy = definition.MaxEnergy;
            _hungerDecayRate = definition.HungerDecayRate;
            _energyDecayRate = definition.EnergyDecayRate;
            _criticalHungerThreshold = definition.CriticalHungerThreshold;
            _criticalEnergyThreshold = definition.CriticalEnergyThreshold;

            _currentHunger = _maxHunger;
            _currentEnergy = _maxEnergy;
            _currentMorale = 75f;
        }

        /// <summary>
        /// Checks if NPC should interrupt current activity for needs.
        /// Called by state machine during Update.
        /// </summary>
        public NeedInterruptType CheckForInterrupt()
        {
            // Critical states first
            if (_currentHunger <= 0)
            {
                return NeedInterruptType.Starving;
            }

            if (_currentEnergy <= 0)
            {
                return NeedInterruptType.Exhausted;
            }

            // Non-critical but needs attention
            if (NeedsFood)
            {
                return NeedInterruptType.Hungry;
            }

            if (NeedsRest)
            {
                return NeedInterruptType.Tired;
            }

            return NeedInterruptType.None;
        }

        /// <summary>
        /// Adds hunger (eating food).
        /// </summary>
        public void AddHunger(float amount)
        {
            float oldHunger = _currentHunger;
            _currentHunger = Mathf.Clamp(_currentHunger + amount, 0, _maxHunger);

            if (Mathf.Abs(_currentHunger - oldHunger) > 0.1f)
            {
                OnHungerChanged?.Invoke(_currentHunger);
            }
        }

        /// <summary>
        /// Adds energy (resting).
        /// </summary>
        public void AddEnergy(float amount)
        {
            float oldEnergy = _currentEnergy;
            _currentEnergy = Mathf.Clamp(_currentEnergy + amount, 0, _maxEnergy);

            if (Mathf.Abs(_currentEnergy - oldEnergy) > 0.1f)
            {
                OnEnergyChanged?.Invoke(_currentEnergy);
            }
        }

        /// <summary>
        /// Sets morale directly.
        /// </summary>
        public void SetMorale(float value)
        {
            float oldMorale = _currentMorale;
            _currentMorale = Mathf.Clamp(value, 0, 100);

            if (Mathf.Abs(_currentMorale - oldMorale) > 0.1f)
            {
                OnMoraleChanged?.Invoke(_currentMorale);
            }
        }

        /// <summary>
        /// Adjusts morale by an amount.
        /// </summary>
        public void AdjustMorale(float delta)
        {
            SetMorale(_currentMorale + delta);
        }

        /// <summary>
        /// Gets the work speed modifier based on morale.
        /// </summary>
        public float GetMoraleWorkSpeedModifier()
        {
            if (_currentMorale >= 80)
            {
                return 1.2f; // Enthusiastic
            }
            else if (_currentMorale >= 60)
            {
                return 1.0f; // Content
            }
            else if (_currentMorale >= 40)
            {
                return 0.9f; // Neutral
            }
            else if (_currentMorale >= 20)
            {
                return 0.7f; // Unhappy
            }
            else
            {
                return 0.5f; // Miserable
            }
        }

        #endregion

        #region Private Methods

        private void UpdateNeeds(float deltaTime)
        {
            // Convert decay rate from per-minute to per-second
            float hungerDecay = (_hungerDecayRate / 60f) * deltaTime;
            float energyDecay = (_energyDecayRate / 60f) * deltaTime;

            float oldHunger = _currentHunger;
            float oldEnergy = _currentEnergy;

            _currentHunger = Mathf.Max(0, _currentHunger - hungerDecay);
            _currentEnergy = Mathf.Max(0, _currentEnergy - energyDecay);

            // Check for critical transitions
            if (oldHunger > 0 && _currentHunger <= 0)
            {
                OnStarving?.Invoke();
            }

            if (oldEnergy > 0 && _currentEnergy <= 0)
            {
                OnExhausted?.Invoke();
            }

            // Apply health damage when at zero
            float needsDamage = 0f;
            if (_currentHunger <= 0)
            {
                needsDamage += STARVATION_DAMAGE_PER_SECOND * deltaTime;
            }
            if (_currentEnergy <= 0)
            {
                needsDamage += EXHAUSTION_DAMAGE_PER_SECOND * deltaTime;
            }
            if (needsDamage > 0)
            {
                OnNeedsDamage?.Invoke(needsDamage);
            }

            // Update morale based on needs
            UpdateMoraleFromNeeds();
        }

        private void UpdateMoraleFromNeeds()
        {
            float moraleDelta = 0f;

            // Hunger affects morale
            if (NeedsFood)
            {
                moraleDelta -= 0.02f * Time.deltaTime; // -2 per hour when hungry
            }

            // Tiredness affects morale
            if (NeedsRest)
            {
                moraleDelta -= 0.01f * Time.deltaTime; // -1 per hour when tired
            }

            if (Mathf.Abs(moraleDelta) > 0.0001f)
            {
                AdjustMorale(moraleDelta);
            }
        }

        #endregion

        #region Save/Load

        /// <summary>
        /// Gets save data for serialization.
        /// </summary>
        public NPCNeedsSaveData GetSaveData()
        {
            return new NPCNeedsSaveData
            {
                CurrentHunger = _currentHunger,
                CurrentEnergy = _currentEnergy,
                CurrentMorale = _currentMorale
            };
        }

        /// <summary>
        /// Loads save data from deserialization.
        /// </summary>
        public void LoadSaveData(NPCNeedsSaveData data)
        {
            _currentHunger = data.CurrentHunger;
            _currentEnergy = data.CurrentEnergy;
            _currentMorale = data.CurrentMorale;
        }

        #endregion
    }

    /// <summary>
    /// Save data for NPC needs.
    /// </summary>
    [Serializable]
    public class NPCNeedsSaveData
    {
        public float CurrentHunger;
        public float CurrentEnergy;
        public float CurrentMorale;
    }
}
