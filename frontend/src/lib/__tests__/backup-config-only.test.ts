import { describe, expect, it } from 'vitest';
import {
  generateBackupFilename,
  shouldSkipDbInConfigOnlyBackup,
  shouldSkipLocalForageStoreInConfigOnlyBackup,
} from '@/lib/backup-utils';

describe('configuration-only backups', () => {
  it('excludes image data but retains workspace and agent state', () => {
    for (const name of ['nova-image-db', 'nova-upload-cache', 'nova-assets-db', 'nova-reverse-db', 'nova-slice-db']) {
      expect(shouldSkipDbInConfigOnlyBackup(name)).toBe(true);
    }
    expect(shouldSkipDbInConfigOnlyBackup('nova-agent-db')).toBe(false);
    expect(shouldSkipLocalForageStoreInConfigOnlyBackup('canvas_image_files')).toBe(true);
    expect(shouldSkipLocalForageStoreInConfigOnlyBackup('canvas_app_state')).toBe(false);
  });

  it('uses Twinkle backup filenames', () => {
    expect(generateBackupFilename(false)).toMatch(/^image-backup-.*\.zip$/);
    expect(generateBackupFilename(true)).toMatch(/^image-config-.*\.zip$/);
  });
});
