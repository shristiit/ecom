import { useCallback, useState } from 'react';
import { ApiError } from '@/lib/api';
import type { MutationState } from './types';

type UseMutationOptions<TPayload, TResult> = {
  mutationFn: (payload: TPayload) => Promise<TResult>;
  onSuccess?: (result: TResult, payload: TPayload) => void;
  onError?: (error: ApiError, payload: TPayload) => void;
};

export function useMutation<TPayload, TResult>({ mutationFn, onSuccess, onError }: UseMutationOptions<TPayload, TResult>) {
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
        onSuccess?.(result, payload);
        return result;
      } catch (error) {
        const apiError = error instanceof ApiError ? error : new ApiError('Unknown mutation error', 0, 'MUTATION_ERROR', error);
        setState({ data: null, error: apiError, isPending: false, isSuccess: false });
        onError?.(apiError, payload);
        throw apiError;
      }
    },
    [mutationFn, onError, onSuccess],
  );

  const reset = useCallback(() => {
    setState({ data: null, error: null, isPending: false, isSuccess: false });
  }, []);

  return { ...state, mutateAsync, reset };
}
