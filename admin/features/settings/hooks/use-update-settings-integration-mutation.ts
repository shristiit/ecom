import { useMutation } from '@/lib/query';
import { settingsService } from '../services/settings.service';
import type { SettingsIntegration } from '../types/settings.types';

export function useUpdateSettingsIntegrationMutation() {
  return useMutation({
    mutationFn: ({ key, patch }: { key: SettingsIntegration['key']; patch: Partial<SettingsIntegration> }) =>
      settingsService.updateIntegration(key, patch),
  });
}
