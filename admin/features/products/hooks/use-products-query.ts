import { useMemo } from 'react';
import { queryKeys, useQuery } from '@admin/lib/query';
import { productsService } from '../services/products.service';
import type { ProductsFilter } from '../types/products.types';

export function useProductsQuery(filters?: ProductsFilter, enabled = true) {
  const filterKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  return useQuery({
    key: [...queryKeys.products.all(), filterKey],
    enabled,
    queryFn: () => productsService.listProducts(filters),
  });
}
