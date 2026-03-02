import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Link, useRouter } from 'expo-router';
import { Plus, Trash2, Upload } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  AppButton,
  AppCard,
  AppInput,
  AppSelect,
  AppTable,
  AppTableCell,
  AppTableHeaderCell,
  AppTableRow,
  PageHeader,
} from '@/components/ui';
import { useMasterCategoriesQuery, useMasterLocationsQuery } from '@/features/master';
import { useCreateComposedProductMutation, useUploadProductMediaMutation } from '@/features/products';
import type { ComposedProductInput } from '@/features/products/types';

const fallbackCategoryOptions = [
  { label: 'Tops', value: 'tops' },
  { label: 'Shirts', value: 'shirts' },
  { label: 'Bottoms', value: 'bottoms' },
  { label: 'Outerwear', value: 'outerwear' },
];

const alphaSizes = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const numericSizes = Array.from({ length: 15 }, (_, index) => String((index + 1) * 2));
const sizeOptions = [...alphaSizes, ...numericSizes];

type UploadedMedia = {
  id: string;
  url: string;
  key: string;
  name: string;
};

type DraftStockLine = {
  id: string;
  sizeLabel: string;
  locationId: string;
  quantity: string;
};

type DraftVariant = {
  id: string;
  colorName: string;
  colorCode?: string;
  skuCode?: string;
  colorPrice?: string;
  media: UploadedMedia[];
  stockLines: DraftStockLine[];
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parsePrice(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

export default function ProductCreateScreen() {
  const router = useRouter();
  const createComposedProduct = useCreateComposedProductMutation();
  const uploadProductMedia = useUploadProductMediaMutation();
  const categoriesQuery = useMasterCategoriesQuery();
  const locationsQuery = useMasterLocationsQuery();

  const [name, setName] = useState('');
  const [styleCode, setStyleCode] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [brand, setBrand] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [styleMedia, setStyleMedia] = useState<UploadedMedia[]>([]);

  const [variantColorName, setVariantColorName] = useState('');
  const [variantColorCode, setVariantColorCode] = useState('');
  const [variantSkuCode, setVariantSkuCode] = useState('');
  const [variantColorPrice, setVariantColorPrice] = useState('');
  const [variantMedia, setVariantMedia] = useState<UploadedMedia[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [variants, setVariants] = useState<DraftVariant[]>([]);
  const [isStyleMediaUploading, setIsStyleMediaUploading] = useState(false);
  const [isVariantMediaUploading, setIsVariantMediaUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const categoryOptions = useMemo(() => {
    if (!categoriesQuery.data || categoriesQuery.data.length === 0) return fallbackCategoryOptions;
    return categoriesQuery.data.map((entry) => ({ label: entry.name, value: entry.slug }));
  }, [categoriesQuery.data]);

  const locationOptions = useMemo(
    () =>
      (locationsQuery.data ?? [])
        .filter((location) => location.status === 'active')
        .map((location) => ({
          label: `${location.code} - ${location.name}`,
          value: location.id,
          description: location.type,
        })),
    [locationsQuery.data],
  );

  const defaultLocationId = locationOptions[0]?.value ?? '';

  const toggleSize = (sizeLabel: string) => {
    setSelectedSizes((previous) =>
      previous.includes(sizeLabel) ? previous.filter((value) => value !== sizeLabel) : [...previous, sizeLabel],
    );
  };

  const updateVariant = (variantId: string, updater: (variant: DraftVariant) => DraftVariant) => {
    setVariants((previous) => previous.map((variant) => (variant.id === variantId ? updater(variant) : variant)));
  };

  const pickAndUploadImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Media library permission is required to upload images.');
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.9,
    });
    if (pickerResult.canceled) return [] as UploadedMedia[];

    const uploaded: UploadedMedia[] = [];
    for (const asset of pickerResult.assets) {
      const uploadedMedia = await uploadProductMedia.mutateAsync({
        uri: asset.uri,
        name: asset.fileName ?? `image-${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      });
      uploaded.push({
        id: makeId(),
        url: uploadedMedia.url,
        key: uploadedMedia.key,
        name: asset.fileName ?? 'image',
      });
    }
    return uploaded;
  };

  const uploadStyleMedia = async () => {
    setFormError(null);
    try {
      setIsStyleMediaUploading(true);
      const uploaded = await pickAndUploadImages();
      if (uploaded.length > 0) {
        setStyleMedia((previous) => [...previous, ...uploaded]);
      }
    } catch (error: any) {
      setFormError(error?.message ?? 'Failed to upload style media.');
    } finally {
      setIsStyleMediaUploading(false);
    }
  };

  const uploadVariantMedia = async () => {
    setFormError(null);
    try {
      setIsVariantMediaUploading(true);
      const uploaded = await pickAndUploadImages();
      if (uploaded.length > 0) {
        setVariantMedia((previous) => [...previous, ...uploaded]);
      }
    } catch (error: any) {
      setFormError(error?.message ?? 'Failed to upload variant media.');
    } finally {
      setIsVariantMediaUploading(false);
    }
  };

  const addVariant = () => {
    setFormError(null);

    if (!variantColorName.trim()) {
      setFormError('Color name is required before adding a variant.');
      return;
    }
    if (selectedSizes.length === 0) {
      setFormError('Select one or more sizes before adding a variant.');
      return;
    }
    if (!defaultLocationId) {
      setFormError('Add an active location in master data before creating stock rows.');
      return;
    }

    const orderedSizes = sizeOptions.filter((size) => selectedSizes.includes(size));
    const stockLines = orderedSizes.map((sizeLabel) => ({
      id: makeId(),
      sizeLabel,
      locationId: defaultLocationId,
      quantity: '0',
    }));

    setVariants((previous) => [
      ...previous,
      {
        id: makeId(),
        colorName: variantColorName.trim(),
        colorCode: variantColorCode.trim() || undefined,
        skuCode: variantSkuCode.trim() || undefined,
        colorPrice: variantColorPrice.trim() || undefined,
        media: variantMedia,
        stockLines,
      },
    ]);

    setVariantColorName('');
    setVariantColorCode('');
    setVariantSkuCode('');
    setVariantColorPrice('');
    setVariantMedia([]);
    setSelectedSizes([]);
  };

  const buildPayload = (): ComposedProductInput | null => {
    const parsedBasePrice = parsePrice(basePrice);
    if (!name.trim() || !styleCode.trim()) {
      setFormError('Style name and style code are required.');
      return null;
    }
    if (parsedBasePrice === null) {
      setFormError('Master/base price must be a non-negative number.');
      return null;
    }
    if (variants.length === 0) {
      setFormError('Add at least one color variant with sizes.');
      return null;
    }

    const payloadVariants = variants.map((variant) => {
      if (variant.stockLines.length === 0) {
        throw new Error(`Variant ${variant.colorName} has no size rows.`);
      }

      const sizesByLabel = new Map<string, { sizeLabel: string; stockByLocation: { locationId: string; quantity: number }[] }>();
      for (const line of variant.stockLines) {
        const quantity = Number(line.quantity);
        if (!line.locationId) {
          throw new Error(`Choose location for ${variant.colorName} ${line.sizeLabel}.`);
        }
        if (!Number.isFinite(quantity) || quantity < 0) {
          throw new Error(`Invalid quantity for ${variant.colorName} ${line.sizeLabel}.`);
        }

        const current = sizesByLabel.get(line.sizeLabel) ?? {
          sizeLabel: line.sizeLabel,
          stockByLocation: [] as { locationId: string; quantity: number }[],
        };

        current.stockByLocation.push({
          locationId: line.locationId,
          quantity: Math.round(quantity),
        });

        sizesByLabel.set(line.sizeLabel, current);
      }

      return {
        colorName: variant.colorName,
        colorCode: variant.colorCode ?? null,
        skuCode: variant.skuCode,
        priceOverride: parsePrice(variant.colorPrice ?? ''),
        media: variant.media.map((media, index) => ({
          url: media.url,
          s3Key: media.key,
          sortOrder: index,
          isPrimary: index === 0,
        })),
        sizes: Array.from(sizesByLabel.values()),
      };
    });

    return {
      product: {
        name: name.trim(),
        styleCode: styleCode.trim(),
        category,
        brand: brand.trim(),
        basePrice: parsedBasePrice,
        status,
      },
      styleMedia: styleMedia.map((media, index) => ({
        url: media.url,
        s3Key: media.key,
        sortOrder: index,
        isPrimary: index === 0,
      })),
      variants: payloadVariants,
    };
  };

  const handleCreateProduct = async () => {
    setFormError(null);
    try {
      const payload = buildPayload();
      if (!payload) return;
      const created = await createComposedProduct.mutateAsync(payload);
      router.replace(`/products/${created.productId}`);
    } catch (error: any) {
      setFormError(error?.message ?? 'Unable to create product.');
    }
  };

  return (
    <ScrollView className="bg-bg px-6 py-6">
      <PageHeader
        title="Create Product"
        subtitle="Create one style with colors, sizes, media, and opening stock/location in a single submit."
      />

      <View className="gap-4 pb-6">
        <AppCard title="Style basics">
          <View className="flex-row flex-wrap gap-4">
            <View className="min-w-[260px] flex-1">
              <AppInput label="Style name" placeholder="Core Cotton Tee" required value={name} onChangeText={setName} />
            </View>
            <View className="min-w-[260px] flex-1">
              <AppInput label="Style code" placeholder="CORE-TEE-001" required value={styleCode} onChangeText={setStyleCode} />
            </View>
            <View className="min-w-[260px] flex-1">
              <AppSelect
                label="Category"
                placeholder="Select category"
                value={category}
                options={categoryOptions}
                onValueChange={setCategory}
              />
            </View>
            <View className="min-w-[260px] flex-1">
              <AppInput label="Brand" placeholder="StockAisle" value={brand} onChangeText={setBrand} />
            </View>
          </View>
        </AppCard>

        <AppCard title="Master pricing">
          <View className="flex-row flex-wrap gap-4">
            <View className="min-w-[260px] flex-1">
              <AppInput
                label="Master price"
                placeholder="49"
                keyboardType="decimal-pad"
                required
                value={basePrice}
                onChangeText={setBasePrice}
              />
            </View>
            <View className="min-w-[260px] flex-1">
              <AppSelect
                label="Status"
                value={status}
                options={[
                  { label: 'Active', value: 'active' },
                  { label: 'Inactive', value: 'inactive' },
                ]}
                onValueChange={(value) => setStatus(value as 'active' | 'inactive')}
              />
            </View>
          </View>
        </AppCard>

        <AppCard title="Style media" subtitle="Upload images here. Files are stored in S3 immediately.">
          <View className="gap-3">
            <AppButton
              label={isStyleMediaUploading ? 'Uploading...' : 'Upload style images'}
              variant="secondary"
              leftIcon={<Upload size={16} color="#334155" />}
              onPress={() => void uploadStyleMedia()}
              disabled={isStyleMediaUploading || uploadProductMedia.isPending}
            />
            {styleMedia.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {styleMedia.map((media) => (
                  <View key={media.id} className="w-[140px] gap-1 rounded-md border border-border bg-surface-2 p-2">
                    <Image source={{ uri: media.url }} style={{ width: '100%', height: 90, borderRadius: 6 }} contentFit="cover" />
                    <Text className="text-caption text-muted" numberOfLines={1}>
                      {media.name}
                    </Text>
                    <Pressable
                      className="h-8 items-center justify-center rounded-md border border-border bg-surface"
                      onPress={() => setStyleMedia((previous) => previous.filter((entry) => entry.id !== media.id))}
                    >
                      <Trash2 size={14} color="#334155" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-caption text-muted">No style images uploaded yet.</Text>
            )}
          </View>
        </AppCard>

        <AppCard title="Add color variant">
          <View className="gap-4">
            <View className="flex-row flex-wrap gap-3">
              <View className="min-w-[260px] flex-1">
                <AppInput label="Color name" placeholder="Black" required value={variantColorName} onChangeText={setVariantColorName} />
              </View>
              <View className="min-w-[260px] flex-1">
                <AppInput label="Color code" placeholder="#111111" value={variantColorCode} onChangeText={setVariantColorCode} />
              </View>
            </View>
            <View className="flex-row flex-wrap gap-3">
              <View className="min-w-[260px] flex-1">
                <AppInput label="SKU code (optional)" placeholder="CORE-TEE-BLK" value={variantSkuCode} onChangeText={setVariantSkuCode} />
              </View>
              <View className="min-w-[260px] flex-1">
                <AppInput
                  label="Color price (optional)"
                  placeholder="59"
                  keyboardType="decimal-pad"
                  value={variantColorPrice}
                  onChangeText={setVariantColorPrice}
                />
              </View>
            </View>

            <View className="gap-2">
              <Text className="text-small font-medium text-text">Sizes (master list)</Text>
              <View className="flex-row flex-wrap gap-2">
                {sizeOptions.map((sizeLabel) => {
                  const selected = selectedSizes.includes(sizeLabel);
                  return (
                    <Pressable
                      key={sizeLabel}
                      className={`rounded-md border px-3 py-2 ${selected ? 'border-primary bg-primary-tint' : 'border-border bg-surface-2'}`}
                      onPress={() => toggleSize(sizeLabel)}
                    >
                      <Text className={`text-small font-medium ${selected ? 'text-primary' : 'text-text'}`}>{sizeLabel}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View className="gap-3">
              <Text className="text-small font-medium text-text">Variant media</Text>
              <AppButton
                label={isVariantMediaUploading ? 'Uploading...' : 'Upload variant images'}
                variant="secondary"
                leftIcon={<Upload size={16} color="#334155" />}
                onPress={() => void uploadVariantMedia()}
                disabled={isVariantMediaUploading || uploadProductMedia.isPending}
              />
              {variantMedia.length > 0 ? (
                <View className="flex-row flex-wrap gap-2">
                  {variantMedia.map((media) => (
                    <View key={media.id} className="w-[140px] gap-1 rounded-md border border-border bg-surface-2 p-2">
                      <Image source={{ uri: media.url }} style={{ width: '100%', height: 90, borderRadius: 6 }} contentFit="cover" />
                      <Text className="text-caption text-muted" numberOfLines={1}>
                        {media.name}
                      </Text>
                      <Pressable
                        className="h-8 items-center justify-center rounded-md border border-border bg-surface"
                        onPress={() => setVariantMedia((previous) => previous.filter((entry) => entry.id !== media.id))}
                      >
                        <Trash2 size={14} color="#334155" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-caption text-muted">No variant images uploaded yet.</Text>
              )}
            </View>

            <View className="items-start">
              <AppButton label="Add color + sizes" onPress={addVariant} leftIcon={<Plus size={16} color="#FFFFFF" />} />
            </View>
          </View>
        </AppCard>

        {variants.length > 0 ? (
          <AppCard title="Variant stock matrix" subtitle="Edit location and opening quantity directly in table rows.">
            <View className="gap-3">
              {variants.map((variant) => (
                <View key={variant.id} className="gap-3 rounded-md border border-border bg-surface-2 p-3">
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="flex-1">
                      <Text className="text-small font-semibold text-text">{variant.colorName}</Text>
                      <Text className="text-caption text-muted">
                        {variant.skuCode ? `SKU ${variant.skuCode} | ` : ''}
                        {variant.colorPrice ? `Price ${variant.colorPrice}` : 'Uses master price'}
                      </Text>
                    </View>
                    <Pressable
                      className="h-9 w-9 items-center justify-center rounded-md border border-border bg-surface"
                      onPress={() => setVariants((previous) => previous.filter((entry) => entry.id !== variant.id))}
                    >
                      <Trash2 size={16} color="#334155" />
                    </Pressable>
                  </View>

                  <AppTable>
                    <AppTableRow header>
                      <AppTableHeaderCell className="min-w-[120px]">Size</AppTableHeaderCell>
                      <AppTableHeaderCell className="min-w-[280px]">Location</AppTableHeaderCell>
                      <AppTableHeaderCell className="min-w-[180px]">Opening Qty</AppTableHeaderCell>
                      <AppTableHeaderCell align="right" className="min-w-[90px]">
                        Action
                      </AppTableHeaderCell>
                    </AppTableRow>

                    {variant.stockLines.map((line) => (
                      <AppTableRow key={line.id}>
                        <AppTableCell className="min-w-[120px]">{line.sizeLabel}</AppTableCell>
                        <AppTableCell className="min-w-[280px]">
                          <AppSelect
                            value={line.locationId}
                            options={locationOptions}
                            onValueChange={(locationId) =>
                              updateVariant(variant.id, (current) => ({
                                ...current,
                                stockLines: current.stockLines.map((entry) =>
                                  entry.id === line.id ? { ...entry, locationId } : entry,
                                ),
                              }))
                            }
                          />
                        </AppTableCell>
                        <AppTableCell className="min-w-[180px]">
                          <AppInput
                            keyboardType="number-pad"
                            value={line.quantity}
                            onChangeText={(quantity) =>
                              updateVariant(variant.id, (current) => ({
                                ...current,
                                stockLines: current.stockLines.map((entry) =>
                                  entry.id === line.id ? { ...entry, quantity } : entry,
                                ),
                              }))
                            }
                          />
                        </AppTableCell>
                        <AppTableCell align="right" className="min-w-[90px]">
                          <Pressable
                            className="h-9 w-9 items-center justify-center rounded-md border border-border bg-surface"
                            onPress={() =>
                              updateVariant(variant.id, (current) => ({
                                ...current,
                                stockLines: current.stockLines.filter((entry) => entry.id !== line.id),
                              }))
                            }
                          >
                            <Trash2 size={14} color="#334155" />
                          </Pressable>
                        </AppTableCell>
                      </AppTableRow>
                    ))}
                  </AppTable>
                </View>
              ))}
            </View>
          </AppCard>
        ) : null}

        {formError ? <Text className="text-small text-error">{formError}</Text> : null}
        {createComposedProduct.error ? <Text className="text-small text-error">{createComposedProduct.error.message}</Text> : null}

        <View className="flex-row flex-wrap items-center gap-2">
          <AppButton
            label="Create Product"
            onPress={() => void handleCreateProduct()}
            loading={createComposedProduct.isPending}
          />
          <Link href="/products" asChild>
            <AppButton label="Cancel" variant="tertiary" />
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}
