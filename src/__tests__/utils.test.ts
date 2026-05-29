import { describe, it, expect, beforeEach } from 'vitest';
import { generateRoomCode, formatTime, getUserName, setUserName, getClientId } from '../utils';

describe('generateRoomCode', () => {
  it('returns a 6-character string', () => {
    expect(generateRoomCode()).toHaveLength(6);
  });

  it('only uses unambiguous characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRoomCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 100 }, generateRoomCode));
    expect(codes.size).toBeGreaterThan(90);
  });
});

describe('formatTime', () => {
  it('formats zero as 0:00', () => expect(formatTime(0)).toBe('0:00'));
  it('formats 30 seconds', () => expect(formatTime(30_000)).toBe('0:30'));
  it('formats 1 minute 30 seconds', () => expect(formatTime(90_000)).toBe('1:30'));
  it('clamps negative values to 0:00', () => expect(formatTime(-5_000)).toBe('0:00'));
  it('rounds a partial second up', () => expect(formatTime(500)).toBe('0:01'));
  it('formats exactly 5 minutes', () => expect(formatTime(300_000)).toBe('5:00'));
});

describe('getUserName / setUserName', () => {
  beforeEach(() => localStorage.clear());

  it('returns empty string when not set', () => expect(getUserName()).toBe(''));
  it('returns the stored name', () => { setUserName('Alice'); expect(getUserName()).toBe('Alice'); });
  it('trims whitespace on set', () => { setUserName('  Bob  '); expect(getUserName()).toBe('Bob'); });
});

describe('getClientId', () => {
  beforeEach(() => localStorage.clear());

  it('creates an ID on first call', () => {
    expect(getClientId()).toMatch(/^c_[a-z0-9]+$/);
  });

  it('returns the same ID on subsequent calls', () => {
    expect(getClientId()).toBe(getClientId());
  });
});
