import { useMutation } from '@admin/lib/query';
import { usersService } from '../services/users.service';

export function useCreateRoleMutation() {
  return useMutation({
    mutationFn: (input: { name: string; permissions: string[] }) => usersService.createRole(input),
  });
}

export function useUpdateRoleMutation() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; permissions?: string[] } }) =>
      usersService.updateRole(id, input),
  });
}

export function useDeleteRoleMutation() {
  return useMutation({
    mutationFn: (id: string) => usersService.deleteRole(id),
  });
}
