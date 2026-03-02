import { useMutation } from '@/lib/query';
import { productsService } from '../services/products.service';
import type { ProductMediaUploadInput } from '../types/products.types';

export function useUploadProductMediaMutation() {
  return useMutation({
    mutationFn: (input: ProductMediaUploadInput) => productsService.uploadProductMedia(input),
  });
}
