import { FitWriter } from '@markw65/fit-file-writer';
import type { RideExport } from './types';

/** FitWriter.latlng expects radians, not degrees. */
function toSemicircles(writer: FitWriter, degrees: number): number {
  return writer.latlng((degrees * Math.PI) / 180);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Minimal indoor cycling activity FIT for Garmin Connect import.
 */
export function buildFit(ride: RideExport): Uint8Array {
  const writer = new FitWriter();
  const points = ride.points;
  const startDate = new Date(ride.startedAtMs);
  const endDate = new Date(ride.finishedAtMs);
  const start = writer.time(startDate);
  const end = writer.time(endDate);
  const timerSeconds = Math.max(1, Math.round(ride.elapsedSeconds));
  const totalDistance = Math.max(
    ride.distanceMeters,
    points.at(-1)?.distanceMeters ?? 0,
  );

  writer.writeMessage(
    'file_id',
    {
      type: 'activity',
      manufacturer: 'development',
      product: 0,
      serial_number: 1,
      time_created: start,
      product_name: 'ROADLAB',
    },
    null,
    true,
  );

  writer.writeMessage(
    'device_info',
    {
      timestamp: start,
      device_index: 0,
      manufacturer: 'development',
      product: 0,
      product_name: 'ROADLAB',
      software_version: 1,
    },
    null,
    true,
  );

  writer.writeMessage(
    'event',
    {
      timestamp: start,
      event: 'timer',
      event_type: 'start',
    },
    null,
    true,
  );

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const isLast = i === points.length - 1;
    const hr =
      p.heartRateBpm != null && p.heartRateBpm > 0
        ? Math.max(0, Math.min(254, Math.round(p.heartRateBpm)))
        : undefined;

    if (hr != null) {
      writer.writeMessage(
        'record',
        {
          timestamp: writer.time(new Date(p.timestampMs)),
          position_lat: toSemicircles(writer, p.lat),
          position_long: toSemicircles(writer, p.lng),
          distance: p.distanceMeters,
          enhanced_speed: Math.max(0, p.speedKmh / 3.6),
          enhanced_altitude: p.elevationMeters,
          cadence: Math.max(0, Math.min(254, Math.round(p.cadenceRpm))),
          power: Math.max(0, Math.round(p.powerWatts)),
          heart_rate: hr,
        },
        null,
        isLast,
      );
    } else {
      writer.writeMessage(
        'record',
        {
          timestamp: writer.time(new Date(p.timestampMs)),
          position_lat: toSemicircles(writer, p.lat),
          position_long: toSemicircles(writer, p.lng),
          distance: p.distanceMeters,
          enhanced_speed: Math.max(0, p.speedKmh / 3.6),
          enhanced_altitude: p.elevationMeters,
          cadence: Math.max(0, Math.min(254, Math.round(p.cadenceRpm))),
          power: Math.max(0, Math.round(p.powerWatts)),
        },
        null,
        isLast,
      );
    }
  }

  writer.writeMessage(
    'event',
    {
      timestamp: end,
      event: 'timer',
      event_type: 'stop_all',
    },
    null,
    true,
  );

  const speeds = points.map((p) => p.speedKmh / 3.6).filter((s) => s > 0);
  const powers = points.map((p) => p.powerWatts).filter((w) => w > 0);
  const cadences = points.map((p) => p.cadenceRpm).filter((c) => c > 0);
  const hrs = points
    .map((p) => p.heartRateBpm)
    .filter((h): h is number => h != null && h > 0);

  let ascent = 0;
  let descent = 0;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i]!.elevationMeters - points[i - 1]!.elevationMeters;
    if (delta > 0) ascent += delta;
    else descent += -delta;
  }

  const summary = {
    avg_speed: avg(speeds),
    max_speed: speeds.length ? Math.max(...speeds) : 0,
    avg_power: Math.round(avg(powers)),
    max_power: powers.length ? Math.round(Math.max(...powers)) : 0,
    avg_cadence: Math.round(avg(cadences)),
    max_cadence: cadences.length ? Math.round(Math.max(...cadences)) : 0,
    avg_heart_rate: Math.round(avg(hrs)),
    max_heart_rate: hrs.length ? Math.round(Math.max(...hrs)) : 0,
    total_ascent: Math.round(ascent),
    total_descent: Math.round(descent),
  };

  writer.writeMessage(
    'lap',
    {
      message_index: { value: 0 },
      timestamp: end,
      start_time: start,
      total_elapsed_time: timerSeconds,
      total_timer_time: timerSeconds,
      total_distance: totalDistance,
      sport: 'cycling',
      sub_sport: 'indoor_cycling',
      ...summary,
      event: 'lap',
      event_type: 'stop',
    },
    null,
    true,
  );

  writer.writeMessage(
    'session',
    {
      message_index: { value: 0 },
      timestamp: end,
      start_time: start,
      total_elapsed_time: timerSeconds,
      total_timer_time: timerSeconds,
      total_distance: totalDistance,
      sport: 'cycling',
      sub_sport: 'indoor_cycling',
      first_lap_index: 0,
      num_laps: 1,
      ...summary,
      event: 'session',
      event_type: 'stop',
    },
    null,
    true,
  );

  const localTimestamp = end - startDate.getTimezoneOffset() * 60;
  writer.writeMessage(
    'activity',
    {
      timestamp: end,
      total_timer_time: timerSeconds,
      num_sessions: 1,
      type: 'manual',
      event: 'activity',
      event_type: 'stop',
      local_timestamp: localTimestamp,
    },
    null,
    true,
  );

  const view = writer.finish();
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}
