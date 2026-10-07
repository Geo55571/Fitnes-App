/**
 * Turns recognized text into structured values: numbers (with units, currencies, percentages),
 * clock/stopwatch times and dates. Pure and engine-independent — the same parser runs on text
 * from Apple Vision, ML Kit or the web engine.
 *
 * Every value keeps the exact text it came from. Digits that are part of a word or code
 * ("A1", "COVID-19", "v2") are left alone rather than guessed at.
 */

export type NumberKind = 'integer' | 'decimal' | 'percent' | 'currency' | 'time' | 'measurement';

export interface RecognizedNumber {
  /**
   * Parsed value. For `time`, the parts read in base 60 from left to right:
   * "12:43" → 763 (minutes after midnight for a clock), "0:35:12" → 2112 (seconds for a stopwatch).
   */
  value: number;
  /** Exactly as recognized, e.g. "72.4 kg", "19,99 €". */
  rawText: string;
  /** Normalized unit: "kg", "km/h", "%", "°C", "€", "/km"… or null. "pace" is a pace whose distance unit isn't shown (8'37"). */
  unit: string | null;
  kind: NumberKind;
  /** 0…1 from the OCR engine for the line it was found in; null when unknown. */
  confidence: number | null;
  /** ISO 4217 code for currencies. */
  currency?: string;
  /** For times: [hours, minutes] or [h, m, s] / [m, s] as written. */
  parts?: number[];
  /** For stopwatch times with hundredths ("19:39.05"): the fraction of a second (0.05). */
  fraction?: number;
}

export interface RecognizedDate {
  rawText: string;
  /** YYYY-MM-DD when the date is complete and unambiguous, else null. */
  iso: string | null;
  year: number | null;
  month: number;
  day: number;
  confidence: number | null;
}

export interface ParsedLine {
  numbers: RecognizedNumber[];
  dates: RecognizedDate[];
}

// ---------- numbers ----------

/** A number as printed: optional sign, digits with optional "." / "," separators. */
const NUM = String.raw`[-−+]?\d+(?:[.,]\d+)*`;

/**
 * Reads a printed number, accepting both "." and "," as the decimal separator.
 * Returns null for things that aren't one number (e.g. "1.2.3").
 */
export function parseLocaleNumber(raw: string): { value: number; decimals: boolean } | null {
  let s = raw.trim().replace(/−/g, '-');
  let sign = 1;
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  if (!/^\d+(?:[.,]\d+)*$/.test(s)) return null;

  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let intPart = s;
  let frac = '';

  if (dots && commas) {
    // "1.234,56" or "1,234.56": the last separator is the decimal one.
    const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    const thousands = s[last] === '.' ? ',' : '.';
    intPart = s.slice(0, last);
    frac = s.slice(last + 1);
    if (!validGroups(intPart, thousands) || intPart.includes(s[last])) return null;
    intPart = intPart.split(thousands).join('');
  } else if (dots + commas === 1) {
    const sep = dots ? '.' : ',';
    const [a, b] = s.split(sep);
    // "1,234" is a thousands group; "72,4" / "19,99" / "1.234" are decimals.
    if (sep === ',' && b.length === 3 && a.length <= 3 && a !== '0') intPart = a + b;
    else {
      intPart = a;
      frac = b;
    }
  } else if (dots + commas > 1) {
    // "1.234.567" / "1,234,567": thousands only.
    const sep = dots ? '.' : ',';
    if (!validGroups(s, sep)) return null;
    intPart = s.split(sep).join('');
  }

  const value = sign * Number(frac ? `${intPart}.${frac}` : intPart);
  return Number.isFinite(value) ? { value, decimals: !!frac } : null;
}

function validGroups(s: string, sep: string): boolean {
  const groups = s.split(sep);
  return groups[0].length >= 1 && groups[0].length <= 3 && groups.slice(1).every((g) => g.length === 3);
}

// ---------- units ----------

/** Recognized unit spellings → normalized unit. Longest spellings are tried first. */
const UNIT_ALIASES: Record<string, string> = {
  'km/h': 'km/h', kmh: 'km/h', kph: 'km/h', 'km/u': 'km/h', mph: 'mph', 'mi/h': 'mph', 'm/s': 'm/s',
  'min/km': '/km', 'min/mi': '/mi', '/km': '/km', '/mi': '/mi',
  'kg/m²': 'kg/m²', 'kg/m2': 'kg/m²', 'mmol/l': 'mmol/L', 'mg/dl': 'mg/dL',
  kg: 'kg', kgs: 'kg', g: 'g', mg: 'mg', lbs: 'lb', lb: 'lb', oz: 'oz', st: 'st',
  km: 'km', mi: 'mi', miles: 'mi', cm: 'cm', mm: 'mm', m: 'm', ft: 'ft', yd: 'yd', yds: 'yd', inch: 'in', inches: 'in',
  bpm: 'bpm', 's/min': 'bpm', 'schläge/min': 'bpm', 'otk/min': 'bpm', ppm: 'bpm', spm: 'spm', rpm: 'rpm', kcal: 'kcal', cal: 'kcal', kj: 'kJ', steps: 'steps', step: 'steps', reps: 'reps',
  w: 'W', kw: 'kW', kwh: 'kWh', v: 'V', mah: 'mAh',
  ms: 'ms', s: 's', sec: 's', secs: 's', min: 'min', mins: 'min', h: 'h', hr: 'h', hrs: 'h', hours: 'h',
  l: 'L', ml: 'mL',
  '°c': '°C', 'ºc': '°C', '° c': '°C', c: '°C', '°f': '°F', 'ºf': '°F', f: '°F', '°': '°',
  gb: 'GB', mb: 'MB', kb: 'KB',
};
const UNIT_RE = Object.keys(UNIT_ALIASES)
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
  .join('|');

