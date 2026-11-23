import { describe, expect, spyOn, test } from 'bun:test';
import { buildVoiceDebugFilename } from '../helpers';

// new Date(y, m, d, ...) builds from local time fields, so the fixtures and the
// expected names hold in whatever timezone the suite runs
const withFixedNow = (now: number, run: () => void) => {
  const nowSpy = spyOn(Date, 'now').mockReturnValue(now);

  try {
    run();
  } finally {
    nowSpy.mockRestore();
  }
};

describe('buildVoiceDebugFilename', () => {
  test('should pad single digit fields', () => {
    const capturedAt = new Date(2026, 2, 7, 8, 9, 5).getTime();

    expect(buildVoiceDebugFilename(capturedAt)).toBe(
      'sharkord-voice-diagnostics-2026-03-07_08-09-05.json'
    );
  });

  test('should keep double digit fields as they are', () => {
    const capturedAt = new Date(2026, 11, 25, 14, 30, 45).getTime();

    expect(buildVoiceDebugFilename(capturedAt)).toBe(
      'sharkord-voice-diagnostics-2026-12-25_14-30-45.json'
    );
  });

  test('should only contain characters that are safe on every platform', () => {
    const filename = buildVoiceDebugFilename(
      new Date(2026, 2, 7, 8, 9, 5).getTime()
    );

    expect(filename).toMatch(
      /^sharkord-voice-diagnostics-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/
    );
    expect(filename).not.toMatch(/[\s:/\\]/);
  });

  test('should fall back to the current time without an argument', () => {
    withFixedNow(new Date(2026, 2, 7, 8, 9, 5).getTime(), () => {
      expect(buildVoiceDebugFilename()).toBe(
        'sharkord-voice-diagnostics-2026-03-07_08-09-05.json'
      );
    });
  });

  test('should fall back to the current time for a non finite timestamp', () => {
    withFixedNow(new Date(2026, 11, 25, 14, 30, 45).getTime(), () => {
      expect(buildVoiceDebugFilename(Number.NaN)).toBe(
        'sharkord-voice-diagnostics-2026-12-25_14-30-45.json'
      );
      expect(buildVoiceDebugFilename(Number.POSITIVE_INFINITY)).toBe(
        'sharkord-voice-diagnostics-2026-12-25_14-30-45.json'
      );
    });
  });
});
