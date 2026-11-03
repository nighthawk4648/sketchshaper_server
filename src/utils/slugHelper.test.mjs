import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSlug } from './slugHelper.mjs';

describe('sanitizeSlug utility', () => {
  it('preserves numbers including trailing year/version (e.g. sketchup-2024)', () => {
    assert.equal(sanitizeSlug('sketchup-2024'), 'sketchup-2024');
    assert.equal(sanitizeSlug('vray-6-update-2'), 'vray-6-update-2');
    assert.equal(sanitizeSlug('asset-007'), 'asset-007');
  });

  it('converts uppercase to lowercase and converts spaces to hyphens', () => {
    assert.equal(sanitizeSlug('Living Room Furniture'), 'living-room-furniture');
    assert.equal(sanitizeSlug('  HELLO   WORLD  '), 'hello-world');
  });

  it('removes special characters and symbols', () => {
    assert.equal(sanitizeSlug('Modern Sofa (3D Model)! #1'), 'modern-sofa-3d-model-1');
    assert.equal(sanitizeSlug('Best 10 Tips & Tricks @2025'), 'best-10-tips-tricks-2025');
  });

  it('trims leading and trailing hyphens', () => {
    assert.equal(sanitizeSlug('---hello-world---'), 'hello-world');
    assert.equal(sanitizeSlug('---'), null);
  });

  it('falls back to fallbackText when rawSlug is empty, null, or undefined', () => {
    assert.equal(sanitizeSlug('', 'Fallback Title 101'), 'fallback-title-101');
    assert.equal(sanitizeSlug(null, 'Category Name'), 'category-name');
    assert.equal(sanitizeSlug(undefined, 'Sub Category'), 'sub-category');
    assert.equal(sanitizeSlug('   ', 'Another Title'), 'another-title');
  });

  it('prioritizes valid rawSlug over fallbackText', () => {
    assert.equal(sanitizeSlug('custom-slug', 'Default Name'), 'custom-slug');
  });

  it('returns null when both rawSlug and fallbackText contain no alphanumeric characters', () => {
    assert.equal(sanitizeSlug('***', '$$$'), null);
    assert.equal(sanitizeSlug('', ''), null);
    assert.equal(sanitizeSlug(null, null), null);
  });
});

