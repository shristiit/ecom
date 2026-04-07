import { useMutation } from '@admin/lib/query';
import { masterService } from '../services/master.service';
import type { MasterPartyInput } from '../types/master.types';

export function useCreateMasterCustomerMutation() {
  return useMutation({
    mutationFn: (input: MasterPartyInput) => masterService.createCustomer(input),
  });
}

export function useUpdateMasterCustomerMutation() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MasterPartyInput> }) => masterService.updateCustomer(id, input),
  });
}

export function useDeleteMasterCustomerMutation() {
  return useMutation({
    mutationFn: (id: string) => masterService.deleteCustomer(id),
  });
}
