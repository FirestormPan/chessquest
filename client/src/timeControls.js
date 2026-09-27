// NOTE: This list must stay in sync with the backend's
// ALLOWED_TIME_CONTROLS. See refactor note at the bottom
// of this change for the plan to share via /api/game/time-controls.

export const TIME_CONTROL_CATEGORIES = {
  ultraBullet: {
    label: 'UltraBullet',
    presets: [
      { time: 15, increment: 0 },
      { time: 30, increment: 0 },
    ],
  },
  bullet: {
    label: 'Bullet',
    presets: [
      { time: 60, increment: 0 },
      { time: 120, increment: 1 },
    ],
  },
  blitz: {
    label: 'Blitz',
    presets: [
      { time: 180, increment: 0 },
      { time: 180, increment: 2 },
      { time: 300, increment: 0 },
      { time: 300, increment: 3 },
    ],
  },
  rapid: {
    label: 'Rapid',
    presets: [
      { time: 600, increment: 0 },
      { time: 600, increment: 5 },
      { time: 900, increment: 10 },
      { time: 1800, increment: 0 },
    ],
  },
  classical: {
    label: 'Classical',
    presets: [
      { time: 1800, increment: 20 },
      { time: 3600, increment: 30 },
    ],
  },
};

// Categories permitted for open seek / matchmaking via the Board API.
// The Board API rejects ultraBullet, bullet, and blitz for rated and
// unrated open seeks — see the Lichess Board API docs and the
// "Total time = initial + 40 * increment" rule.
export const MATCHMAKING_CATEGORIES = ['rapid', 'classical'];

// Lichess Board API refuses rated games below Rapid on the board API.
export const RATED_MIN_TIME_SECONDS = 600;

export function isRatedAllowed(time) {
  return time >= RATED_MIN_TIME_SECONDS;
}

export function findCategoryForPreset(time, increment) {
  for (const [key, category] of Object.entries(TIME_CONTROL_CATEGORIES)) {
    const match = category.presets.find(
      (preset) => preset.time === time && preset.increment === increment,
    );

    if (match) return key;
  }

  return null;
}

export function formatTimeControl(time, increment) {
  const minutes = time / 60;
  const base = Number.isInteger(minutes) ? `${minutes}` : minutes.toFixed(1);
  return `${base}+${increment}`;
}