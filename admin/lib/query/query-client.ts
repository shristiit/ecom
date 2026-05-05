import { ApiError } from '@admin/lib/api';
import { queryCacheStorage } from './query-cache-storage';
import type { QueryCacheEntry, QueryKey, QueryPersistenceEnvelope, QueryState } from './types';

type QueryListener = () => void;
type NamespaceListener = (namespace: string) => void;

type FetchQueryOptions<TData> = {
  namespace: string;
  key: QueryKey;
  queryFn: () => Promise<TData>;
  retry: number;
  retryDelayMs: number;
  persist: boolean;
  force?: boolean;
};

type NamespaceStore = {
  entries: Map<string, QueryCacheEntry<unknown>>;
  listeners: Map<string, Set<QueryListener>>;
  inflight: Map<string, Promise<unknown>>;
  hydrated: boolean;
  hydrating: Promise<void> | null;
  persistTimer: ReturnType<typeof setTimeout> | null;
};

const PERSIST_DEBOUNCE_MS = 150;
const DEFAULT_NAMESPACE = 'guest:unknown';

function createNamespaceStore(): NamespaceStore {
  return {
    entries: new Map(),
    listeners: new Map(),
    inflight: new Map(),
    hydrated: false,
    hydrating: null,
    persistTimer: null,
  };
}

function createEmptyEntry<TData>(key: QueryKey, persist: boolean): QueryCacheEntry<TData> {
  return {
    key,
    data: null,
    error: null,
    status: 'idle',
    isLoading: false,
    isFetching: false,
    updatedAt: null,
    invalidated: false,
    persist,
  };
}

function serializeKey(key: QueryKey) {
  return JSON.stringify(key);
}

function keysMatchPrefix(key: QueryKey, prefix: QueryKey) {
  if (prefix.length > key.length) return false;
  return prefix.every((value, index) => key[index] === value);
}

class QueryClient {
  private namespace = DEFAULT_NAMESPACE;
  private stores = new Map<string, NamespaceStore>();
  private namespaceListeners = new Set<NamespaceListener>();

  getNamespace() {
    return this.namespace;
  }

  setNamespace(namespace: string | null | undefined) {
    const nextNamespace = namespace && namespace.trim() ? namespace : DEFAULT_NAMESPACE;
    if (nextNamespace === this.namespace) return;
    this.namespace = nextNamespace;
    this.namespaceListeners.forEach((listener) => listener(nextNamespace));
  }

  subscribeToNamespaceChanges(listener: NamespaceListener) {
    this.namespaceListeners.add(listener);
    return () => {
      this.namespaceListeners.delete(listener);
    };
  }

  private getNamespaceStore(namespace: string) {
    const existing = this.stores.get(namespace);
    if (existing) return existing;

    const created = createNamespaceStore();
    this.stores.set(namespace, created);
    return created;
  }

  private getEntry<TData>(namespace: string, key: QueryKey): QueryCacheEntry<TData> | null {
    const store = this.getNamespaceStore(namespace);
    const entry = store.entries.get(serializeKey(key));
    return (entry as QueryCacheEntry<TData> | undefined) ?? null;
  }

  private setEntry<TData>(namespace: string, entry: QueryCacheEntry<TData>) {
    const store = this.getNamespaceStore(namespace);
    store.entries.set(serializeKey(entry.key), entry as QueryCacheEntry<unknown>);
    this.notify(namespace, entry.key);
    this.schedulePersist(namespace);
  }

  private notify(namespace: string, key: QueryKey) {
    const store = this.getNamespaceStore(namespace);
    const listeners = store.listeners.get(serializeKey(key));
    listeners?.forEach((listener) => listener());
  }

  subscribe(namespace: string, key: QueryKey, listener: QueryListener) {
    const store = this.getNamespaceStore(namespace);
    const hash = serializeKey(key);
    const listeners = store.listeners.get(hash) ?? new Set<QueryListener>();
    listeners.add(listener);
    store.listeners.set(hash, listeners);
    return () => {
      const existing = store.listeners.get(hash);
      if (!existing) return;
      existing.delete(listener);
      if (existing.size === 0) {
        store.listeners.delete(hash);
      }
    };
  }