const CURRENCY_SYMBOLS: Record<string, string> = { '€': 'EUR', $: 'USD', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₽': 'RUB', '₺': 'TRY', '₩': 'KRW' };
const CURRENCY_CODES = ['EUR', 'USD', 'GBP', 'CHF', 'RSD', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'HRK', 'BAM', 'MKD', 'RON', 'BGN'];
const SYMBOL_RE = Object.keys(CURRENCY_SYMBOLS)
  .map((s) => s.replace(/[$]/g, '\\$'))
  .join('');

// ---------- dates ----------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;

function makeDate(rawText: string, year: number | null, month: number, day: number, confidence: number | null): RecognizedDate | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year !== null && year < 100) year += 2000;
  const dim = new Date(Date.UTC(year ?? 2024, month, 0)).getUTCDate(); // 2024: leap year allows Feb 29 without a year
  if (day > dim) return null;
  const iso = year !== null ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
  return { rawText, iso, year, month, day, confidence };
}

// ---------- line parser ----------

interface Match {
  start: number;
  end: number;
  number?: RecognizedNumber;
  date?: RecognizedDate;
}

/** A value may not be glued to letters or digits around it (that would make it part of a word or code). */
function isolated(text: string, start: number, end: number): boolean {
  const before = text[start - 1] ?? ' ';
  const after = text[end] ?? ' ';
  return !/[\p{L}\d]/u.test(before) && !/[\p{L}\d]/u.test(after);
}

