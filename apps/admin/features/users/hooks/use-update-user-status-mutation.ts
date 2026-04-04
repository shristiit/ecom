import { useMutation } from '@/lib/query';
import { usersService } from '../services/users.service';

export function useUpdateUserStatusMutation() {
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'disabled' }) =>
      usersService.updateUserStatus(id, status),
  });
}
