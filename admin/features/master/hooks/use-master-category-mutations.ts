import { useMutation } from '@admin/lib/query';
import { masterService } from '../services/master.service';
import type { MasterCategoryInput } from '../types/master.types';

export function useCreateMasterCategoryMutation() {
  return useMutation({
    mutationFn: (input: MasterCategoryInput) => masterService.createCategory(input),
  });
}

export function useUpdateMasterCategoryMutation() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MasterCategoryInput> }) => masterService.updateCategory(id, input),
  });
}

export function useDeleteMasterCategoryMutation() {
  return useMutation({
    mutationFn: (id: string) => masterService.deleteCategory(id),
  });
}
