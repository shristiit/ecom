import { useMutation } from '@admin/lib/query';
import { masterService } from '../services/master.service';
import type { MasterLocationInput } from '../types/master.types';

export function useCreateMasterLocationMutation() {
  return useMutation({
    mutationFn: (input: MasterLocationInput) => masterService.createLocation(input),
  });
}

export function useUpdateMasterLocationMutation() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MasterLocationInput> }) => masterService.updateLocation(id, input),
  });
}

export function useDeleteMasterLocationMutation() {
  return useMutation({
    mutationFn: (id: string) => masterService.deleteLocation(id),
  });
}
