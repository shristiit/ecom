import { useMutation } from '@/lib/query';
import { productsService } from '../services/products.service';
import type { ProductLocationInput } from '../types/products.types';

export function useUpsertProductLocationMutation() {
  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: ProductLocationInput }) =>
      productsService.upsertProductLocation(productId, input),
  });
}

export function useRemoveProductLocationMutation() {
  return useMutation({
    mutationFn: ({ productId, locationId }: { productId: string; locationId: string }) =>
      productsService.removeProductLocation(productId, locationId),
  });
}
