import { useMutation } from '@/lib/query';
import { settingsService } from '../services/settings.service';
import type { SettingsProfile } from '../types/settings.types';

export function useSaveSettingsProfileMutation() {
  return useMutation({
    mutationFn: (profile: SettingsProfile) => settingsService.saveProfile(profile),
  });
}
