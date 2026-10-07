/**
 * Understands the text of a workout summary (Apple Watch, the Fitness app, Garmin, Samsung…)
 * read by OCR, and turns it into a ScanReading — the same shape the rest of the scan pipeline
 * (planScan → save) already uses. Runs instantly on any device, no model needed.
 *
 * It works like a person reading the screen: find the workout name, then each label
 * ("Workout Time", "Distance", "Avg. Heart Rate"…) and the value next to or below it,
 * using units to check that the value fits. Values without a label are placed by their unit.
 * The optional on-device AI (src/ai) handles screens this can't make sense of.
 */
import { addDays } from './dates';
import { parseLine, type RecognizedNumber } from './ocrParser';
import type { DayKey } from './types';
import type { ScanActivity, ScanReading, ScanWorkout } from './workoutScan';

export interface OcrLineInput {
  text: string;
  confidence: number | null;
  /** 0…1 of the image, origin top-left. */
  box: { x: number; y: number; width: number; height: number } | null;
}

export type Field = 'duration' | 'distance' | 'active_kcal' | 'total_kcal' | 'avg_hr' | 'max_hr' | 'elevation';

export interface Interpretation {
  reading: ScanReading;
  /**
   * Which fields were found and how: next to a 'label', by 'unit' only, as a 'stopwatch' time,
   * from the name ('text'), by the on-device 'ai', from the workout's 'icon', or 'infer'red from
   * other clues (laps → swim, a running pace → run) or other values (distance = time ÷ pace).
   */
  found: Partial<Record<Field | 'activity' | 'start' | 'date', 'label' | 'unit' | 'stopwatch' | 'text' | 'ai' | 'icon' | 'infer'>>;
  /** 0…1: how complete and certain the reading is. */
  score: number;
  /**
   * The workout's name when it isn't one the interpreter knows ("Zumba", "Leg day"), so the
   * on-device AI can classify it. Null when the type was recognized or no name was found.
   */
  unknownName: string | null;
}

// ---------- vocabulary ----------

const ACTIVITY_WORDS: [RegExp, ScanActivity][] = [
  [/\b(strength|krafttraining|kraft|trening snage|weight ?training|weights|weightlifting|gym|kettlebells?|dumbbells?)\b/i, 'strength_training'],
  [/\b(hiit|high intensity|intervall\w*|crossfit|tabata|bootcamp|circuit)\b/i, 'hiit'],
  [/\b(elliptical|elliptic|crosstrainer|cross trainer|eliptic)/i, 'elliptical'],
  [/\b(yoga|joga)\b/i, 'yoga'],
  [/\b(hike|hiking|wandern|planinarenje)\b/i, 'hiking'],
  [/\b(swim|swimming|schwimmen|plivanje|natación|pool|open water)\b/i, 'swimming'],
  [/\b(rowing|row|rudern|veslanje|remo)\b/i, 'rowing'],
  [/\b(cycle|cycling|bike|biking|ride|radfahren|rad|bicikl\w*|vo[zž]nja|ciclismo|spinning)\b/i, 'cycling'],
  [/\b(run|running|laufen|lauf|laufband|tr[cč]anje|jog|jogging|correr|carrera|treadmill)\b/i, 'running'],
  [/\b(walk|walking|gehen|spaziergang|hodanje|[sš]etnja|caminar)\b/i, 'walking'],
];
/** Workout names that don't map to a built-in type. */
const OTHER_WORDS =
  /\b(pilates|dance|tanz|core training|stair ?stepper|stairs|kickboxing|boxing|tennis|soccer|football|basketball|cooldown|mixed cardio|climbing|martial arts|cross training|functional training|skiing|snowboard|golf|volleyball|badminton|squash|surfing|skating)\b/i;

