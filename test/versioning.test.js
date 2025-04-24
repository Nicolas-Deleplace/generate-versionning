import { describe, test, expect } from 'vitest';
import { generateVersionAndBuild } from '../lib/versioning.js';
import { mockTag } from './utils.js';

function todayStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function yesterdayStr() {
  const yesterday = new Date(Date.now() - 86400000);
  return yesterday.toISOString().slice(0, 10).replace(/-/g, '');
}

describe('Versioning logic (prefix-auto-vX.Y.Z-BUILD)', () => {
  test('Sequential Increment', () => {
    const tags = [mockTag('2.0.0', '1'), mockTag('2.0.0', '2')];
    const result = generateVersionAndBuild(tags, 'patch', 'sequential', false, '');
    expect(result.nextVersion).toBe('2.0.1');
    expect(result.nextBuildNumber).toBe('3');
    expect(result.oldTag).toBe('auto-v2.0.0-1');
    expect(result.currentTag).toBe('auto-v2.0.0-2');
    expect(result.newTag).toBe('auto-v2.0.1-3');
  });

  test('Build Reinit', () => {
    const tags = [mockTag('2.0.1', '5'), mockTag('2.0.1', '6')];
    const result = generateVersionAndBuild(tags, 'patch', 'sequential', true, '');
    expect(result.nextBuildNumber).toBe('1');
    expect(result.oldTag).toBe('auto-v2.0.1-5');
    expect(result.currentTag).toBe('auto-v2.0.1-6');
    expect(result.newTag).toBe('auto-v2.0.2-1');
  });

  test('Date-Based Build', () => {
    const today = todayStr();
    const tags = [mockTag('2.0.0', `${today}01`), mockTag('2.0.0', `${today}02`)];
    const result = generateVersionAndBuild(tags, 'patch', 'date', false, '');
    expect(result.nextBuildNumber).toBe(`${today}03`);
    expect(result.oldTag).toBe(`auto-v2.0.0-${today}01`);
    expect(result.currentTag).toBe(`auto-v2.0.0-${today}02`);
    expect(result.newTag).toBe(`auto-v2.0.1-${today}03`);
  });

  test('Date Build Resets on New Day', () => {
    const today = todayStr();
    const yesterday = yesterdayStr();
    const tags = [mockTag('2.0.0', `${yesterday}05`), mockTag('2.0.0', `${yesterday}06`)];
    const result = generateVersionAndBuild(tags, 'patch', 'date', false, '');
    expect(result.nextBuildNumber).toBe(`${today}01`);
    expect(result.newTag).toBe(`auto-v2.0.1-${today}01`);
    expect(result.currentTag).toBe(`auto-v2.0.0-${yesterday}06`);
    expect(result.oldTag).toBe(`auto-v2.0.0-${yesterday}05`);
  });

  test('Date With Two Days', () => {
    const today = todayStr();
    const yesterday = yesterdayStr();
    const tags = [mockTag('2.0.0', `${yesterday}05`), mockTag('2.0.1', `${today}01`)];
    const result = generateVersionAndBuild(tags, 'patch', 'date', false, '');
    expect(result.nextBuildNumber).toBe(`${today}02`);
    expect(result.newTag).toBe(`auto-v2.0.2-${today}02`);
    expect(result.currentTag).toBe(`auto-v2.0.1-${today}01`);
    expect(result.oldTag).toBe(`auto-v2.0.0-${yesterday}05`);
  });

  test('No Change', () => {
    const tags = [mockTag('2.5.0', '9'), mockTag('2.5.0', '10')];
    const result = generateVersionAndBuild(tags, 'no change', 'sequential', false, '');
    expect(result.nextVersion).toBe('2.5.0');
    expect(result.nextBuildNumber).toBe('10');
    expect(result.oldTag).toBe('auto-v2.5.0-9');
    expect(result.currentTag).toBe('auto-v2.5.0-10');
    expect(result.newTag).toBe(null);
  });

  test('Build Number Only', () => {
    const tags = [mockTag('3.2.1', '10')];
    const result = generateVersionAndBuild(tags, 'build number only', 'sequential', false, '');
    expect(result.nextVersion).toBe('3.2.1');
    expect(result.nextBuildNumber).toBe('11');
    expect(result.newTag).toBe('auto-v3.2.1-11');
  });

  test('Semver Increments', () => {
    const cases = [
      { version: '3.4.5', increment: 'patch', expected: '3.4.6' },
      { version: '3.4.5', increment: 'bug', expected: '3.4.6' },
      { version: '3.4.5', increment: 'minor', expected: '3.5.0' },
      { version: '3.4.5', increment: 'feature', expected: '3.5.0' },
      { version: '3.4.5', increment: 'major', expected: '4.0.0' },
      { version: '3.4.5', increment: 'no change', expected: '3.4.5' },
      { version: '3.4.5', increment: 'unknown', expected: '3.4.5' },
    ];

    for (const { version, increment, expected } of cases) {
      const tag = mockTag(version, '10');
      const result = generateVersionAndBuild([tag], increment, 'sequential', false, '');
      expect(result.nextVersion).toBe(expected);
      expect(result.currentTag).toBe(`auto-v${version}-10`);
    }
  });
});

