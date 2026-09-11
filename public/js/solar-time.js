import { getPosition, getTimes } from '../vendor/suncalc/index.js';

const formatters = new Map();
export function localParts(date, timeZone = 'Europe/Zurich') {
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }));
  return Object.fromEntries(formatters.get(timeZone).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

export const daysInYear = year => (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
export const dayOfYear = ({ year, month, day }) => Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1;

// Date inputs describe a calendar day in Bern, never a browser-local instant.
export function calendarSelection(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return { year, day: dayOfYear({ year, month, day }) };
}

export function calendarDate(year, day) {
  return new Date(Date.UTC(year, 0, Math.max(1, Math.min(daysInYear(year), day)))).toISOString().slice(0, 10);
}

const wallTime = parts => Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);

// Convert a civil clock time in the MODEL's zone, independently of the browser's
// zone. On the autumn fold use the first occurrence; spring gaps move forward.
export function localInstant(year, day, minutes, timeZone) {
  const target = Date.UTC(year, 0, day, 0, minutes);
  const offsets = new Set([-36, 0, 36].map(hours => {
    const sample = target + hours * 3600000;
    return wallTime(localParts(new Date(sample), timeZone)) - sample;
  }));
  const candidates = [...offsets].map(offset => ({ date: new Date(target - offset), offset }));
  const matching = candidates.filter(candidate => wallTime(localParts(candidate.date, timeZone)) === target).sort((a, b) => a.date - b.date);
  if (matching.length) return { date: matching[0].date, adjusted: false, repeated: matching.length > 1 };
  const next = candidates.filter(candidate => wallTime(localParts(candidate.date, timeZone)) > target)
    .sort((a, b) => wallTime(localParts(a.date, timeZone)) - wallTime(localParts(b.date, timeZone)))[0];
  if (!next) throw new Error('Could not resolve this local date and time.');
  return { date: next.date, adjusted: true, repeated: false };
}

export function solarDirection(azimuthDegrees, altitudeDegrees, enuToModelDegrees) {
  const radians = Math.PI / 180;
  const azimuth = azimuthDegrees * radians;
  const altitude = altitudeDegrees * radians;
  const rotation = enuToModelDegrees * radians;
  const east = Math.sin(azimuth) * Math.cos(altitude);
  const north = Math.cos(azimuth) * Math.cos(altitude);
  // ENU -> rotated Blender XY -> glTF (x, z, -y).
  return [east * Math.cos(rotation) - north * Math.sin(rotation), Math.sin(altitude),
    -(east * Math.sin(rotation) + north * Math.cos(rotation))];
}

export function solarState({ year, day, minutes, location }) {
  const instant = localInstant(year, day, minutes, location.timeZone);
  // SunCalc 2.x uses DEGREES, with azimuth clockwise from north.
  const position = getPosition(instant.date, location.latitude, location.longitude);
  // Anchor daily events at local noon: near midnight the nearest solar day
  // can otherwise be the previous civil date.
  const noon = localInstant(year, day, 720, location.timeZone).date;
  return { ...instant, ...position, direction: solarDirection(position.azimuth, position.altitude, location.enuToModelDegrees),
    times: getTimes(noon, location.latitude, location.longitude) };
}
