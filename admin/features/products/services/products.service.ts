import type { PaginatedResponse } from '@/features/shared';
import { del, get, patch, post } from '@/lib/api';
import type {
  ProductDetail,
  ProductInput,
  ProductLocationInput,
  ProductListItem,
  ProductLocation,
  ProductSkuInput,
  ProductsFilter,
} from '../types/products.types';

type ProductRow = {
  id: string;
  tenant_id: string;
  style_code: string;
  name: string;
  category?: string;
  brand?: string;
  base_price: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

type ProductSkuRow = {
  id: string;
  sku_code: string;
  color_name: string;
  color_code?: string | null;
  price_override?: number | null;
  status: 'active' | 'inactive';
  product_id: string;
};

type ProductSkuSizeRow = {
  id: string;
  sku_id: string;
  size_label: string;
  barcode: string;
  unit_of_measure: string;
  pack_size: number;
  price_override?: number | null;
  status: 'active' | 'inactive';
};

type ProductDetailPayload = {
  product: ProductRow;
  skus: ProductSkuRow[];
  sizes: ProductSkuSizeRow[];
};

type ProductLocationRow = {
  location_id: string;
  name: string;
  is_enabled: boolean;
  pickup_enabled: boolean;
};

type PaginatedInput<T> =
  | T[]
  | {
      items: T[];
      pagination?: { page?: number; pageSize?: number; total?: number };
    };

function toProductListItem(row: ProductRow): ProductListItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    styleCode: row.style_code,
    name: row.name,
    category: row.category,
    brand: row.brand,
    basePrice: Number(row.base_price ?? 0),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizePaginated<TInput, TOutput>(
  payload: PaginatedInput<TInput>,
  mapItem: (item: TInput) => TOutput,
): PaginatedResponse<TOutput> {
  if (Array.isArray(payload)) {
    return {
      items: payload.map(mapItem),
      pagination: {
        page: 1,
        pageSize: payload.length,
        total: payload.length,
      },
    };
  }

  const items = payload.items ?? [];
  return {
    items: items.map(mapItem),
    pagination: {
      page: payload.pagination?.page ?? 1,
      pageSize: payload.pagination?.pageSize ?? items.length,
      total: payload.pagination?.total ?? items.length,
    },
  };
}

function toProductDetail(payload: ProductDetailPayload): ProductDetail {
  const base = toProductListItem(payload.product);
  return {
    ...base,
    skus: payload.skus.map((sku) => ({
      id: sku.id,
      skuCode: sku.sku_code,
      colorName: sku.color_name,
      colorCode: sku.color_code ?? null,
      priceOverride: sku.price_override ?? null,
      status: sku.status,
      sizes: payload.sizes
        .filter((size) => size.sku_id === sku.id)
        .map((size) => ({
          id: size.id,
          sizeLabel: size.size_label,
          barcode: size.barcode,
          unitOfMeasure: size.unit_of_measure,
          packSize: Number(size.pack_size ?? 1),
          priceOverride: size.price_override ?? null,
          status: size.status,
        })),
    })),
  };
}

export const productsService = {
  async listProducts(filters?: ProductsFilter) {
    const payload = await get<PaginatedInput<ProductRow>>('/products', { query: filters });
    return normalizePaginated(payload, toProductListItem);
  },

  async getProduct(id: string) {
    const payload = await get<ProductDetailPayload>(`/products/${id}`);
    return toProductDetail(payload);
  },

  async createProduct(input: ProductInput) {
    const payload = await post<ProductRow, ProductInput>('/products', input);
    return toProductListItem(payload);
  },

  async updateProduct(id: string, input: Partial<ProductInput>) {
    const payload = await patch<ProductRow, Partial<ProductInput>>(`/products/${id}`, input);
    return toProductListItem(payload);
  },

  async listProductLocations(productId: string) {
    const payload = await get<ProductLocationRow[]>(`/products/${productId}/locations`);
    return payload.map((row) => ({
      locationId: row.location_id,
      name: row.name,
      isEnabled: row.is_enabled,
      pickupEnabled: row.pickup_enabled,
    })) satisfies ProductLocation[];
  },

  async createSku(productId: string, input: ProductSkuInput) {
    const sku = await post<ProductSkuRow, Omit<ProductSkuInput, 'sizeLabel' | 'barcode' | 'unitOfMeasure' | 'packSize' | 'sizePriceOverride'>>(
      `/products/${productId}/skus`,
      {
        colorName: input.colorName,
        colorCode: input.colorCode,
        skuCode: input.skuCode,
        priceOverride: input.priceOverride,
      },
    );

    await post<ProductSkuSizeRow, { sizeLabel: string; barcode: string; unitOfMeasure: string; packSize: number; priceOverride?: number | null }>(
      `/products/skus/${sku.id}/sizes`,
      {
        sizeLabel: input.sizeLabel,
        barcode: input.barcode,
        unitOfMeasure: input.unitOfMeasure ?? 'unit',
        packSize: input.packSize ?? 1,
        priceOverride: input.sizePriceOverride,
      },
    );
  },

  async upsertProductLocation(productId: string, input: ProductLocationInput) {
    return post(`/products/${productId}/locations`, input);
  },

  async removeProductLocation(productId: string, locationId: string) {
    return del(`/products/${productId}/locations/${locationId}`);
  },
};
