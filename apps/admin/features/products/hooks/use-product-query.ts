import { queryKeys, useQuery } from '@/lib/query';
import { productsService } from '../services/products.service';

export function useProductQuery(id: string | undefined, enabled = true) {
  return useQuery({
    key: queryKeys.products.detail(id ?? 'unknown'),
    enabled: enabled && Boolean(id),
    queryFn: () => productsService.getProduct(id ?? ''),
  });
}