/** Parses one recognized line. */
export function parseLine(text: string, confidence: number | null = null): ParsedLine {
  const matches: Match[] = [];
  const taken = (s: number, e: number) => matches.some((m) => s < m.end && e > m.start);
  const scan = (re: RegExp, build: (m: RegExpExecArray) => Omit<Match, 'start' | 'end'> | null) => {
    for (const m of text.matchAll(re)) {
      const start = m.index!;
      const end = start + m[0].length;
      if (taken(start, end) || !isolated(text, start, end)) continue;
      const built = build(m as RegExpExecArray);
      if (built) matches.push({ start, end, ...built });
    }
  };
  const date = (raw: string, y: number | null, mo: number, d: number) => {
    const r = makeDate(raw, y, mo, d, confidence);
    return r ? { date: r } : null;
  };

  // 1. Dates (before numbers, so "02.10.2026" isn't read as two numbers).
  scan(/(\d{4})-(\d{1,2})-(\d{1,2})/g, (m) => date(m[0], +m[1], +m[2], +m[3]));
  scan(/(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})\.?/g, (m) => date(m[0], +m[3], +m[2], +m[1]));
  scan(/(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})/g, (m) => {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3];
    if (a > 12 && b <= 12) return date(m[0], y, b, a);
    if (b > 12 && a <= 12) return date(m[0], y, a, b);
    // 03/04/2026 could be March 4 or 3 April: keep it, without guessing.
    const r = makeDate(m[0], y, a, b, confidence);
    return r ? { date: { ...r, iso: null } } : null;
  });
  scan(new RegExp(String.raw`${MONTH_RE}\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?`, 'gi'), (m) =>
    date(m[0], m[3] ? +m[3] : null, MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]),
  );
  scan(new RegExp(String.raw`(\d{1,2})(?:st|nd|rd|th)?\.?\s+${MONTH_RE}(?:,?\s+(\d{4}))?`, 'gi'), (m) =>
    date(m[0], m[3] ? +m[3] : null, MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]),
  );

  // 2. Times and durations: 12:43, 0:35:12, 19:39.05 (stopwatch hundredths), 7:05 PM, 4:48 /km.
  scan(
    new RegExp(String.raw`(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,2})(?!\d))?(?:\s?(am|pm)\b)?(?:\s?(min\/km|min\/mi|\/km|\/mi)(?![\p{L}]))?`, 'giu'),
    (m) => {
      const parts = [m[1], m[2], m[3]].filter((p) => p !== undefined).map(Number);
      if (parts.slice(1).some((p) => p > 59)) return null;
      if (m[5]) {
        if (parts[0] < 1 || parts[0] > 12 || m[4]) return null;
        parts[0] = (parts[0] % 12) + (m[5].toLowerCase() === 'pm' ? 12 : 0);
      }
      const value = parts.reduce((acc, p) => acc * 60 + p, 0);
      const unit = m[6] ? UNIT_ALIASES[m[6].toLowerCase()] : null;
      const fraction = m[4] !== undefined ? Number(`0.${m[4]}`) : undefined;
      return { number: { value, rawText: m[0], unit, kind: 'time', confidence, parts, ...(fraction !== undefined ? { fraction } : {}) } };
    },
  );

  // 2b. Paces written with minute/second marks, as Apple Watch does: 8'37", 5'21"/KM, 2'07"/100M.
  // OCR often drops the apostrophe ("837"") or reads the closing marks as one quote ("9'00'").
  const paceUnit = (u: string | undefined) => (!u ? 'pace' : (UNIT_ALIASES[u.toLowerCase()] ?? u.toLowerCase().replace(/\s/g, '')));
  const PACE_TAIL = String.raw`(?:\s?(\/km|\/mi|\/100\s?m|\/100\s?yd|\/500\s?m))?`;
  const pace = (m: RegExpExecArray, min: string, sec: string, u: string | undefined) => {
    if (+sec > 59) return null;
    return { number: { value: +min * 60 + +sec, rawText: m[0], unit: paceUnit(u), kind: 'time' as const, confidence, parts: [+min, +sec] } };
  };
  const MIN_MARK = `['’′´${String.fromCharCode(96)}]`; // apostrophe look-alikes, the backtick too
  scan(new RegExp(String.raw`(\d{1,2})\s?` + MIN_MARK + String.raw`(\d{2})(?:\s?(?:["”″]|''|['’′]))?${PACE_TAIL}`, 'giu'), (m) => pace(m, m[1], m[2], m[3]));
  scan(new RegExp(String.raw`(\d{1,2})(\d{2})(?:["”″]|'')${PACE_TAIL}`, 'giu'), (m) => pace(m, m[1], m[2], m[3]));

  const num = (raw: string) => parseLocaleNumber(raw);

  // 3. Money: €19.99, $5, 19,99 €, 20 EUR, EUR 20.
  scan(new RegExp(String.raw`([${SYMBOL_RE}])\s?(${NUM})`, 'g'), (m) => {
    const n = num(m[2]);
    return n ? { number: { value: n.value, rawText: m[0], unit: m[1], kind: 'currency', confidence, currency: CURRENCY_SYMBOLS[m[1]] } } : null;
  });
  scan(new RegExp(String.raw`(${NUM})\s?([${SYMBOL_RE}])`, 'g'), (m) => {
    const n = num(m[1]);
    return n ? { number: { value: n.value, rawText: m[0], unit: m[2], kind: 'currency', confidence, currency: CURRENCY_SYMBOLS[m[2]] } } : null;
  });
  scan(new RegExp(String.raw`(${NUM})\s?(${CURRENCY_CODES.join('|')})\b|\b(${CURRENCY_CODES.join('|')})\s?(${NUM})`, 'g'), (m) => {
    const n = num(m[1] ?? m[4]);
    const code = m[2] ?? m[3];
    return n ? { number: { value: n.value, rawText: m[0], unit: code, kind: 'currency', confidence, currency: code } } : null;
  });

  // 4. Percentages.
  scan(new RegExp(String.raw`(${NUM})\s?%`, 'g'), (m) => {
    const n = num(m[1]);
    return n ? { number: { value: n.value, rawText: m[0], unit: '%', kind: 'percent', confidence } } : null;
  });

  // 5. Values with units: 72.4 kg, 180 cm, 25 km/h, 7.24KM, -5.5 °C.
  scan(new RegExp(String.raw`(${NUM})\s?(${UNIT_RE})(?![\p{L}\d])`, 'giu'), (m) => {
    const n = num(m[1]);
    const unit = UNIT_ALIASES[m[2].toLowerCase()];
    return n && unit ? { number: { value: n.value, rawText: m[0], unit, kind: 'measurement', confidence } } : null;
  });

  // 6. Plain numbers.
  for (const m of text.matchAll(new RegExp(NUM, 'g'))) {
    let start = m.index!;
    let raw = m[0];
    // A sign glued to a letter or digit is a range or code ("10-15", "A-1"), not a minus sign.
    if (/^[-−+]/.test(raw) && /[\p{L}\d]/u.test(text[start - 1] ?? '')) {
      start += 1;
      raw = raw.slice(1);
    }
    const end = start + raw.length;
    if (taken(start, end) || !isolated(text, start, end)) continue;
    const n = num(raw);
    if (n) matches.push({ start, end, number: { value: n.value, rawText: raw, unit: null, kind: n.decimals ? 'decimal' : 'integer', confidence } });
  }

  matches.sort((a, b) => a.start - b.start);
  return {
    numbers: matches.flatMap((m) => (m.number ? [m.number] : [])),
    dates: matches.flatMap((m) => (m.date ? [m.date] : [])),
  };
}

/** Parses many lines (e.g. an OCR result), keeping each line's confidence. */
export function parseLines(lines: { text: string; confidence: number | null }[]): ParsedLine {
  const out: ParsedLine = { numbers: [], dates: [] };
  for (const l of lines) {
    const p = parseLine(l.text, l.confidence);
    out.numbers.push(...p.numbers);
    out.dates.push(...p.dates);
  }
  return out;
}
