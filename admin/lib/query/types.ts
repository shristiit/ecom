import type { ApiError } from '@admin/lib/api';

export type QueryKey = readonly (string | number | boolean | null | undefined)[];

export type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

export type QueryState<TData> = {
  data: TData | null;
  error: ApiError | null;
  status: QueryStatus;
  isLoading: boolean;
  isFetching: boolean;
};

export type MutationState<TResult> = {
  data: TResult | null;
  error: ApiError | null;
  isPending: boolean;
  isSuccess: boolean;
};
