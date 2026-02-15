export type UsersFilter = {
  page?: number;
  pageSize?: number;
  search?: string;
  roleId?: string;
  status?: 'active' | 'invited' | 'suspended';
};

export type Role = {
  id: string;
  name: string;
};

export type Policy = {
  id: string;
  name: string;
  effect: 'allow' | 'deny';
};
