import { useMutation } from '@admin/lib/query';
import { settingsService } from '../services/settings.service';
import type { SettingsWorkflowRule } from '../types/settings.types';

export function useUpsertSettingsWorkflowMutation() {
  return useMutation({
    mutationFn: (rule: SettingsWorkflowRule) => settingsService.upsertWorkflow(rule),
  });
}
