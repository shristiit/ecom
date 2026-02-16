import { useMutation } from '@/lib/query';
import { settingsService } from '../services/settings.service';
import type { SettingsAlertRule } from '../types/settings.types';

export function useUpsertSettingsAlertMutation() {
  return useMutation({
    mutationFn: (rule: SettingsAlertRule) => settingsService.upsertAlert(rule),
  });
}

export function useDeleteSettingsAlertMutation() {
  return useMutation({
    mutationFn: (id: string) => settingsService.deleteAlert(id),
  });
}
