import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QueryKey, QueryState, UseQueryOptions } from './types';
import { queryClient } from './query-client';

export function useQuery<TData>({
  key,
  queryFn,
  enabled = true,
  initialData = null,
  retry = 1,
  retryDelayMs = 250,
  persist = true,
  manualInvalidationOnly = true,
  refetchOnWindowFocus = false,
  staleTimeMs = 0,
  gcTimeMs,
}: UseQueryOptions<TData>) {
  const queryFnRef = useRef(queryFn);
  const stableKey = useMemo(() => JSON.stringify(key), [key]);
  const normalizedKey = useMemo<QueryKey>(() => JSON.parse(stableKey) as QueryKey, [stableKey]);

  const getCachedState = useCallback((namespace: string): QueryState<TData> | null => {
    const cached = queryClient.getQueryState<TData>(normalizedKey, namespace);
    if (!cached) {
      return null;
    }

    if (
      gcTimeMs !== undefined &&
      gcTimeMs >= 0 &&
      cached.updatedAt !== null &&
      Date.now() - cached.updatedAt > gcTimeMs
    ) {
      queryClient.removeQueries(normalizedKey, namespace);
      return null;
    }

    return cached;
  }, [gcTimeMs, normalizedKey]);

  const isFresh = useCallback((state: QueryState<TData> | null) => {
    if (!state || staleTimeMs <= 0 || state.updatedAt === null) {
      return false;
    }
    return Date.now() - state.updatedAt <= staleTimeMs;
  }, [staleTimeMs]);

  const [state, setState] = useState<QueryState<TData>>(() => {
    const namespace = queryClient.getNamespace();
    const cached = getCachedState(namespace);
    if (cached) {
      return cached;
    }
    return {
      data: initialData,
      error: null,
      status: enabled && initialData === null ? 'loading' : initialData === null ? 'idle' : 'success',
      isLoading: enabled && initialData === null,
      isFetching: false,
      updatedAt: initialData === null ? null : Date.now(),
    };
  });
  const [activeNamespace, setActiveNamespace] = useState(() => queryClient.getNamespace());

  useEffect(() => {
    queryFnRef.current = queryFn;
  }, [queryFn]);

  const syncFromCache = useCallback((namespace: string) => {
    const cached = getCachedState(namespace);
    if (cached) {
      setState(cached);
      return cached;
    }

    const fallbackState: QueryState<TData> = {
      data: initialData,
      error: null,
      status: enabled && initialData === null ? 'loading' : initialData === null ? 'idle' : 'success',
      isLoading: enabled && initialData === null,
      isFetching: false,
      updatedAt: initialData === null ? null : Date.now(),
    };
    setState(fallbackState);
    return fallbackState;
  }, [enabled, getCachedState, initialData]);

  const runQuery = useCallback(async (force = true) => {
    const namespace = queryClient.getNamespace();
    setActiveNamespace(namespace);

    if (!enabled) {
      const cachedState = getCachedState(namespace);
      if (cachedState) {
        setState({ ...cachedState, isLoading: false, isFetching: false });
      } else {
        setState((prev) => ({ ...prev, status: 'idle', isLoading: false, isFetching: false }));
      }
      return;
    }

    await queryClient.fetchQuery<TData>({
      namespace,
      key: normalizedKey,
      queryFn: () => queryFnRef.current(),
      retry,
      retryDelayMs,
      persist,
      force,
    });
  }, [enabled, getCachedState, normalizedKey, persist, retry, retryDelayMs]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribeEntry: () => void = () => undefined;

    const attachEntrySubscription = (namespace: string) => {
      unsubscribeEntry();
      unsubscribeEntry = queryClient.subscribe(namespace, normalizedKey, () => {
        if (cancelled) return;
        syncFromCache(namespace);

        if (enabled && queryClient.isInvalidated(normalizedKey, namespace)) {
          void queryClient.fetchQuery<TData>({
            namespace,
            key: normalizedKey,
            queryFn: () => queryFnRef.current(),
            retry,
            retryDelayMs,
            persist,
            force: false,
          }).catch(() => undefined);
        }
      });
    };

    const prepareNamespace = async (namespace: string) => {
      setActiveNamespace(namespace);
      attachEntrySubscription(namespace);
      await queryClient.ensureHydrated(namespace);
      if (cancelled) return;

      const cached = getCachedState(namespace);
      if (!cached && initialData !== null) {
        queryClient.setQueryData<TData>(normalizedKey, initialData, { namespace, persist });
      } else {
        syncFromCache(namespace);
      }

      const shouldFetch =
        enabled &&
        (
          !cached ||
          queryClient.isInvalidated(normalizedKey, namespace) ||
          (!manualInvalidationOnly && !isFresh(cached))
        );

      if (shouldFetch) {
        void queryClient.fetchQuery<TData>({
          namespace,
          key: normalizedKey,
          queryFn: () => queryFnRef.current(),
          retry,
          retryDelayMs,
          persist,
          force: false,
        }).catch(() => undefined);
      } else {
        syncFromCache(namespace);
      }
    };

    const namespace = queryClient.getNamespace();
    void prepareNamespace(namespace);

    const unsubscribeNamespace = queryClient.subscribeToNamespaceChanges((nextNamespace) => {
      if (cancelled) return;
      void prepareNamespace(nextNamespace);
    });

    return () => {
      cancelled = true;
      unsubscribeEntry();
      unsubscribeNamespace();
    };
  }, [enabled, getCachedState, initialData, isFresh, manualInvalidationOnly, normalizedKey, persist, retry, retryDelayMs, stableKey, syncFromCache]);

  useEffect(() => {
    if (!refetchOnWindowFocus || typeof window === 'undefined') {
      return;
    }

    const handleFocus = () => {
      if (!enabled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void runQuery(false).catch(() => undefined);
    };

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') {
        return;
      }
      handleFocus();
    };

    window.addEventListener('focus', handleFocus);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      window.removeEventListener('focus', handleFocus);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [enabled, refetchOnWindowFocus, runQuery]);

  return {
    ...state,
    refetch: () => runQuery(true),
    setData: (nextData: TData | null) => {
      queryClient.setQueryData<TData>(normalizedKey, nextData, { namespace: activeNamespace, persist });
    },
  };
}
