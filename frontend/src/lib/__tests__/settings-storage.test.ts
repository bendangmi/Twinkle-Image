import { beforeEach, describe, expect, it } from 'vitest';
import { loadRegistry } from '@/lib/nova-models';
import { loadJsonFromStorage } from '@/lib/settings-storage';

describe('storage recovery', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('falls back to the initial registry when the saved JSON is invalid', () => {
    localStorage.setItem('nova-model-registry', '{');

    const registry = loadRegistry();

    expect(registry.imageModels.length).toBeGreaterThan(0);
    expect(registry.textModels.length).toBeGreaterThan(0);
  });

  it('falls back to the initial registry when the saved value is not an object', () => {
    localStorage.setItem('nova-model-registry', 'null');

    const registry = loadRegistry();

    expect(registry.imageModels.length).toBeGreaterThan(0);
    expect(registry.textModels.length).toBeGreaterThan(0);
  });

  it('ignores invalid JSON in individual workspace settings', () => {
    localStorage.setItem('nova-assets-settings', '{');

    expect(loadJsonFromStorage('nova-assets-settings')).toEqual({});
  });
});
