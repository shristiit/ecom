import type { Status } from '@admin/features/shared';

export type ProductsFilter = {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  status?: Status;
};

export type ProductInput = {
  styleCode: string;
  name: string;
  category?: string;
  brand?: string;
  basePrice: number;
  priceVisible?: boolean;
  inventoryMode?: 'local' | 'global';
  maxBackorderQty?: number | null;
  pickupEnabled?: boolean;
  categoryId?: string;
  status?: Extract<Status, 'active' | 'inactive'>;
};

export type ProductListItem = {
  id: string;
  tenantId: string;
  styleCode: string;
  name: string;
  category?: string;
  brand?: string;
  basePrice: number;
  status: Extract<Status, 'active' | 'inactive'>;
  createdAt: string;
  updatedAt: string;
};

export type ProductDetail = {
  id: string;
  tenantId: string;
  styleCode: string;
  name: string;
  category?: string;
  brand?: string;
  basePrice: number;
  status: Extract<Status, 'active' | 'inactive'>;
  createdAt: string;
  updatedAt: string;
  skus: Array<{
    id: string;
    skuCode: string;
    colorName: string;
    colorCode?: string | null;
    priceOverride?: number | null;
    status: Extract<Status, 'active' | 'inactive'>;
    sizes: Array<{
      id: string;
      sizeLabel: string;
      barcode: string;
      unitOfMeasure: string;
      packSize: number;
      priceOverride?: number | null;
      status: Extract<Status, 'active' | 'inactive'>;
    }>;
  }>;
};

export type ProductLocation = {
  locationId: string;
  name: string;
  isEnabled: boolean;
  pickupEnabled: boolean;
};

export type ProductSkuInput = {
  colorName: string;
  colorCode?: string | null;
  skuCode: string;
  priceOverride?: number | null;
  sizeLabel: string;
  barcode: string;
  unitOfMeasure?: string;
  packSize?: number;
  sizePriceOverride?: number | null;
};

export type ProductLocationInput = {
  locationId: string;
  isEnabled: boolean;
  pickupEnabled: boolean;
};

export type ProductMediaInput = {
  url: string;
  s3Key?: string;
  altText?: string;
  sortOrder?: number;
  isPrimary?: boolean;
};

export type ProductVariantSizeInput = {
  sizeLabel: string;
  barcode?: string;
  unitOfMeasure?: string;
  packSize?: number;
  priceOverride?: number | null;
  stockByLocation: {
    locationId: string;
    quantity: number;
  }[];
};

export type ProductVariantInput = {
  colorName: string;
  colorCode?: string | null;
  skuCode?: string;
  priceOverride?: number | null;
  media?: ProductMediaInput[];
  sizes: ProductVariantSizeInput[];
};

export type ComposedProductInput = {
  product: ProductInput;
  styleMedia?: ProductMediaInput[];
  variants: ProductVariantInput[];
};

export type ComposedProductResult = {
  productId: string;
  skuCount: number;
  sizeCount: number;
  stockRowCount: number;
};

export type ProductMediaUploadInput = {
  uri: string;
  name: string;
  type?: string;
};

export type ProductMediaUploadResult = {
  key: string;
  url: string;
  contentType: string;
  size: number;
};
