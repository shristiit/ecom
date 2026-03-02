import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import type { QueryKey, QueryState } from './types';

type UseQueryOptions<TData> = {
  key: QueryKey;
  queryFn: () => Promise<TData>;
  enabled?: boolean;
  initialData?: TData | null;
  retry?: number;
  retryDelayMs?: number;
};

export function useQuery<TData>({
  key,
  queryFn,
  enabled = true,
  initialData = null,
  retry = 1,
  retryDelayMs = 250,
}: UseQueryOptions<TData>) {
  const queryFnRef = useRef(queryFn);
  const [state, setState] = useState<QueryState<TData>>({
    data: initialData,
    error: null,
    status: enabled ? 'loading' : 'idle',
    isLoading: enabled,
    isFetching: enabled,
  });

  const stableKey = useMemo(() => JSON.stringify(key), [key]);

  useEffect(() => {
    queryFnRef.current = queryFn;
  }, [queryFn]);

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

    let lastError: ApiError | null = null;
    for (let attempt = 0; attempt <= retry; attempt += 1) {
      try {
        const data = await queryFnRef.current();
        setState({ data, error: null, status: 'success', isLoading: false, isFetching: false });
        return;
      } catch (error) {
        lastError = error instanceof ApiError ? error : new ApiError('Unknown query error', 0, 'QUERY_ERROR', error);
        if (attempt < retry) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }
    setState((prev) => ({
      ...prev,
      error: lastError ?? new ApiError('Unknown query error', 0, 'QUERY_ERROR'),
      status: 'error',
      isLoading: false,
      isFetching: false,
    }));
  }, [enabled, retry, retryDelayMs]);

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
