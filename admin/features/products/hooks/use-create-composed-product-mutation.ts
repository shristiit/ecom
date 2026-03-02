import { useMutation } from '@/lib/query';
import { productsService } from '../services/products.service';

export function useCreateComposedProductMutation() {
  return useMutation({
    mutationFn: productsService.createComposedProduct,
  });
}
