export const FM_MIN = 87.5;
export const FM_MAX = 108.0;

export function normalizeFrequency(value) {
  return Math.min(
    FM_MAX,
    Math.max(FM_MIN, Math.round(Number(value) * 10) / 10),
  );
}

export function assignFrequencies(stations) {
  if (!stations.length) return [];
  const start = 88.1,
    end = 107.7,
    span = Math.max(0, end - start);
  return stations.map((station, index) => ({
    ...station,
    frequency:
      station.frequency ??
      normalizeFrequency(
        start +
          (stations.length === 1 ? 0 : (span * index) / (stations.length - 1)),
      ),
  }));
}

export function signalAt(frequency, stations) {
  const tuned = normalizeFrequency(frequency);
  let nearest = null,
    distance = Infinity;
  for (const station of stations) {
    const delta = Math.abs(Number(station.frequency) - tuned);
    if (delta < distance) {
      distance = delta;
      nearest = station;
    }
  }
  const strength = nearest ? Math.max(0, 1 - distance / 0.45) : 0;
  return {
    frequency: tuned,
    station: strength >= 0.58 ? nearest : null,
    strength,
  };
}