  private schedulePersist(namespace: string) {
    const store = this.getNamespaceStore(namespace);
    if (store.persistTimer) {
      clearTimeout(store.persistTimer);
    }
    store.persistTimer = setTimeout(() => {
      store.persistTimer = null;
      void this.persistNamespace(namespace);
    }, PERSIST_DEBOUNCE_MS);
  }

  private buildPersistenceEnvelope(namespace: string): QueryPersistenceEnvelope {
    const store = this.getNamespaceStore(namespace);
    const entries = Array.from(store.entries.values())
      .filter((entry) => entry.persist && entry.status === 'success' && entry.data !== null)
      .map((entry) => ({
        key: entry.key,
        data: entry.data,
        updatedAt: entry.updatedAt,
      }));

    return {
      version: 1,
      entries,
    };
  }

  private async persistNamespace(namespace: string) {
    const envelope = this.buildPersistenceEnvelope(namespace);
    if (envelope.entries.length === 0) {
      await queryCacheStorage.deleteNamespace(namespace);
      return;
    }

    await queryCacheStorage.writeNamespace(namespace, envelope);
  }

  async ensureHydrated(namespace: string) {
    const store = this.getNamespaceStore(namespace);
    if (store.hydrated) return;
    if (store.hydrating) {
      await store.hydrating;
      return;
    }

    store.hydrating = (async () => {
      const envelope = await queryCacheStorage.readNamespace(namespace);
      if (envelope?.entries?.length) {
        envelope.entries.forEach((entry) => {
          store.entries.set(
            serializeKey(entry.key),
            {
              key: entry.key,
              data: entry.data,
              error: null,
              status: 'success',
              isLoading: false,
              isFetching: false,
              updatedAt: entry.updatedAt,
              invalidated: false,
              persist: true,
            },
          );
        });
      }
      store.hydrated = true;
      store.hydrating = null;
    })();

    await store.hydrating;
  }

  getQueryData<TData>(key: QueryKey, namespace = this.namespace): TData | null {
    return (this.getEntry<TData>(namespace, key)?.data as TData | null) ?? null;
  }

  getQueryState<TData>(key: QueryKey, namespace = this.namespace): QueryState<TData> | null {
    const entry = this.getEntry<TData>(namespace, key);
    if (!entry) return null;
    return {
      data: entry.data,
      error: entry.error,
      status: entry.status,
      isLoading: entry.isLoading,
      isFetching: entry.isFetching,
      updatedAt: entry.updatedAt,
    };
  }

  hasQueryData(key: QueryKey, namespace = this.namespace) {
    const entry = this.getEntry(namespace, key);
    return Boolean(entry && entry.data !== null);
  }

  isInvalidated(key: QueryKey, namespace = this.namespace) {
    return Boolean(this.getEntry(namespace, key)?.invalidated);
  }

  setQueryData<TData>(
    key: QueryKey,
    updater: TData | null | ((current: TData | null) => TData | null),
    options?: { namespace?: string; persist?: boolean },
  ) {
    const namespace = options?.namespace ?? this.namespace;
    const current = this.getEntry<TData>(namespace, key);
    const persist = options?.persist ?? current?.persist ?? true;
    const nextData = typeof updater === 'function' ? (updater as (current: TData | null) => TData | null)(current?.data ?? null) : updater;
    const nextEntry: QueryCacheEntry<TData> = {
      ...(current ?? createEmptyEntry<TData>(key, persist)),
      key,
      data: nextData,
      error: null,
      status: nextData === null ? 'idle' : 'success',
      isLoading: false,
      isFetching: false,
      updatedAt: nextData === null ? current?.updatedAt ?? null : Date.now(),
      invalidated: false,
      persist,
    };
    this.setEntry(namespace, nextEntry);
  }

  removeQueries(prefix?: QueryKey, namespace = this.namespace) {
    const store = this.getNamespaceStore(namespace);
    const keysToRemove = Array.from(store.entries.values())
      .filter((entry) => !prefix || keysMatchPrefix(entry.key, prefix))
      .map((entry) => entry.key);

    keysToRemove.forEach((key) => {
      store.entries.delete(serializeKey(key));
      this.notify(namespace, key);
    });

    this.schedulePersist(namespace);
  }

