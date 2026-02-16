import { useMutation } from '@/lib/query';
import { usersService } from '../services/users.service';

export function useResetUserPasswordMutation() {
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) => usersService.resetUserPassword(id, newPassword),
  });
}
