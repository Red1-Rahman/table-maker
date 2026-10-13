import { describe, expect, it } from 'vitest';
import { normalizeKey } from '@/core/input/keyNormalizer';

describe('keyNormalizer', () => {
  it('maps Cmd (mac) and Ctrl (win/linux) to primary', () => {
    expect(normalizeKey({ key: 'z', metaKey: true }, true).primary).toBe(true);
    expect(normalizeKey({ key: 'z', ctrlKey: true }, true).primary).toBe(false);
    expect(normalizeKey({ key: 'z', ctrlKey: true }, false).primary).toBe(true);
    expect(normalizeKey({ key: 'z', metaKey: true }, false).primary).toBe(false);
    expect(normalizeKey({ key: 'Z', ctrlKey: true, shiftKey: true }, false)).toMatchObject({ primary: true, shift: true, letter: 'z' });
  });
  it('maps Backspace and Delete to Clear', () => {
    expect(normalizeKey({ key: 'Backspace' }, true).key).toBe('Clear');
    expect(normalizeKey({ key: 'Delete' }, false).key).toBe('Clear');
    expect(normalizeKey({ key: 'Unidentified', keyCode: 0x08 }, false).key).toBe('Clear');
  });
  it('printable characters', () => {
    expect(normalizeKey({ key: 'a' }, false)).toMatchObject({ key: 'Char', char: 'a' });
    expect(normalizeKey({ key: 'a', ctrlKey: true }, false).key).toBe('Other');
  });
});
