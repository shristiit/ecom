import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import type { QueryKey, QueryState } from './types';

type UseQueryOptions<TData> = {
  key: QueryKey;
  queryFn: () => Promise<TData>;
  enabled?: boolean;
  initialData?: TData | null;
};

export function useQuery<TData>({ key, queryFn, enabled = true, initialData = null }: UseQueryOptions<TData>) {
  const [state, setState] = useState<QueryState<TData>>({
    data: initialData,
    error: null,
    status: enabled ? 'loading' : 'idle',
    isLoading: enabled,
    isFetching: enabled,
  });

  const stableKey = useMemo(() => JSON.stringify(key), [key]);

  const runQuery = useCallback(async () => {
    if (!enabled) {
      setState((prev) => ({ ...prev, status: 'idle', isLoading: false, isFetching: false }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isLoading: prev.data === null,
      isFetching: true,
      status: prev.data === null ? 'loading' : prev.status,
    }));

    try {
      const data = await queryFn();
      setState({ data, error: null, status: 'success', isLoading: false, isFetching: false });
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError('Unknown query error', 0, 'QUERY_ERROR', error);
      setState((prev) => ({ ...prev, error: apiError, status: 'error', isLoading: false, isFetching: false }));
    }
  }, [enabled, queryFn]);

  useEffect(() => {
    void runQuery();
  }, [stableKey, runQuery]);

  return {
    ...state,
    refetch: runQuery,
    setData: (nextData: TData | null) => {
      setState((prev) => ({ ...prev, data: nextData }));
    },
  };
}
