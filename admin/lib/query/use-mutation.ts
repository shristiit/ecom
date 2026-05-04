import { useCallback, useState } from 'react';
import { ApiError } from '@admin/lib/api';
import type { MutationState } from './types';
import { queryClient } from './query-client';
import type { QueryKey } from './types';

type UseMutationOptions<TPayload, TResult> = {
  mutationFn: (payload: TPayload) => Promise<TResult>;
  onSuccess?: (result: TResult, payload: TPayload) => void;
  onError?: (error: ApiError, payload: TPayload) => void;
  invalidateAll?: boolean;
  invalidateKeys?: QueryKey[] | ((result: TResult, payload: TPayload) => QueryKey[]);
  invalidatePrefixes?: QueryKey[] | ((result: TResult, payload: TPayload) => QueryKey[]);
};

export function useMutation<TPayload, TResult>({
  mutationFn,
  onSuccess,
  onError,
  invalidateAll = true,
  invalidateKeys,
  invalidatePrefixes,
}: UseMutationOptions<TPayload, TResult>) {
  const [state, setState] = useState<MutationState<TResult>>({
    data: null,
    error: null,
    isPending: false,
    isSuccess: false,
  });

  const mutateAsync = useCallback(
    async (payload: TPayload) => {
      setState({ data: null, error: null, isPending: true, isSuccess: false });

      try {
        const result = await mutationFn(payload);
        setState({ data: result, error: null, isPending: false, isSuccess: true });

        const resolvedInvalidateKeys = typeof invalidateKeys === 'function' ? invalidateKeys(result, payload) : invalidateKeys ?? [];
        const resolvedInvalidatePrefixes =
          typeof invalidatePrefixes === 'function' ? invalidatePrefixes(result, payload) : invalidatePrefixes ?? [];

        if (invalidateAll) {
          queryClient.invalidateAll();
        }
        resolvedInvalidateKeys.forEach((key) => queryClient.invalidateQuery(key));
        resolvedInvalidatePrefixes.forEach((prefix) => queryClient.invalidateQueries(prefix));

        onSuccess?.(result, payload);
        return result;
      } catch (error) {
        const apiError = error instanceof ApiError ? error : new ApiError('Unknown mutation error', 0, 'MUTATION_ERROR', error);
        setState({ data: null, error: apiError, isPending: false, isSuccess: false });
        onError?.(apiError, payload);
        throw apiError;
      }
    },
    [invalidateAll, invalidateKeys, invalidatePrefixes, mutationFn, onError, onSuccess],
  );

  const reset = useCallback(() => {
    setState({ data: null, error: null, isPending: false, isSuccess: false });
  }, []);

  return { ...state, mutateAsync, reset };
}
