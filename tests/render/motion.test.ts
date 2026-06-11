import { describe, it, expect } from 'vitest';
import { resolveMotion, type MotionPreset } from '../../src/render/motion.ts';

// Real motion strings from caso-ejemplo.ts
const casoEjemploCases: Array<{ input: string; expected: MotionPreset }> = [
  { input: 'zoom-in lento sobre la ciudad', expected: 'zoom-in' },
  { input: 'paneo sobre la calle', expected: 'pan-left' },
  { input: 'shake sutil', expected: 'shake' },
  { input: 'escala rápida + shake', expected: 'zoom-in' }, // zoom matches first
  { input: 'paneo siguiendo la huida', expected: 'pan-left' },
  { input: 'paneo del flujo descendente', expected: 'pan-left' },
  { input: 'deriva lenta sobre la ceniza', expected: 'pan-slow' },
  { input: 'zoom-in al hallazgo', expected: 'zoom-in' },
  { input: 'zoom-out final', expected: 'zoom-out' },
];

describe('resolveMotion', () => {
  describe('caso-ejemplo real strings', () => {
    for (const { input, expected } of casoEjemploCases) {
      it(`maps "${input}" → "${expected}"`, () => {
        expect(resolveMotion(input)).toBe(expected);
      });
    }
  });

  describe('keyword matching', () => {
    it('zoom-out must match before zoom', () => {
      expect(resolveMotion('zoom-out')).toBe('zoom-out');
    });

    it('matches zoom-in (explicit)', () => {
      expect(resolveMotion('zoom-in')).toBe('zoom-in');
    });

    it('matches pan keyword', () => {
      expect(resolveMotion('pan right')).toBe('pan-left');
    });

    it('matches shake keyword', () => {
      expect(resolveMotion('shake moderado')).toBe('shake');
    });

    it('matches deriva keyword', () => {
      expect(resolveMotion('deriva suave')).toBe('pan-slow');
    });

    it('matches drift keyword', () => {
      expect(resolveMotion('drift slowly')).toBe('pan-slow');
    });
  });

  describe('case insensitive', () => {
    it('uppercase ZOOM maps to zoom-in', () => {
      expect(resolveMotion('ZOOM into scene')).toBe('zoom-in');
    });

    it('mixed case Shake maps to shake', () => {
      expect(resolveMotion('Shake camera')).toBe('shake');
    });
  });

  describe('fallback to static', () => {
    it('empty string → static', () => {
      expect(resolveMotion('')).toBe('static');
    });

    it('unknown keyword → static', () => {
      expect(resolveMotion('rotate clockwise')).toBe('static');
    });

    it('whitespace only → static', () => {
      expect(resolveMotion('   ')).toBe('static');
    });
  });
});
