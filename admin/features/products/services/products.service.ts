import type { PaginatedResponse, Product } from '@/features/shared';
import { get, patch, post } from '@/lib/api';
import type { ProductInput, ProductsFilter } from '../types/products.types';

export const productsService = {
  listProducts: (filters?: ProductsFilter) => get<PaginatedResponse<Product>>('/products', { query: filters }),

  getProduct: (id: string) => get<Product>(`/products/${id}`),

  createProduct: (input: ProductInput) => post<Product, ProductInput>('/products', input),

  updateProduct: (id: string, input: Partial<ProductInput>) => patch<Product, Partial<ProductInput>>(`/products/${id}`, input),
};
