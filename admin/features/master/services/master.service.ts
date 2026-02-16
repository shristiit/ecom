import { del, get, patch, post } from '@/lib/api';
import type {
  MasterCategory,
  MasterCategoryInput,
  MasterCustomer,
  MasterLocation,
  MasterLocationInput,
  MasterPartyInput,
  MasterSupplier,
} from '../types/master.types';

type LocationRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  type: string;
  address?: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

type SupplierRow = {
  id: string;
  tenant_id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

type CustomerRow = {
  id: string;
  tenant_id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

type CategoryRow = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
};

export const masterService = {
  async listLocations() {
    const payload = await get<LocationRow[]>('/master/locations');
    return payload.map(toLocation);
  },

  async listSuppliers() {
    const payload = await get<SupplierRow[]>('/master/suppliers');
    return payload.map(toSupplier);
  },

  async listCustomers() {
    const payload = await get<CustomerRow[]>('/master/customers');
    return payload.map(toCustomer);
  },

  async listCategories() {
    const payload = await get<CategoryRow[]>('/master/categories');
    return payload.map(toCategory);
  },

  async createLocation(input: MasterLocationInput) {
    const payload = await post<LocationRow, MasterLocationInput>('/master/locations', input);
    return toLocation(payload);
  },

  async updateLocation(id: string, input: Partial<MasterLocationInput>) {
    const payload = await patch<LocationRow, Partial<MasterLocationInput>>(`/master/locations/${id}`, input);
    return toLocation(payload);
  },

  deleteLocation: (id: string) => del<void>(`/master/locations/${id}`),

  async createSupplier(input: MasterPartyInput) {
    const payload = await post<SupplierRow, MasterPartyInput>('/master/suppliers', input);
    return toSupplier(payload);
  },

  async updateSupplier(id: string, input: Partial<MasterPartyInput>) {
    const payload = await patch<SupplierRow, Partial<MasterPartyInput>>(`/master/suppliers/${id}`, input);
    return toSupplier(payload);
  },

  deleteSupplier: (id: string) => del<void>(`/master/suppliers/${id}`),

  async createCustomer(input: MasterPartyInput) {
    const payload = await post<CustomerRow, MasterPartyInput>('/master/customers', input);
    return toCustomer(payload);
  },

  async updateCustomer(id: string, input: Partial<MasterPartyInput>) {
    const payload = await patch<CustomerRow, Partial<MasterPartyInput>>(`/master/customers/${id}`, input);
    return toCustomer(payload);
  },

  deleteCustomer: (id: string) => del<void>(`/master/customers/${id}`),

  async createCategory(input: MasterCategoryInput) {
    const payload = await post<CategoryRow, MasterCategoryInput>('/master/categories', input);
    return toCategory(payload);
  },

  async updateCategory(id: string, input: Partial<MasterCategoryInput>) {
    const payload = await patch<CategoryRow, Partial<MasterCategoryInput>>(`/master/categories/${id}`, input);
    return toCategory(payload);
  },

  deleteCategory: (id: string) => del<void>(`/master/categories/${id}`),
};

function toLocation(row: LocationRow): MasterLocation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    name: row.name,
    type: row.type,
    address: row.address,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSupplier(row: SupplierRow): MasterSupplier {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCustomer(row: CustomerRow): MasterCustomer {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCategory(row: CategoryRow): MasterCategory {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
