import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseLine, parseLines, parseLocaleNumber } from './ocrParser';

/** [rawText, value, unit, kind] for every number in a line. */
const nums = (text: string) => parseLine(text, 0.9).numbers.map((n) => [n.rawText, n.value, n.unit, n.kind]);

describe('OCR number parser', () => {
  it('reads the sample lines', () => {
    assert.deepEqual(nums('Score: 87'), [['87', 87, null, 'integer']]);
    assert.deepEqual(nums('Weight: 72.4 kg'), [['72.4 kg', 72.4, 'kg', 'measurement']]);
    assert.deepEqual(nums('Height: 180 cm'), [['180 cm', 180, 'cm', 'measurement']]);
    assert.deepEqual(nums('Battery: 93%'), [['93%', 93, '%', 'percent']]);
    assert.deepEqual(nums('Price: €19.99'), [['€19.99', 19.99, '€', 'currency']]);
    assert.deepEqual(nums('Speed: 25 km/h'), [['25 km/h', 25, 'km/h', 'measurement']]);
    assert.deepEqual(nums('Time: 12:43'), [['12:43', 763, null, 'time']]);
    assert.deepEqual(nums('Temperature: -5.5 C'), [['-5.5 C', -5.5, '°C', 'measurement']]);
  });

  it('reads the listed formats', () => {
    assert.deepEqual(nums('72'), [['72', 72, null, 'integer']]);
    assert.deepEqual(nums('72.4'), [['72.4', 72.4, null, 'decimal']]);
    assert.deepEqual(nums('72,4'), [['72,4', 72.4, null, 'decimal']]);
    assert.deepEqual(nums('-15'), [['-15', -15, null, 'integer']]);
    assert.deepEqual(nums('87%'), [['87%', 87, '%', 'percent']]);
    assert.deepEqual(nums('19,99 €'), [['19,99 €', 19.99, '€', 'currency']]);
    assert.deepEqual(nums('120 bpm'), [['120 bpm', 120, 'bpm', 'measurement']]);
    assert.deepEqual(nums('Ø Herzfrequenz 118 S/min'), [['118 S/min', 118, 'bpm', 'measurement']]);
    assert.deepEqual(nums('5.5 km'), [['5.5 km', 5.5, 'km', 'measurement']]);
  });

  it('keeps confidence, currency codes and time parts', () => {
    const [price] = parseLine('Total 20 EUR', 0.42).numbers;
    assert.equal(price.currency, 'EUR');
    assert.equal(price.confidence, 0.42);
    const [t] = parseLine('Workout Time 0:35:12').numbers;
    assert.deepEqual(t.parts, [0, 35, 12]);
    assert.equal(t.value, 2112);
    assert.deepEqual(nums('Avg pace 4:48 /km'), [['4:48 /km', 288, '/km', 'time']]);
    assert.deepEqual(nums('Start 7:05 PM'), [['7:05 PM', 1145, null, 'time']]);
    // Apple Watch stopwatch time with hundredths: one time, not a time plus a "05".
    const stopwatch = parseLine('19:39.05').numbers;
    assert.deepEqual(
      stopwatch.map((n) => [n.rawText, n.value, n.fraction]),
      [['19:39.05', 1179, 0.05]],
    );
  });

  it('reads Apple Watch paces with minute and second marks', () => {
    const pace = (t: string) => parseLine(t).numbers.map((n) => [n.rawText, n.value, n.unit, n.kind]);
    assert.deepEqual(pace(`8'37" AVERAGE PACE`), [[`8'37"`, 517, 'pace', 'time']]);
    assert.deepEqual(pace(`856" CURRENT PACE`), [[`856"`, 536, 'pace', 'time']]); // apostrophe lost
    assert.deepEqual(pace(`9'00'`), [[`9'00'`, 540, 'pace', 'time']]);
    assert.deepEqual(pace(`5'21"/KM`), [[`5'21"/KM`, 321, '/km', 'time']]);
    assert.deepEqual(pace(`2'07"/100M`), [[`2'07"/100M`, 127, '/100m', 'time']]);
    assert.deepEqual(pace(`8'75"`), [
      ['8', 8, null, 'integer'],
      ['75', 75, null, 'integer'],
    ]); // no such pace: left as plain numbers
  });

  it('reads Apple Watch style values without spaces', () => {
    assert.deepEqual(nums('7.24KM'), [['7.24KM', 7.24, 'km', 'measurement']]);
    assert.deepEqual(nums('252CAL'), [['252CAL', 252, 'kcal', 'measurement']]);
    assert.deepEqual(nums('142BPM'), [['142BPM', 142, 'bpm', 'measurement']]);
  });

  it('handles thousands and decimal separators', () => {
    assert.deepEqual(parseLocaleNumber('1,234'), { value: 1234, decimals: false });
    assert.deepEqual(parseLocaleNumber('1.234,56'), { value: 1234.56, decimals: true });
    assert.deepEqual(parseLocaleNumber('1,234.56'), { value: 1234.56, decimals: true });
    assert.deepEqual(parseLocaleNumber('12.345.678'), { value: 12345678, decimals: false });
    assert.deepEqual(parseLocaleNumber('0,750'), { value: 0.75, decimals: true });
    assert.equal(parseLocaleNumber('1.2.3'), null);
    assert.deepEqual(nums('Steps 10,452'), [['10,452', 10452, null, 'integer']]);
  });

  it('does not invent numbers from words, codes and ranges', () => {
    assert.deepEqual(nums('Model A1 v2 COVID19'), []);
    assert.deepEqual(nums('Sets 10-15'), [
      ['10', 10, null, 'integer'],
      ['15', 15, null, 'integer'],
    ]);
    assert.deepEqual(nums('5 sets'), [['5', 5, null, 'integer']]);
    assert.deepEqual(nums('99:99'), [
      ['99', 99, null, 'integer'],
      ['99', 99, null, 'integer'],
    ]);
  });

  it('finds dates and keeps them out of the numbers', () => {
    const at = (text: string) => parseLine(text).dates.map((d) => [d.rawText, d.iso]);
    assert.deepEqual(at('Date: 2026-10-02'), [['2026-10-02', '2026-10-02']]);
    assert.deepEqual(at('02.10.2026'), [['02.10.2026', '2026-10-02']]);
    assert.deepEqual(at('Wed, Sep 30'), [['Sep 30', null]]);
    assert.deepEqual(at('3 October 2026'), [['3 October 2026', '2026-10-03']]);
    assert.deepEqual(at('25/12/2026 and 12/25/2026'), [
      ['25/12/2026', '2026-12-25'],
      ['12/25/2026', '2026-12-25'],
    ]);
    assert.deepEqual(at('03/04/2026'), [['03/04/2026', null]]); // ambiguous: not guessed
    assert.deepEqual(at('31.02.2026'), []); // no such day
    assert.deepEqual(parseLine('Date: 2026-10-02').numbers, []);
  });

  it('parses many lines in order with their own confidence', () => {
    const r = parseLines([
      { text: 'Weight: 72.4 kg', confidence: 0.97 },
      { text: 'Height: 180 cm', confidence: 0.5 },
      { text: 'Score: 87', confidence: null },
    ]);
    assert.deepEqual(
      r.numbers.map((n) => [n.rawText, n.confidence]),
      [
        ['72.4 kg', 0.97],
        ['180 cm', 0.5],
        ['87', null],
      ],
    );
  });
});
