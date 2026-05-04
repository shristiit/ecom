import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { QueryPersistenceEnvelope } from './types';

const QUERY_CACHE_INDEX_KEY = 'admin.query-cache.index.v1';
const QUERY_CACHE_NAMESPACE_PREFIX = 'admin.query-cache.namespace.v1:';

function hasBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getNamespaceStorageKey(namespace: string) {
  return `${QUERY_CACHE_NAMESPACE_PREFIX}${namespace}`;
}

async function readRaw(key: string): Promise<string | null> {
  if (hasBrowserStorage()) {
    return window.localStorage.getItem(key);
  }

  if (Platform.OS !== 'web') {
    return AsyncStorage.getItem(key);
  }

  return null;
}

async function writeRaw(key: string, value: string) {
  if (hasBrowserStorage()) {
    window.localStorage.setItem(key, value);
    return;
  }

  if (Platform.OS !== 'web') {
    await AsyncStorage.setItem(key, value);
  }
}

async function removeRaw(key: string) {
  if (hasBrowserStorage()) {
    window.localStorage.removeItem(key);
    return;
  }

  if (Platform.OS !== 'web') {
    await AsyncStorage.removeItem(key);
  }
}

async function readIndex(): Promise<string[]> {
  const raw = await readRaw(QUERY_CACHE_INDEX_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string' && value.length > 0);
  } catch {
    return [];
  }
}

async function writeIndex(namespaces: string[]) {
  await writeRaw(QUERY_CACHE_INDEX_KEY, JSON.stringify(Array.from(new Set(namespaces)).sort()));
}

function parseEnvelope(raw: string | null): QueryPersistenceEnvelope | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<QueryPersistenceEnvelope> | null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return null;
    }

    return {
      version: 1,
      entries: parsed.entries.filter(
        (entry): entry is QueryPersistenceEnvelope['entries'][number] =>
          typeof entry === 'object' &&
          entry !== null &&
          Array.isArray(entry.key) &&
          'data' in entry &&
          ('updatedAt' in entry ? typeof entry.updatedAt === 'number' || entry.updatedAt === null : true),
      ),
    };
  } catch {
    return null;
  }
}

export const queryCacheStorage = {
  async readNamespace(namespace: string): Promise<QueryPersistenceEnvelope | null> {
    return parseEnvelope(await readRaw(getNamespaceStorageKey(namespace)));
  },

  async writeNamespace(namespace: string, envelope: QueryPersistenceEnvelope) {
    await writeRaw(getNamespaceStorageKey(namespace), JSON.stringify(envelope));
    const namespaces = await readIndex();
    if (!namespaces.includes(namespace)) {
      await writeIndex([...namespaces, namespace]);
    }
  },

  async deleteNamespace(namespace: string) {
    await removeRaw(getNamespaceStorageKey(namespace));
    const namespaces = await readIndex();
    if (namespaces.includes(namespace)) {
      await writeIndex(namespaces.filter((value) => value !== namespace));
    }
  },

  async clearAllNamespaces() {
    const namespaces = await readIndex();
    await Promise.all(namespaces.map((namespace) => removeRaw(getNamespaceStorageKey(namespace))));
    await removeRaw(QUERY_CACHE_INDEX_KEY);
  },
};
