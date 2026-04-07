import { useMutation } from '@admin/lib/query';
import { productsService } from '../services/products.service';
import type { ProductSkuInput } from '../types/products.types';

export function useCreateProductSkuMutation() {
  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: ProductSkuInput }) => productsService.createSku(productId, input),
  });
}
