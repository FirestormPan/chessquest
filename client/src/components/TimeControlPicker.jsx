import {
  TIME_CONTROL_CATEGORIES,
  MATCHMAKING_CATEGORIES,
  isRatedAllowed,
  formatTimeControl,
} from '../timeControls';

export default function TimeControlPicker({ value, onChange, disabled = false }) {
  const { category, time, increment, rated } = value;

  const presets = TIME_CONTROL_CATEGORIES[category]?.presets ?? [];
  const ratedAllowed = isRatedAllowed(time);

  const availableCategories = MATCHMAKING_CATEGORIES.map(
    (key) => [key, TIME_CONTROL_CATEGORIES[key]],
  );

  function handleCategoryChange(event) {
    const nextCategory = event.target.value;
    const firstPreset = TIME_CONTROL_CATEGORIES[nextCategory].presets[0];

    onChange({
      category: nextCategory,
      time: firstPreset.time,
      increment: firstPreset.increment,
      rated: isRatedAllowed(firstPreset.time) ? rated : false,
    });
  }

  function handlePresetChange(event) {
    const index = Number(event.target.value);
    const preset = presets[index];

    if (!preset) return;

    onChange({
      ...value,
      time: preset.time,
      increment: preset.increment,
      rated: isRatedAllowed(preset.time) ? rated : false,
    });
  }

  const selectedPresetIndex = presets.findIndex(
    (preset) => preset.time === time && preset.increment === increment,
  );

  return (
    <div className="time-control-picker" aria-label="Time control">
      <div className="time-control-row">
        <label htmlFor="time-control-category">Time control</label>
        <select
          id="time-control-category"
          value={category}
          disabled={disabled}
          onChange={handleCategoryChange}
        >
          {availableCategories.map(([key, cat]) => (
            <option key={key} value={key}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      <div className="time-control-row">
        <label htmlFor="time-control-preset">Preset</label>
        <select
          id="time-control-preset"
          value={selectedPresetIndex === -1 ? 0 : selectedPresetIndex}
          disabled={disabled}
          onChange={handlePresetChange}
        >
          {presets.map((preset, index) => (
            <option key={`${preset.time}-${preset.increment}`} value={index}>
              {formatTimeControl(preset.time, preset.increment)}
            </option>
          ))}
        </select>
      </div>

      <label className="time-control-rated">
        <input
          type="checkbox"
          checked={rated}
          disabled={disabled || !ratedAllowed}
          onChange={(event) =>
            onChange({ ...value, rated: event.target.checked })
          }
        />
        <span>Rated</span>
      </label>

      {!ratedAllowed && (
        <p className="time-control-hint">
          Rated games are only available at Rapid (10+0) and slower.
        </p>
      )}
    </div>
  );
}