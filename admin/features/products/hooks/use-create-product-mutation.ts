import { useMutation } from '@admin/lib/query';
import { productsService } from '../services/products.service';

export function useCreateProductMutation() {
  return useMutation({
    mutationFn: productsService.createProduct,
  });
}
