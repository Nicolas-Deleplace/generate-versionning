import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@actions/core', () => ({
  default: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

import core from '@actions/core';
import { logInfo, logWarning, logError } from '../lib/logger.js';

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logInfo', () => {
    test('forwards a single string argument as-is', () => {
      logInfo('hello');
      expect(core.info).toHaveBeenCalledExactlyOnceWith('hello');
    });

    test('joins multiple arguments with a single space', () => {
      logInfo('Build number:', 42);
      expect(core.info).toHaveBeenCalledExactlyOnceWith('Build number: 42');
    });

    test('JSON-stringifies arrays so they appear as readable JSON', () => {
      logInfo('tags:', ['a', 'b', 'c']);
      expect(core.info).toHaveBeenCalledExactlyOnceWith('tags: ["a","b","c"]');
    });

    test('JSON-stringifies plain objects', () => {
      logInfo('payload:', { key: 'value', n: 1 });
      expect(core.info).toHaveBeenCalledExactlyOnceWith('payload: {"key":"value","n":1}');
    });

    test('stringifies null and undefined explicitly (not "[object Object]")', () => {
      logInfo('x:', null, 'y:', undefined);
      expect(core.info).toHaveBeenCalledExactlyOnceWith('x: null y: undefined');
    });

    test('falls back to String(arg) when JSON.stringify throws (cyclic ref)', () => {
      const cyclic = {};
      cyclic.self = cyclic;

      logInfo('cycle:', cyclic);

      // The cyclic object cannot be JSON-stringified; the logger must not
      // throw and must still log the label part.
      expect(core.info).toHaveBeenCalledOnce();
      const message = core.info.mock.calls[0][0];
      expect(message).toMatch(/^cycle: /);
    });
  });

  describe('logWarning', () => {
    test('routes to core.warning with the same variadic formatting', () => {
      logWarning('tag', 'could not be deleted:', { code: 404 });
      expect(core.warning).toHaveBeenCalledExactlyOnceWith('tag could not be deleted: {"code":404}');
    });
  });

  describe('logError', () => {
    test('routes to core.error with the same variadic formatting', () => {
      logError('boom');
      expect(core.error).toHaveBeenCalledExactlyOnceWith('boom');
    });
  });
});
