import { useMutation } from '@admin/lib/query';
import { settingsService } from '../services/settings.service';
import type { SettingsNumbering } from '../types/settings.types';

export function useSaveSettingsNumberingMutation() {
  return useMutation({
    mutationFn: (numbering: SettingsNumbering) => settingsService.saveNumbering(numbering),
  });
}