const LABELS: [RegExp, Field | 'elapsed' | 'calories' | 'skip'][] = [
  [/\b(workout time|total time|duration|moving time|active time|trainingsdauer|trainingszeit|dauer|trajanje|vreme treninga|tiempo)\b/i, 'duration'],
  [/\belapsed( time)?\b/i, 'elapsed'],
  [/\b(distance|dist\.?|distanz|strecke|udaljenost|razdaljina|distancia)\b/i, 'distance'],
  [/\b(active (kilo)?calories|active energy|active k?cal|move|aktive kalorien|aktivne kalorije)\b/i, 'active_kcal'],
  [/\b(total (kilo)?calories|total energy|total k?cal|gesamtkalorien|ukupne kalorije)\b/i, 'total_kcal'],
  [/\b(calories|kilocalories|kcal|energy|kalorien|kalorije|energie)\b/i, 'calories'],
  [/\b(max\.?|maximum|höchste|maks\.?)\s*(heart rate|hr|herzfrequenz|puls)\b/i, 'max_hr'],
  [/\b(avg\.?|average|ø|durchschn\.?|prosečn\w*|prosecn\w*)?\s*(heart rate|hr|herzfrequenz|puls)\b/i, 'avg_hr'],
  [/\b(elev(ation)?\.? gain(ed)?|elevation|total ascent|ascent|climb|höhenmeter|aufstieg|uspon)\b/i, 'elevation'],
  // Derived values a screen shows that must not be mistaken for the ones above ("23:53 TIME IN
  // ZONE" is not the workout time, "9'00" ROLLING MILE" not a duration).
  [
    /\b(pace|speed|cadence|power|steps|tempo|geschwindigkeit|kadenz|leistung|laps?|strokes?|swolf|recovery|time in zone|in zone|zone \d|rolling \w+|segment|split|stride|ground contact|vertical osc\w*)\b/i,
    'skip',
  ],
  // Apple Watch's live workout views write "ACTIVE" and "TOTAL" (above a small "KCAL") next to the
  // number. Last, so "Total Time" / "Total Ascent" / "Active Time" match their own labels first.
  [/\bactive\b/i, 'active_kcal'],
  [/\btotal\b/i, 'total_kcal'],
];

const ACTIVITY_TITLE: Record<ScanActivity, string> = {
  running: 'Run',
  walking: 'Walk',
  hiking: 'Hike',
  cycling: 'Cycling',
  swimming: 'Swim',
  rowing: 'Rowing',
  elliptical: 'Elliptical',
  hiit: 'HIIT',
  strength_training: 'Strength training',
  yoga: 'Yoga',
  other: 'Workout',
};

/**
 * Clues to the workout type when its name isn't shown (Apple Watch shows only an icon while
 * working out): metrics only one kind of workout has.
 */
const ACTIVITY_CLUES: [RegExp, ScanActivity][] = [
  [/laps?\b|lengths?\b|swolf|strokes?\b|\/100\s?(m|yd)\b|pool/i, 'swimming'],
  [/\/500\s?m\b/i, 'rowing'],
  [/\d\s?(mph|km\/h|kph)\b|\b(mph|km\/h)\b|\bspeed\b/i, 'cycling'],
  [/\bstride|ground contact|vertical osc|running power/i, 'running'],
];

/**
 * A pace at most this many seconds per km is a run (9:00 /km ≈ 14:29 /mi): slow joggers run 7–9 min/km,
 * walkers 9–12 min/km (15–20 min/mi). Slower is a walk.
 */
const RUN_PACE_PER_KM = 540;
const KM_PER_MI = 1.609344;

/** "8'37"", "856"" (apostrophe lost), "9'00'": a pace written with minute/second marks. */
const PACE_TOKEN = /^\d{1,2}['’′´`]?\d{2}(["”″']|'')$/;

// ---------- helpers ----------

/** Fixes OCR look-alikes inside number-like tokens only ("1O.5" → "10.5", "l42" → "142"). */
export function fixDigits(text: string): string {
  return text.replace(/(?<![\p{L}])[\dOoIlS|]+(?:[.,:][\dOoIlS|]+)*(?![\p{L}])/gu, (tok) =>
    /\d/.test(tok) && /[OoIlS|]/.test(tok) ? tok.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5') : tok,
  );
}

interface Line {
  text: string;
  conf: number;
  box: { x: number; y: number; width: number; height: number } | null;
  nums: RecognizedNumber[];
  index: number;
}

const center = (b: Line['box']) => (b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null);

/** Durations: "0:35:12", "35:12" (mm:ss), "1h 05m", "45 min". */
function durationSeconds(n: RecognizedNumber, text: string): number | null {
  if (n.kind === 'time' && n.parts && !n.unit) {
    const p = n.parts;
    // No workout lasts 24 h: "31:12:25" is a stopwatch's "31:12.25" with its point read as a colon.
    if (p.length === 3) return p[0] > 23 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2];
    // Two parts are minutes:seconds on a workout screen, unless written as hours ("1:05 h").
    return /h(ou)?r?s?\b/i.test(text.slice(text.indexOf(n.rawText) + n.rawText.length, text.indexOf(n.rawText) + n.rawText.length + 4))
      ? p[0] * 3600 + p[1] * 60
      : p[0] * 60 + p[1];
  }
  if (n.kind === 'measurement') {
    if (n.unit === 'min') return n.value * 60;
    if (n.unit === 'h') return n.value * 3600;
    if (n.unit === 's') return n.value;
  }
  return null;
}

function hoursMinutes(text: string): number | null {
  const m = text.match(/(\d{1,2})\s*h(?:r|rs)?\s*(\d{1,2})\s*m(?:in)?\b/i);
  return m ? +m[1] * 3600 + +m[2] * 60 : null;
}

