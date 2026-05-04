import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QueryKey, QueryState } from './types';
import { queryClient } from './query-client';

type UseQueryOptions<TData> = {
  key: QueryKey;
  queryFn: () => Promise<TData>;
  enabled?: boolean;
  initialData?: TData | null;
  retry?: number;
  retryDelayMs?: number;
  persist?: boolean;
  manualInvalidationOnly?: boolean;
};

export function useQuery<TData>({
  key,
  queryFn,
  enabled = true,
  initialData = null,
  retry = 1,
  retryDelayMs = 250,
  persist = true,
  manualInvalidationOnly = true,
}: UseQueryOptions<TData>) {
  const queryFnRef = useRef(queryFn);
  const stableKey = useMemo(() => JSON.stringify(key), [key]);
  const normalizedKey = useMemo<QueryKey>(() => JSON.parse(stableKey) as QueryKey, [stableKey]);
  const [state, setState] = useState<QueryState<TData>>(() => {
    const namespace = queryClient.getNamespace();
    const cached = queryClient.getQueryState<TData>(normalizedKey, namespace);
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
    const cached = queryClient.getQueryState<TData>(normalizedKey, namespace);
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
  }, [enabled, initialData, normalizedKey]);

  const runQuery = useCallback(async (force = true) => {
    const namespace = queryClient.getNamespace();
    setActiveNamespace(namespace);

    if (!enabled) {
      const cachedState = queryClient.getQueryState<TData>(normalizedKey, namespace);
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
  }, [enabled, normalizedKey, persist, retry, retryDelayMs]);

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

      const cached = queryClient.getQueryState<TData>(normalizedKey, namespace);
      if (!cached && initialData !== null) {
        queryClient.setQueryData<TData>(normalizedKey, initialData, { namespace, persist });
      } else {
        syncFromCache(namespace);
      }

      const shouldFetch =
        enabled &&
        (
          !queryClient.hasQueryData(normalizedKey, namespace) ||
          queryClient.isInvalidated(normalizedKey, namespace) ||
          !manualInvalidationOnly
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
  }, [enabled, initialData, manualInvalidationOnly, normalizedKey, persist, retry, retryDelayMs, stableKey, syncFromCache]);

  return {
    ...state,
    refetch: () => runQuery(true),
    setData: (nextData: TData | null) => {
      queryClient.setQueryData<TData>(normalizedKey, nextData, { namespace: activeNamespace, persist });
    },
  };
}