describe('Versioning logic (no prefix, just auto-vX.Y.Z-BUILD)', () => {
    test('Sequential Increment with default prefix', () => {
      const tags = [
        { ref: 'refs/tags/auto-v1.0.0-1' },
        { ref: 'refs/tags/auto-v1.0.0-2' },
      ];
      const result = generateVersionAndBuild(tags, 'patch', 'sequential', false, '');
      expect(result.currentTag).toBe('auto-v1.0.0-2');
      expect(result.newTag).toBe('auto-v1.0.1-3');
      expect(result.oldTag).toBe('auto-v1.0.0-1');
    });
  
    test('Build Number Only with default prefix', () => {
      const tags = [
        { ref: 'refs/tags/auto-v2.1.0-4' }
      ];
      const result = generateVersionAndBuild(tags, 'build number only', 'sequential', false, '');
      expect(result.nextVersion).toBe('2.1.0');
      expect(result.nextBuildNumber).toBe('5');
      expect(result.newTag).toBe('auto-v2.1.0-5');
    });

    test('Date Build Number', () => {
      const tags = [
        { ref: 'refs/tags/auto-v0.1.0-2025042501' },
        { ref: 'refs/tags/auto-v0.0.0-2025042501' }
      ];
      const result = generateVersionAndBuild(tags, 'minor', 'date', false, '');
      const today = todayStr();
      expect(result.nextVersion).toBe('0.2.0');
      expect(result.nextBuildNumber).toBe(`${today}02`);
      expect(result.newTag).toBe(`auto-v0.2.0-${today}02`);
    });
    
    test('No Change with default prefix', () => {
      const tags = [
        { ref: 'refs/tags/auto-v3.0.0-5' }
      ];
      const result = generateVersionAndBuild(tags, 'no change', 'sequential', false, '');
      expect(result.nextVersion).toBe('3.0.0');
      expect(result.nextBuildNumber).toBe('5');
      expect(result.newTag).toBe(null);
    });
});
  
describe('Edge case', () => { 
  test('Single tag present', () => {
    const tags = [mockTag('1.0.0', '5')];
    const result = generateVersionAndBuild(tags, 'patch', 'sequential', false, '');
  
    expect(result.currentTag).toBe('auto-v1.0.0-5');
    expect(result.oldTag).toBe(null);
    expect(result.nextVersion).toBe('1.0.1');
    expect(result.nextBuildNumber).toBe('6');
    expect(result.newTag).toBe('auto-v1.0.1-6');
  });

  test('No tags present', () => {
    const tags = [];
    const result = generateVersionAndBuild(tags, 'patch', 'sequential', false, '');
  
    expect(result.currentTag).toBe(null);
    expect(result.oldTag).toBe(null);
    expect(result.nextVersion).toBe('0.0.1');
    expect(result.nextBuildNumber).toBe('1');
    expect(result.newTag).toBe('auto-v0.0.1-1');
  });
})
