import { queryKeys, useQuery } from '@/lib/query';
import { productsService } from '../services/products.service';

export function useProductLocationsQuery(productId: string | undefined, enabled = true) {
  return useQuery({
    key: [...queryKeys.products.detail(productId ?? 'unknown'), 'locations'],
    enabled: enabled && Boolean(productId),
    queryFn: () => productsService.listProductLocations(productId ?? ''),
  });
}