  invalidateQuery(key: QueryKey, namespace = this.namespace) {
    const entry = this.getEntry(namespace, key);
    if (!entry) return;
    this.setEntry(namespace, {
      ...entry,
      invalidated: true,
    });
  }

  invalidateQueries(prefix?: QueryKey, namespace = this.namespace) {
    const store = this.getNamespaceStore(namespace);
    store.entries.forEach((entry) => {
      if (prefix && !keysMatchPrefix(entry.key, prefix)) return;
      this.setEntry(namespace, {
        ...entry,
        invalidated: true,
      });
    });
  }

  invalidateAll(namespace = this.namespace) {
    this.invalidateQueries(undefined, namespace);
  }

  async clearNamespace(namespace = this.namespace) {
    const store = this.getNamespaceStore(namespace);
    if (store.persistTimer) {
      clearTimeout(store.persistTimer);
      store.persistTimer = null;
    }
    store.entries.clear();
    store.listeners.forEach((listeners) => listeners.forEach((listener) => listener()));
    await queryCacheStorage.deleteNamespace(namespace);
  }

  async clearAll() {
    this.stores.forEach((store) => {
      if (store.persistTimer) {
        clearTimeout(store.persistTimer);
        store.persistTimer = null;
      }
      store.entries.clear();
      store.listeners.forEach((listeners) => listeners.forEach((listener) => listener()));
    });
    await queryCacheStorage.clearAllNamespaces();
  }

  private async runFetchWithRetry<TData>(options: FetchQueryOptions<TData>) {
    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= options.retry; attempt += 1) {
      try {
        return await options.queryFn();
      } catch (error) {
        lastError = error instanceof ApiError ? error : new ApiError('Unknown query error', 0, 'QUERY_ERROR', error);
        if (attempt < options.retry) {
          await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs));
        }
      }
    }

    throw lastError ?? new ApiError('Unknown query error', 0, 'QUERY_ERROR');
  }

  async fetchQuery<TData>({
    namespace,
    key,
    queryFn,
    retry,
    retryDelayMs,
    persist,
    force = false,
  }: FetchQueryOptions<TData>) {
    const store = this.getNamespaceStore(namespace);
    const hash = serializeKey(key);
    const current = this.getEntry<TData>(namespace, key);

    if (!force) {
      const inflight = store.inflight.get(hash);
      if (inflight) {
        return inflight as Promise<TData>;
      }
    }

    this.setEntry(namespace, {
      ...(current ?? createEmptyEntry<TData>(key, persist)),
      key,
      persist,
      status: current?.data === null || current?.data === undefined ? 'loading' : current?.status ?? 'success',
      isLoading: current?.data === null || current?.data === undefined,
      isFetching: true,
      error: current?.error ?? null,
      invalidated: false,
    });

    const inflight = this.runFetchWithRetry({ namespace, key, queryFn, retry, retryDelayMs, persist, force })
      .then((data) => {
        this.setEntry(namespace, {
          key,
          data,
          error: null,
          status: 'success',
          isLoading: false,
          isFetching: false,
          updatedAt: Date.now(),
          invalidated: false,
          persist,
        });
        return data;
      })
      .catch((error: unknown) => {
        const apiError = error instanceof ApiError ? error : new ApiError('Unknown query error', 0, 'QUERY_ERROR', error);
        const previous = this.getEntry<TData>(namespace, key);
        this.setEntry(namespace, {
          ...(previous ?? createEmptyEntry<TData>(key, persist)),
          key,
          error: apiError,
          status: previous?.data !== null && previous?.data !== undefined ? 'success' : 'error',
          isLoading: false,
          isFetching: false,
          invalidated: false,
          persist,
        });
        throw apiError;
      })
      .finally(() => {
        store.inflight.delete(hash);
      });

    store.inflight.set(hash, inflight);
    return inflight;
  }
}

export const queryClient = new QueryClient();
