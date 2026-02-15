import type { Status } from '@/features/shared';

export type ProductsFilter = {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  status?: Status;
};

export type ProductInput = {
  name: string;
  description?: string;
  categoryId?: string;
  status?: Status;
};