/** Does this number fit the field? Returns the normalized value, or null. */
function fit(field: Field, n: RecognizedNumber, text: string, labelled: boolean): number | { value: number; unit: string } | null {
  switch (field) {
    case 'duration':
      return durationSeconds(n, text);
    case 'distance':
      if (n.kind === 'measurement' && ['km', 'mi', 'm', 'yd'].includes(n.unit!)) return { value: n.value, unit: n.unit! };
      return null;
    case 'active_kcal':
    case 'total_kcal':
      if (n.kind === 'measurement' && n.unit === 'kcal') return n.value;
      return labelled && (n.kind === 'integer' || n.kind === 'decimal') && n.value > 0 && n.value < 10000 ? n.value : null;
    case 'avg_hr':
    case 'max_hr':
      if (n.kind === 'measurement' && n.unit === 'bpm') return n.value;
      return labelled && n.kind === 'integer' && n.value >= 30 && n.value <= 240 ? n.value : null;
    case 'elevation':
      if (n.kind === 'measurement' && (n.unit === 'm' || n.unit === 'ft')) return { value: n.value, unit: n.unit };
      return null;
  }
}

const WHOLE_TIME = /^\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,2})?$/;

/**
 * Rejoins a time the OCR cut in two on a tilted photo ("19:3" + "9.05" → "19:39.05"): neighbouring
 * pieces on the same row that only make a valid time together.
 */
export function joinSplitTimes(input: OcrLineInput[]): OcrLineInput[] {
  const out: OcrLineInput[] = [];
  for (let i = 0; i < input.length; i++) {
    const a = input[i];
    const b = input[i + 1];
    const at = a.text.trim();
    const bt = b?.text.trim() ?? '';
    const joined = at + bt;
    let fits = !!b && /^\d{1,2}:[\d:]*$/.test(at) && !WHOLE_TIME.test(at) && WHOLE_TIME.test(joined);
    if (fits && a.box && b.box) {
      const overlap = Math.min(a.box.y + a.box.height, b.box.y + b.box.height) - Math.max(a.box.y, b.box.y);
      const gap = b.box.x - (a.box.x + a.box.width);
      fits = overlap > 0.5 * Math.min(a.box.height, b.box.height) && gap > -0.5 * a.box.height && gap < a.box.height;
    }
    if (!fits) {
      out.push(a);
      continue;
    }
    const box =
      a.box && b.box
        ? {
            x: a.box.x,
            y: Math.min(a.box.y, b.box.y),
            width: b.box.x + b.box.width - a.box.x,
            height: Math.max(a.box.y + a.box.height, b.box.y + b.box.height) - Math.min(a.box.y, b.box.y),
          }
        : (a.box ?? b.box);
    const confidence = a.confidence === null || b.confidence === null ? (a.confidence ?? b.confidence) : Math.min(a.confidence, b.confidence);
    out.push({ text: joined, confidence, box });
    i++;
  }
  return out;
}

// ---------- main ----------

export interface InterpretContext {
  today: DayKey;
  /** The user's distance unit: what a pace without a unit (8'37") is measured in, if the screen doesn't say. */
  distanceUnit?: 'km' | 'mi';
  /** The workout type recognized from the screen's icon, if any (see src/ocr/icons.ts). */
  icon?: { activity: ScanActivity; score: number } | null;
}

