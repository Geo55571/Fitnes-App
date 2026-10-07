/**
 * Reference workout icons (32×32 masks, hex) for icons.ts, one bit per pixel, row by row. Made from
 * Apple's own Apple Watch and Fitness app screenshots (support.apple.com user guides) and a user's
 * photo: the watch badges with findIconGlyph(), the Fitness app's bare icons by their lime colour,
 * both through normalize(). To add a workout type, do the same with a clear image of its icon.
 */
import type { ScanActivity } from '@/domain/workoutScan';

export const ICON_TEMPLATES: { activity: ScanActivity; source: string; mask: string }[] = [
  {
    activity: 'running',
    source: 'Apple Watch, Outdoor Run (Pacer view)',
    mask: '00000000000078000000fc000000fe000000fe000000fc000000f8000007f00000ffe00000fff00000fff80000e7f86001effdf001effff001effff001cfcf80000fc600000fe000001ff000001ffc00003cfe00003c3e00007c3e00007cfe0000f9f80000f9f00003f1e00007e0c0000fc000000f8000000f00000000000000',
  },
  {
    activity: 'running',
    source: 'Apple Watch, Outdoor Run (Heart Rate Zones view)',
    mask: '00000000000078000000fc000000fc000000fc000000fc000000f8000007f00000ffe00000fff00000fff80000e7f86001effdf001effff001efffe001efcf80000fc600000fe000001ff000001ffc00003cfe00003c3e00007c3e00007cfe0000f9f80000f9f00003f1e00007e0c0000fc000000f8000000f00000000000000',
  },
  {
    activity: 'running',
    source: 'Apple Watch, Indoor Run start screen',
    mask: '00000000000180000007c0000007e0000007e0000007e0000003c00000fe000003ff800003ff800003ffc60003bfff0003bfff1e03bffc3e03be71fc003f01f0007fc1f000ffe07000f3f07000f1f07000e3e06003e7c06003ef80e00fcf00e00f8000e01f0000c01e0000000c7ffff07ffffff07ffffff07fffffc000000000',
  },
  {
    activity: 'cycling',
    source: 'Apple Watch, Outdoor Cycle',
    mask: '00000000000000000000000000000000000001c0000003e0001ff7e0003ffff0007fffe0007ffbe0007ff980007e7800003e3800001f3fc00fefffc01ff7ff983ffbc01c7c7ff81e701ff81e701ff80e601ff80e601ff80e701ff80e701c381e7c7c3e3e3ff81ffc1ff00ff80fc007e000000000000000000000000000000000',
  },
  {
    activity: 'swimming',
    source: 'Apple Watch, Pool Swim (user photo)',
    mask: '000000000000000000000000000000000000000000000000000000000078000001fc1e0003ff3f0007ffff800fffff800fffff800fdfff800fbfff80007fff00007ff0000ffffc1e3ffffffefffffffefffffffe7d7fbff01df3fe7e1d7ffffe000c018000000000000000000000000000000000000000000000000000000000',
  },
  {
    activity: 'walking',
    source: 'Fitness app, Outdoor Walk',
    mask: '000000000003e0000007e0000007f0000007f0000007e0000003c00000018000000f8000001fc000003fc00000fff00000fff80001ffffc001efffc001cfdfc001cfc00001cfc00001cf8000000f80000007c000001fe000001fe000001ef000003cf000003c780000f8780001f87c0001f03c0003e03c0001c01c0000000000',
  },
  {
    activity: 'rowing',
    source: 'Fitness app, Outdoor Rowing',
    mask: '00000000007c000000fe000000fe000000fe000000fe0000007c000000100000007fff8001ffffc003ffffc007ffff8007e0070007e19e0007e7de000ffffc000ffffe001fffff001fffffe01ff9dfe01fe383e0078700e0000f0000001c00001f9ffff83ffffffc007000000000000003fc3fc01ffffffc1f0ff0fc00000000',
  },
  {
    activity: 'strength_training',
    source: 'Fitness app, Functional Strength Training',
    mask: '000000000003f0000007f0000007f8000007f0000007f0000001f000000000000003e000000ff000001ff000007ff00000fff00000fff00000fff00000fff000003ff000001ff0000007fc000007ffe00007fff00007fff0000ffff0000f80f0000f80f0001f00f001ff00f007fe00f00ffe00f00ff800f00f0000f000000000',
  },
];
