/**
 * Parses a date value as UTC, regardless of the server's local timezone.
 *
 * Handles:
 *  - Date objects (returned as-is)
 *  - ISO strings with timezone suffix (Z or +/-offset) — parsed as-is
 *  - Date-only strings (e.g. "2026-08-03") — already UTC by spec
 *  - DateTime strings without timezone (e.g. "2026-08-03T10:00:00") — appends "Z"
 *
 * @param {string|Date|number} value
 * @returns {Date}
 */
function parseUTCDate(value) {
  if (value instanceof Date) return value;
  if (typeof value !== "string") return new Date(value);

  const str = value.trim();

  if (/[zZ]$/.test(str) || /[+-]\d{2}:?\d{2}$/.test(str)) {
    return new Date(str);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(str);
  }

  return new Date(str + "Z");
}

export default parseUTCDate;