export function interpretWorkoutText(input: OcrLineInput[], ctx: InterpretContext): Interpretation {
  // Drop the phone's status bar (clock, battery) at the very top of screenshots.
  const lines: Line[] = joinSplitTimes(input)
    .filter((l) => l.text.trim() && !(l.box && l.box.y + l.box.height < 0.045))
    .map((l, index) => {
      let text = fixDigits(l.text.replace(/\s+/g, ' ').trim())
        // "137BPM" read as "1378PM" or "1378BPM" (B → 8); a clock would have a colon ("7:08PM").
        .replace(/(^|[^\d:])(\d{2,3})8PM\b/gi, '$1$2BPM')
        .replace(/(^|[^\d:])(\d{2,3})8BPM\b/gi, (all: string, pre: string, d: string) => (+`${d}8` > 240 ? `${pre}${d}BPM` : all))
        // "MI" read as "M1", "Ml", "M|", "MlI".
        .replace(/(\d)\s?M[1lI|!]{1,2}(?![\p{L}\d])/gu, '$1MI')
        // Stray ":" after a unit or label ("372FT:", "16.2:").
        .replace(/([\p{L}\d])[:;]+(?=\s|$)/gu, '$1');
      // Small labels squeezed next to big numbers come out as junk glued to them ('152"', '182:'),
      // but on a pace line the marks belong to the value (856" = 8'56").
      const paceLine = /pace|\/km|\/mi\b/i.test(text);
      text = text.replace(/(\S*?\d)(["'`´*^~]+)(?=\s|$)/g, (all: string, body: string) => (paceLine && PACE_TOKEN.test(all) ? all : body));
      return { text, conf: l.confidence ?? 0.8, box: l.box, nums: parseLine(text).numbers, index };
    });
  const found: Interpretation['found'] = {};
  const used = new Set<RecognizedNumber>();
  const w: ScanWorkout = {
    activity: 'other',
    title: '',
    duration_seconds: null,
    distance: null,
    active_kcal: null,
    total_kcal: null,
    avg_heart_rate: null,
    max_heart_rate: null,
    elevation_gain: null,
    start_time: null,
    date: null,
  };

  // 1. The workout: the first line naming an activity (the title is near the top).
  for (const l of lines) {
    const letters = l.text.replace(/[^\p{L} ]/gu, '').trim();
    if (letters.length < 3 || LABELS.some(([re, f]) => f !== 'skip' && re.test(l.text))) continue;
    const hit = ACTIVITY_WORDS.find(([re]) => re.test(letters));
    if (hit || OTHER_WORDS.test(letters)) {
      w.activity = hit ? hit[1] : 'other';
      w.title = letters.replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40);
      found.activity = 'text';
      break;
    }
  }

  // Paces ("8'37" AVERAGE PACE", "4:48 /km"): never durations; they tell run from walk and give
  // the distance when it wasn't read. A pace without a unit is in the screen's distance unit.
  const allText = lines.map((l) => l.text).join('\n');
  const screenUnit: 'km' | 'mi' | null = /\d\s?mi\b|\bmi(les?)?\b/i.test(allText) ? 'mi' : /\d\s?km\b/i.test(allText) ? 'km' : null;
  const paceUnitOf = (n: RecognizedNumber): 'km' | 'mi' | '100m' | null =>
    n.unit === '/km' ? 'km' : n.unit === '/mi' ? 'mi' : n.unit === '/100m' ? '100m' : n.unit === 'pace' ? (screenUnit ?? ctx.distanceUnit ?? null) : null;
  const paces = lines.flatMap((l) =>
    l.nums
      .filter((n) => n.kind === 'time' && (n.unit === 'pace' || n.unit === '/km' || n.unit === '/mi' || n.unit === '/100m'))
      .map((n) => ({ n, l, avg: /\bav(era)?g(e)?\.?\b|ø|durchschn/i.test(l.text), current: /\bcurrent\b|aktuell/i.test(l.text), rolling: /rolling/i.test(l.text) })),
  );
  // The average pace is the workout's; a current or rolling pace only says what kind of workout it is.
  const avgPace = paces.find((p) => p.avg) ?? paces.find((p) => !p.current && !p.rolling) ?? null;
  for (const p of paces) used.add(p.n);

  // 1a. No name shown (the live workout view only has an icon): the icon, else clues like "LAPS",
  // "MPH", or how fast the pace is.
  // Only on what looks like a workout screen — a stopwatch time, a pace, a distance, calories or
  // heart rate — so "Speed: 25 km/h" in some document doesn't become a bike ride.
  const workoutish = paces.length > 0 || lines.some((l) => l.nums.some((n) => (n.kind === 'time' && (n.fraction !== undefined || n.parts?.length === 3)) || (n.kind === 'measurement' && ['km', 'mi', 'm', 'yd', 'kcal', 'bpm'].includes(n.unit!))));
  if (!found.activity && (workoutish || ctx.icon)) {
    const clue = ACTIVITY_CLUES.find(([re]) => re.test(allText));
    let guess: ScanActivity | null = clue ? clue[1] : null;
    const pace = avgPace ?? paces[0];
    if (!guess && pace) {
      const unit = paceUnitOf(pace.n);
      const perKm = unit === 'mi' ? pace.n.value / KM_PER_MI : unit === 'km' ? pace.n.value : null;
      if (unit === '100m') guess = 'swimming';
      // Unit unknown: walks take 15–20 min/mi or 9–12 min/km, so up to 9:00 is a run either way.
      else guess = (perKm !== null ? perKm <= RUN_PACE_PER_KM : pace.n.value <= RUN_PACE_PER_KM) ? 'running' : /elev|ascent|climb/i.test(allText) ? 'hiking' : 'walking';
    }
    if (ctx.icon) {
      w.activity = ctx.icon.activity;
      found.activity = 'icon';
    } else if (guess) {
      w.activity = guess;
      found.activity = 'infer';
    }
    if (found.activity) w.title = ACTIVITY_TITLE[w.activity];
  }

  // 1b. No known name: remember the likeliest title line (near the top, words only, not a label).
  let unknownName: string | null = null;
  if (!found.activity) {
    const title = lines.find(
      (l) =>
        (!l.box || l.box.y < 0.45) &&
        !l.nums.length &&
        /^\p{L}[\p{L} '’&-]{2,40}$/u.test(l.text) &&
        !LABELS.some(([re]) => re.test(l.text)) &&
        !/\b(workouts?|details|summary|today|yesterday|heute|gestern|danas|ju[cč]e|activity|aktivit\w*)$/i.test(l.text) &&
        !/^(mon|tue|wed|thu|fri|sat|sun)\w*,?$/i.test(l.text),
    );
    unknownName = title ? title.text : null;
  }

  // 2. Start time from a time range ("7:02–7:48 AM") and the date.
  for (const l of lines) {
    const range = l.text.match(/(\d{1,2}):(\d{2})\s*(am|pm)?\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (range && !w.start_time) {
      let h = +range[1];
      const ampm = (range[3] || range[6] || '').toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      if (h < 24 && +range[2] < 60) {
        w.start_time = `${String(h).padStart(2, '0')}:${range[2]}`;
        found.start = 'text';
        // These clock times are not durations.
        l.nums.filter((n) => n.kind === 'time').forEach((n) => used.add(n));
      }
    }
    if (!w.date) {
      const d = parseLine(l.text).dates.find((x) => x.month && x.day);
      if (d) {
        w.date = d.iso ?? `${pickYear(ctx.today, d.month, d.day)}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
        found.date = 'text';
      } else if (/\btoday\b|\bheute\b|\bdanas\b/i.test(l.text)) {
        w.date = ctx.today;
      } else if (/\byesterday\b|\bgestern\b|\bju[cč]e\b/i.test(l.text)) {
        w.date = addDays(ctx.today, -1);
        found.date = 'text';
      }
    }
  }
  // Clock times like "9:41" or "7:05 PM" shown alone at the top aren't the workout time.
  for (const l of lines) for (const n of l.nums) if (n.kind === 'time' && /am|pm/i.test(n.rawText)) used.add(n);

  // 3. Labels and the values that belong to them.
  const set = (field: Field, v: number | { value: number; unit: string }, how: 'label' | 'unit' | 'stopwatch') => {
    switch (field) {
      case 'duration':
        if (w.duration_seconds === null) w.duration_seconds = v as number;
        else return false;
        break;
      case 'distance':
        if (w.distance === null) w.distance = v as ScanWorkout['distance'];
        else return false;
        break;
      case 'active_kcal':
        if (w.active_kcal === null) w.active_kcal = v as number;
        else return false;
        break;
      case 'total_kcal':
        if (w.total_kcal === null) w.total_kcal = v as number;
        else return false;
        break;
      case 'avg_hr':
        if (w.avg_heart_rate === null) w.avg_heart_rate = v as number;
        else return false;
        break;
      case 'max_hr':
        if (w.max_heart_rate === null) w.max_heart_rate = v as number;
        else return false;
        break;
      case 'elevation':
        if (w.elevation_gain === null) w.elevation_gain = v as ScanWorkout['elevation_gain'];
        else return false;
        break;
    }
    found[field] = how;
    return true;
  };

  /**
   * Values that could belong to a label on line `l`, most likely first: after it on the same line,
   * to its right on the same row, before it ("152 ACTIVE"), to its left on the same row (a big number
   * with a small label beside it), then the closest lines below.
   */
  const candidates = (l: Line, labelStart: number, labelEnd: number, column: { x: number; width: number } | null): { n: RecognizedNumber; line: Line }[] => {
    const same = l.nums.filter((n) => l.text.indexOf(n.rawText, labelEnd) >= labelEnd).map((n) => ({ n, line: l }));
    const before = l.nums
      .filter((n) => {
        const at = l.text.indexOf(n.rawText);
        return at >= 0 && at + n.rawText.length <= labelStart;
      })
      .reverse()
      .map((n) => ({ n, line: l }));
    const row = (side: 'left' | 'right') =>
      !l.box
        ? []
        : lines
            .filter((o) => {
              if (o === l || !o.box || !o.nums.length) return false;
              const dy = Math.abs(center(o.box)!.y - center(l.box)!.y);
              if (dy > 0.6 * Math.max(o.box.height, l.box!.height)) return false;
              return side === 'right' ? o.box.x >= l.box!.x + l.box!.width - 0.02 : o.box.x + o.box.width <= l.box!.x + 0.02;
            })
            .sort((a, b) => Math.abs(center(a.box)!.x - center(l.box)!.x) - Math.abs(center(b.box)!.x - center(l.box)!.x))
            .flatMap((o) => (side === 'right' ? o.nums : [...o.nums].reverse()).map((n) => ({ n, line: o })));
    const c = center(l.box);
    const below = lines
      .filter((o) => o !== l && o.nums.length)
      .map((o) => {
        const oc = center(o.box);
        if (!c || !oc || !l.box || !o.box) return { o, d: o.index > l.index && o.index - l.index <= 2 ? o.index - l.index : Infinity };
        const dy = oc.y - c.y;
        const h = Math.max(l.box.height, 0.01);
        const col = column ?? { x: l.box.x, width: l.box.width };
        const overlaps = o.box.x < col.x + col.width + 0.02 && o.box.x + o.box.width > col.x - 0.02;
        return { o, d: dy > 0.2 * h && dy < 4 * h && overlaps ? dy : Infinity };
      })
      .filter((x) => x.d < Infinity)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .flatMap(({ o }) => {
        // Two labels side by side ("Workout Time  Distance") above two values ("0:46:13  8.02KM"):
        // take the value in the same column as this label.
        if (column && o.box && o.nums.length > 1) {
          const share = (column.x - (o.box.x ?? 0)) / Math.max(o.box.width, 0.01);
          const i = Math.max(0, Math.min(o.nums.length - 1, Math.floor(share * o.nums.length + 0.25)));
          return [{ n: o.nums[i], line: o }, ...o.nums.filter((_, j) => j !== i).map((n) => ({ n, line: o }))];
        }
        return o.nums.map((n) => ({ n, line: o }));
      });
    return [...same, ...row('right'), ...before, ...row('left'), ...below];
  };

  for (const l of lines) {
    // A line may hold several labels ("Active Kilocalories  Total Kilocalories").
    const labels: { field: Field | 'elapsed' | 'calories' | 'skip'; start: number; end: number }[] = [];
    for (const [re, field] of LABELS) {
      const g = new RegExp(re.source, 'gi');
      for (const m of l.text.matchAll(g)) {
        const start = m.index!;
        const end = start + m[0].length;
        if (labels.some((x) => start < x.end && end > x.start)) continue;
        labels.push({ field, start, end });
      }
    }
    labels.sort((a, b) => a.start - b.start);
    labels.forEach((lab, i) => {
      if (lab.field === 'skip') {
        // Consume the value of a derived label so it isn't placed elsewhere ("23:53 TIME IN ZONE"
        // is no workout time): its own line's value, else a pace beside or under it.
        // Only this label's part of the line: up to the next label, or back to the previous one.
        const from = labels[i - 1]?.end ?? 0;
        const to = labels[i + 1]?.start ?? l.text.length;
        const at = (n: RecognizedNumber) => l.text.indexOf(n.rawText, from);
        const mine = l.nums.filter((n) => !used.has(n) && at(n) >= from && at(n) + n.rawText.length <= to);
        const own = mine.find((n) => at(n) >= lab.end) ?? mine.reverse().find((n) => at(n) < lab.start);
        const next = own ? { n: own, line: l } : candidates(l, lab.start, lab.end, null).find((c) => !used.has(c.n));
        if (next && (next.line === l || next.n.unit === '/km' || next.n.unit === '/mi')) used.add(next.n);
        return;
      }
      // Horizontal slice of the line this label occupies (for side-by-side labels).
      const column =
        labels.length > 1 && l.box
          ? { x: l.box.x + (lab.start / l.text.length) * l.box.width, width: ((lab.end - lab.start) / l.text.length) * l.box.width }
          : null;
      const nextLabel = labels[i + 1]?.start ?? Infinity;
      const fields: Field[] =
        lab.field === 'elapsed' ? ['duration'] : lab.field === 'calories' ? ['total_kcal', 'active_kcal'] : [lab.field];
      for (const { n, line } of candidates(l, lab.start, lab.end, column)) {
        if (used.has(n)) continue;
        if (line === l && l.text.indexOf(n.rawText, lab.end) > nextLabel) continue;
        const field = fields.find((f) => fit(f, n, line.text, true) !== null);
        if (!field) continue;
        // "Elapsed Time" only counts when there's no workout time.
        if (lab.field === 'elapsed' && w.duration_seconds !== null) break;
        if (set(field, fit(field, n, line.text, true)!, 'label')) used.add(n);
        break;
      }
      if (lab.field === 'duration' && w.duration_seconds === null) {
        const hm = hoursMinutes(l.text.slice(lab.end));
        if (hm) set('duration', hm, 'label');
      }
    });
  }

  // 4. Unlabelled values, placed by their unit.
  const rest = lines.flatMap((l) => l.nums.filter((n) => !used.has(n)).map((n) => ({ n, l })));
  const byUnit = (pred: (n: RecognizedNumber) => boolean) => rest.filter(({ n }) => pred(n) && !used.has(n));
  for (const { n } of byUnit((n) => n.kind === 'measurement' && ['km', 'mi'].includes(n.unit!))) {
    if (set('distance', { value: n.value, unit: n.unit! }, 'unit')) used.add(n);
    break;
  }
  // Pools and tracks count in meters/yards ("925M"); without an elevation label, that's the distance.
  // A small label can be misread as "m" ("182 KCAL" → "182m"), so the surest reading wins.
  if (w.distance === null && !found.elevation) {
    const [best] = byUnit((n) => n.kind === 'measurement' && (n.unit === 'm' || n.unit === 'yd') && n.value >= 25 && n.value <= 50000).sort(
      (a, b) => b.l.conf - a.l.conf,
    );
    if (best && set('distance', { value: best.n.value, unit: best.n.unit! }, 'unit')) used.add(best.n);
  }
  const kcals = byUnit((n) => n.kind === 'measurement' && n.unit === 'kcal').map(({ n }) => n);
  if (kcals.length) {
    const [a, b] = kcals;
    if (b && w.active_kcal === null && w.total_kcal === null) {
      set('active_kcal', Math.min(a.value, b.value), 'unit');
      set('total_kcal', Math.max(a.value, b.value), 'unit');
    } else if (w.active_kcal === null) set('active_kcal', a.value, 'unit');
    else if (w.total_kcal === null && a.value > w.active_kcal) set('total_kcal', a.value, 'unit');
  }
  // Apple Watch lists ACTIVE above TOTAL calories; the small "ACTIVE KCAL" is often lost by OCR.
  // A plain number on the line just above the total, and smaller than it, is the active calories.
  if (w.total_kcal !== null && w.active_kcal === null) {
    const totalLine = lines.find((l) => l.nums.some((n) => used.has(n) && n.value === w.total_kcal));
    const above = totalLine ? lines.filter((l) => l.index < totalLine.index).slice(-2).reverse() : [];
    for (const l of above) {
      const n = l.nums.find((x) => !used.has(x) && (x.kind === 'integer' || x.kind === 'decimal') && x.value >= 1 && x.value < w.total_kcal!);
      if (n) {
        if (set('active_kcal', n.value, 'unit')) used.add(n);
        break;
      }
    }
  }
  const bpms = byUnit((n) => n.kind === 'measurement' && n.unit === 'bpm').map(({ n }) => n);
  if (bpms.length) {
    if (w.avg_heart_rate === null) set('avg_hr', bpms[0].value, 'unit');
    if (bpms[1] && w.max_heart_rate === null && bpms[1].value > bpms[0].value) set('max_hr', bpms[1].value, 'unit');
  }
  // The distance in a pace's unit (to check a time against pace × distance).
  const distIn = (unit: 'km' | 'mi' | '100m' | null): number | null => {
    const d = w.distance;
    if (!d || !unit) return null;
    const m = d.unit === 'km' ? d.value * 1000 : d.unit === 'mi' ? d.value * KM_PER_MI * 1000 : d.unit === 'm' ? d.value : d.unit === 'yd' ? d.value * 0.9144 : null;
    if (m === null) return null;
    return unit === 'km' ? m / 1000 : unit === 'mi' ? m / (KM_PER_MI * 1000) : m / 100;
  };
  const expected = avgPace ? (distIn(paceUnitOf(avgPace.n)) ?? 0) * avgPace.n.value : 0;

  if (w.duration_seconds === null) {
    // Which time is the workout's? A stopwatch-style time ("19:39.05", "0:35:12") is; one that
    // matches distance × average pace is; the watch's clock — a plain "10:09" small at the top
    // right — isn't.
    const boxed = lines.filter((l) => l.box);
    const top = Math.min(...boxed.map((l) => l.box!.y));
    const bottom = Math.max(...boxed.map((l) => l.box!.y + l.box!.height));
    const left = Math.min(...boxed.map((l) => l.box!.x));
    const right = Math.max(...boxed.map((l) => l.box!.x + l.box!.width));
    const times = byUnit((n) => n.kind === 'time' && !n.unit)
      .map(({ n, l }) => {
        const s = durationSeconds(n, l.text);
        const stopwatch = n.fraction !== undefined || (n.parts?.length ?? 0) === 3;
        const b = l.box;
        const clock =
          !stopwatch &&
          !!b &&
          boxed.length >= 3 &&
          (n.parts?.[0] ?? 99) <= 23 &&
          b.y - top < 0.2 * (bottom - top) &&
          b.x + b.width / 2 > (left + right) / 2 &&
          boxed.some((o) => o.box!.height > 1.3 * b.height);
        const matches = expected > 0 && s !== null && Math.abs(s - expected) / expected < 0.06;
        return { n, s, stopwatch, clock, score: (stopwatch ? 4 : 0) + (matches ? 5 : 0) - (clock ? 6 : 0) };
      })
      .filter((t): t is typeof t & { s: number } => t.s !== null && t.s >= 30 && t.score > -6);
    times.sort((a, b) => b.score - a.score || b.s - a.s);
    const best = times[0];
    if (best && set('duration', best.s, best.stopwatch ? 'stopwatch' : 'unit')) used.add(best.n);
  }

  // Distance not read, but the average pace (or speed) and the time were: work it out.
  if (w.distance === null && w.duration_seconds) {
    const unit = avgPace ? paceUnitOf(avgPace.n) : null;
    if (avgPace && unit && avgPace.n.value > 0) {
      const v = w.duration_seconds / avgPace.n.value;
      if (set('distance', unit === '100m' ? { value: Math.round(v * 100), unit: 'm' } : { value: Math.round(v * 100) / 100, unit }, 'unit')) found.distance = 'infer';
    } else {
      // An average speed: "16.2 MPH", or "16.2 AVERAGE MPH" with the unit in the label.
      const speedUnit = (n: RecognizedNumber, l: Line): 'mi' | 'km' | null => {
        if (n.kind === 'measurement') return n.unit === 'mph' ? 'mi' : n.unit === 'km/h' ? 'km' : null;
        if (n.kind !== 'decimal' && n.kind !== 'integer') return null;
        return /\bmph\b/i.test(l.text) ? 'mi' : /\bkm\/h\b|\bkph\b/i.test(l.text) ? 'km' : null;
      };
      const speed = rest.find(({ n, l }) => !used.has(n) && speedUnit(n, l) && !/max/i.test(l.text));
      const unit = speed && speedUnit(speed.n, speed.l);
      if (speed && unit && speed.n.value > 0 && set('distance', { value: Math.round(((speed.n.value * w.duration_seconds) / 3600) * 100) / 100, unit }, 'unit')) {
        found.distance = 'infer';
      }
    }
  }

  // 5. How much of a workout was found, weighted by OCR certainty.
  const has = (f: keyof Interpretation['found']) => (found[f] ? 1 : 0);
  const coverage = 0.35 * has('activity') + 0.3 * has('duration') + 0.2 * has('distance') + 0.05 * (has('active_kcal') || has('total_kcal')) + 0.05 * has('avg_hr') + 0.05 * has('start');
  const conf = lines.length ? lines.reduce((s, l) => s + l.conf, 0) / lines.length : 0;
  const score = Math.min(1, coverage * (0.6 + 0.4 * conf));
  // A workout if its type is known, a workout time was found, or at least two workout values were.
  const values = [w.distance, w.active_kcal ?? w.total_kcal, w.avg_heart_rate].filter((v) => v !== null).length;
  const isWorkout = !!found.activity || w.duration_seconds !== null || values >= 2;
  if (!w.title) w.title = unknownName ? titleCase(unknownName) : 'Workout';

  return {
    reading: { is_workout_summary: isWorkout, workouts: isWorkout ? [w] : [], note: isWorkout ? null : 'No workout summary found in the text.' },
    found,
    score: isWorkout ? score : 0,
    unknownName: isWorkout ? unknownName : null,
  };
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()).slice(0, 40);

/**
 * Sure enough to save without asking: the type came from the workout's name (or the AI) and the
 * time from its label or a stopwatch-style reading — or, on a live workout view, the type from its
 * icon plus the stopwatch and one more value read directly. Anything less is shown to the user to
 * check first.
 */
export function isCertain(i: Interpretation): boolean {
  const f = i.found;
  const timed = f.duration === 'label' || f.duration === 'stopwatch';
  if ((f.activity === 'text' || f.activity === 'ai') && timed) return i.score >= 0.5;
  // A live workout view: the type from its icon, the stopwatch time, and something more read
  // directly (not worked out) — distance, calories or heart rate.
  const more = (f.distance && f.distance !== 'infer') || f.active_kcal || f.total_kcal || f.avg_hr;
  return f.activity === 'icon' && f.duration === 'stopwatch' && !!more && i.score >= 0.5;
}

/** Applies a workout type decided elsewhere (the on-device AI) to an interpretation. */
export function withActivity(i: Interpretation, activity: ScanActivity): Interpretation {
  const w = i.reading.workouts[0];
  if (!w) return i;
  return {
    ...i,
    reading: { ...i.reading, workouts: [{ ...w, activity }] },
    found: { ...i.found, activity: 'ai' },
    unknownName: null,
  };
}

/** A date shown without a year: the most recent such date that isn't in the future. */
function pickYear(today: DayKey, month: number, day: number): number {
  const y = Number(today.slice(0, 4));
  const candidate = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return candidate <= today ? y : y - 1;
}

