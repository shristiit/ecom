export type MasterLocation = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: string;
  address?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
};

export type MasterSupplier = {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
};

export type MasterCustomer = {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
};

export type MasterCategory = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type MasterLocationInput = {
  name: string;
  code: string;
  type: string;
  address?: string;
  status?: 'active' | 'inactive';
};

export type MasterPartyInput = {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  status?: 'active' | 'inactive';
};

export type MasterCategoryInput = {
  name: string;
  slug: string;
};
