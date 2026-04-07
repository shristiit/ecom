import { useMutation } from '@admin/lib/query';
import { productsService } from '../services/products.service';
import type { ProductInput } from '../types/products.types';

export function useUpdateProductMutation() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ProductInput> }) => productsService.updateProduct(id, input),
  });
}
