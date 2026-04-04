export type EntityId = string;
export type ISODateString = string;

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
};

export type PaginatedResponse<T> = {
  items: T[];
  pagination: Pagination;
};

export type Status = 'active' | 'inactive' | 'draft' | 'archived';
