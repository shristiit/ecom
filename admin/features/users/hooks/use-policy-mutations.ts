import { useMutation } from '@admin/lib/query';
import { usersService } from '../services/users.service';
import type { Policy } from '../types/users.types';

export function useCreatePolicyMutation() {
  return useMutation({
    mutationFn: (input: { name: string; rules: Policy['rules'] }) => usersService.createPolicy(input),
  });
}

export function useUpdatePolicyMutation() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; rules?: Policy['rules'] } }) =>
      usersService.updatePolicy(id, input),
  });
}

export function useDeletePolicyMutation() {
  return useMutation({
    mutationFn: (id: string) => usersService.deletePolicy(id),
  });
}
