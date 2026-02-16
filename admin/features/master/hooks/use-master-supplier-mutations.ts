import { useMutation } from '@/lib/query';
import { masterService } from '../services/master.service';
import type { MasterPartyInput } from '../types/master.types';

export function useCreateMasterSupplierMutation() {
  return useMutation({
    mutationFn: (input: MasterPartyInput) => masterService.createSupplier(input),
  });
}

export function useUpdateMasterSupplierMutation() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MasterPartyInput> }) => masterService.updateSupplier(id, input),
  });
}

export function useDeleteMasterSupplierMutation() {
  return useMutation({
    mutationFn: (id: string) => masterService.deleteSupplier(id),
  });
}
