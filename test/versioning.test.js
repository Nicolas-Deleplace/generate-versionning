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
      const today = todayStr();
      const tags = [
        { ref: `refs/tags/auto-v0.1.0-${today}01` },
        { ref: `refs/tags/auto-v0.0.0-${today}01` }
      ];
      const result = generateVersionAndBuild(tags, 'minor', 'date', false, '');
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
  
describe('Shared build number across prefixes', () => {
  test('Prod run sees staging tags when computing the next build', () => {
    const scoped = [mockTag('1.0.0', '5')];
    const all = [
      mockTag('1.0.0', '5'),
      mockTag('1.0.0', '6', 'staging'),
      mockTag('1.0.0', '7', 'staging'),
    ];
    const result = generateVersionAndBuild(scoped, 'patch', 'sequential', false, '', all);
    expect(result.nextBuildNumber).toBe('8');
    expect(result.newTag).toBe('auto-v1.0.1-8');
    expect(result.currentTag).toBe('auto-v1.0.0-5');
    expect(result.oldTag).toBe(null);
  });

  test('Staging run bumps from the global max even when its own pool is empty', () => {
    const scoped = [];
    const all = [mockTag('2.0.0', '12'), mockTag('2.0.0', '13')];
    const result = generateVersionAndBuild(scoped, 'patch', 'sequential', false, 'staging', all);
    expect(result.nextBuildNumber).toBe('14');
    expect(result.newTag).toBe('staging-auto-v0.0.1-14');
  });

  test('Date mode counts today builds across prefixes', () => {
    const today = todayStr();
    const scoped = [mockTag('1.0.0', `${today}01`)];
    const all = [
      mockTag('1.0.0', `${today}01`),
      mockTag('1.0.0', `${today}02`, 'staging'),
      mockTag('1.0.0', `${today}03`, 'staging'),
    ];
    const result = generateVersionAndBuild(scoped, 'patch', 'date', false, '', all);
    expect(result.nextBuildNumber).toBe(`${today}04`);
    expect(result.newTag).toBe(`auto-v1.0.1-${today}04`);
  });

  test('build number only reuses the scoped version but the global build', () => {
    const scoped = [mockTag('3.2.1', '4', 'staging')];
    const all = [
      mockTag('3.2.1', '4', 'staging'),
      mockTag('2.0.0', '9'),
    ];
    const result = generateVersionAndBuild(scoped, 'build number only', 'sequential', false, 'staging', all);
    expect(result.nextVersion).toBe('3.2.1');
    expect(result.nextBuildNumber).toBe('10');
    expect(result.newTag).toBe('staging-auto-v3.2.1-10');
  });

  test('Deletion scope stays on the current prefix (oldTag comes from scoped)', () => {
    const scoped = [mockTag('1.0.0', '2', 'staging'), mockTag('1.0.0', '5', 'staging')];
    const all = [
      ...scoped,
      mockTag('1.0.0', '8'),
      mockTag('1.0.0', '9'),
    ];
    const result = generateVersionAndBuild(scoped, 'patch', 'sequential', false, 'staging', all);
    expect(result.currentTag).toBe('staging-auto-v1.0.0-5');
    expect(result.oldTag).toBe('staging-auto-v1.0.0-2');
    expect(result.nextBuildNumber).toBe('10');
    expect(result.newTag).toBe('staging-auto-v1.0.1-10');
  });
});

describe('Increment aliases', () => {
  test('`none` behaves identically to `no change`', () => {
    const tags = [mockTag('1.0.0', '5')];
    const result = generateVersionAndBuild(tags, 'none', 'sequential', false, '');
    expect(result.nextVersion).toBe('1.0.0');
    expect(result.nextBuildNumber).toBe('5');
    expect(result.newTag).toBe(null);
    expect(result.currentTag).toBe('auto-v1.0.0-5');
  });

  test('`build` behaves identically to `build number only`', () => {
    const tags = [mockTag('1.0.0', '5')];
    const result = generateVersionAndBuild(tags, 'build', 'sequential', false, '');
    expect(result.nextVersion).toBe('1.0.0');
    expect(result.nextBuildNumber).toBe('6');
    expect(result.newTag).toBe('auto-v1.0.0-6');
  });
});

describe('Malformed / foreign tags', () => {
  test('Date mode with an empty tag list starts at today01', () => {
    const today = todayStr();
    const result = generateVersionAndBuild([], 'patch', 'date', false, '');
    expect(result.nextBuildNumber).toBe(`${today}01`);
    expect(result.newTag).toBe(`auto-v0.0.1-${today}01`);
    expect(result.currentTag).toBe(null);
    expect(result.oldTag).toBe(null);
  });

  test('Foreign refs mixed with valid auto-v tags are silently ignored', () => {
    const tags = [
      { ref: 'refs/tags/auto-v1.0.0-5' },
      { ref: 'refs/tags/release-2024' },        // unrelated format
      { ref: 'refs/tags/v3.0.0' },              // plain semver tag, not ours
      { ref: 'refs/tags/some-random-tag' },     // arbitrary tag
      { ref: 'refs/tags/auto-v1.0.0' },         // missing build component
      { ref: 'refs/tags/auto-v1.0.0-abc' },     // non-numeric build
    ];
    const result = generateVersionAndBuild(tags, 'patch', 'sequential', false, '');
    expect(result.currentTag).toBe('auto-v1.0.0-5');
    expect(result.nextBuildNumber).toBe('6');
    expect(result.newTag).toBe('auto-v1.0.1-6');
    expect(result.oldTag).toBe(null);
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
