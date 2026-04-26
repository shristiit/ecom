import { useEffect, useMemo, useState } from 'react';

type Options<T> = {
  selectName?: (row: T) => string;
  delayMs?: number;
};

export function useDebouncedNameFilter<T>(
  rows: T[],
  options: Options<T> = {},
) {
  const { selectName = (row: T) => String((row as { name?: unknown }).name ?? ''), delayMs = 250 } = options;
  const [nameFilter, setNameFilter] = useState('');
  const [debouncedNameFilter, setDebouncedNameFilter] = useState('');

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedNameFilter(nameFilter);
    }, delayMs);
    return () => clearTimeout(timeout);
  }, [delayMs, nameFilter]);

  const normalizedFilter = debouncedNameFilter.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    if (!normalizedFilter) {
      return rows;
    }

    return rows.filter((row) => selectName(row).toLowerCase().includes(normalizedFilter));
  }, [normalizedFilter, rows, selectName]);

  return {
    nameFilter,
    setNameFilter,
    filteredRows,
    hasActiveFilter: normalizedFilter.length > 0,
  };
}
