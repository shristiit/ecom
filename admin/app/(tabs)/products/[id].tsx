import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppBadge, AppButton, AppCard, AppInput, AppModal, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow, PageHeader } from '@admin/components/ui';
import { useStockOnHandQuery } from '@admin/features/inventory';
import { useProductQuery, useUpdateProductMutation } from '@admin/features/products';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function ProductDetailScreen() {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [styleCode, setStyleCode] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = params.id;
  const productId = Array.isArray(rawId) ? rawId[0] : rawId;
  const resolvedProductId = productId ?? '';

  const { data: product, error, isLoading, refetch } = useProductQuery(resolvedProductId, Boolean(resolvedProductId));
  const updateProduct = useUpdateProductMutation();
  const stockQuery = useStockOnHandQuery();

  const stockRows = (stockQuery.data?.items ?? []).filter((row) => row.productId === resolvedProductId);

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setStyleCode(product.styleCode);
    setCategory(product.category ?? '');
    setBrand(product.brand ?? '');
    setBasePrice(String(product.basePrice ?? 0));
  }, [product]);

  const handleUpdate = async (status?: 'active' | 'inactive') => {
    if (!product) return;
    setFormError(null);

    const parsedPrice = Number(basePrice);
    if (!name.trim() || !styleCode.trim()) {
      setFormError('Name and style code are required.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setFormError('Base price must be a non-negative number.');
      return;
    }

    await updateProduct.mutateAsync({
      id: product.id,
      input: {
        name: name.trim(),
        styleCode: styleCode.trim(),
        category: category.trim(),
        brand: brand.trim(),
        basePrice: parsedPrice,
        status: status ?? product.status,
      },
    });
    await refetch();
    setIsEditModalOpen(false);
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title={product ? product.name : `Product ${resolvedProductId}`}
        subtitle="Overview, sellability, and inventory footprint."
        actions={<AppButton label="Edit" size="sm" variant="secondary" onPress={() => setIsEditModalOpen(true)} />}
      />

      <View className="gap-4">
        {isLoading ? <Text className="text-small text-muted">Loading product...</Text> : null}
        {error ? (
          <View className="gap-3">
            <Text className="text-small text-error">{error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void refetch()} />
          </View>
        ) : null}

        {product ? (
          <>
            <AppCard title="Summary">
              <View className="flex-row flex-wrap items-center gap-3">
                <AppBadge label={product.status} tone={product.status === 'active' ? 'success' : 'default'} />
                <Text className="text-small text-muted">Style: {product.styleCode}</Text>
                <Text className="text-small text-muted">Category: {product.category || '-'}</Text>
                <Text className="text-small text-muted">Base: {currency.format(Number(product.basePrice ?? 0))}</Text>
              </View>
            </AppCard>

            <AppCard title="Related records">
              <View className="flex-row flex-wrap gap-2">
                <Link href={`/products/${resolvedProductId}/skus`} asChild>
                  <AppButton label="Manage SKUs" size="sm" variant="secondary" />
                </Link>
                <Link href={`/products/${resolvedProductId}/locations`} asChild>
                  <AppButton label="Manage locations" size="sm" variant="secondary" />
                </Link>
                <Link href="/inventory/stock-on-hand" asChild>
                  <AppButton label="View stock" size="sm" variant="tertiary" />
                </Link>
              </View>
            </AppCard>

            <AppCard title="Location stock snapshot">
              {stockQuery.isLoading ? <Text className="text-small text-muted">Loading stock...</Text> : null}
              {stockQuery.error ? <Text className="text-small text-error">{stockQuery.error.message}</Text> : null}

              {!stockQuery.isLoading && !stockQuery.error ? (
                <AppTable>
                  <AppTableRow header>
                    <AppTableHeaderCell>Location</AppTableHeaderCell>
                    <AppTableHeaderCell align="right">On hand</AppTableHeaderCell>
                    <AppTableHeaderCell align="right">Reserved</AppTableHeaderCell>
                    <AppTableHeaderCell align="right">Available</AppTableHeaderCell>
                  </AppTableRow>

                  {stockRows.map((row) => (
                    <AppTableRow key={`${row.sizeId}-${row.locationId}`}>
                      <AppTableCell>{row.locationCode || row.locationId}</AppTableCell>
                      <AppTableCell align="right" className="tabular-nums">
                        {row.onHand}
                      </AppTableCell>
                      <AppTableCell align="right" className="tabular-nums">
                        {row.reserved}
                      </AppTableCell>
                      <AppTableCell align="right" className="tabular-nums">
                        {row.available}
                      </AppTableCell>
                    </AppTableRow>
                  ))}

                  {stockRows.length === 0 ? (
                    <AppTableRow>
                      <AppTableCell className="min-w-full">
                        <Text className="text-small text-muted">No stock balances found for this product.</Text>
                      </AppTableCell>
                    </AppTableRow>
                  ) : null}
                </AppTable>
              ) : null}
            </AppCard>
          </>
        ) : null}
      </View>

      <AppModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit product"
        description="Update product metadata and status."
        footer={
          <View className="flex-row justify-end gap-2">
            <AppButton label="Cancel" size="sm" variant="secondary" onPress={() => setIsEditModalOpen(false)} />
            <AppButton label="Save" size="sm" loading={updateProduct.isPending} onPress={() => void handleUpdate()} />
            {product?.status === 'active' ? (
              <AppButton label="Deactivate" size="sm" variant="tertiary" onPress={() => void handleUpdate('inactive')} />
            ) : (
              <AppButton label="Activate" size="sm" variant="tertiary" onPress={() => void handleUpdate('active')} />
            )}
          </View>
        }
      >
        <View className="gap-3">
          <AppInput label="Name" value={name} onChangeText={setName} />
          <AppInput label="Style code" value={styleCode} onChangeText={setStyleCode} />
          <AppInput label="Category" value={category} onChangeText={setCategory} />
          <AppInput label="Brand" value={brand} onChangeText={setBrand} />
          <AppInput label="Base price" value={basePrice} onChangeText={setBasePrice} keyboardType="number-pad" />
          {formError ? <Text className="text-small text-error">{formError}</Text> : null}
          {updateProduct.error ? <Text className="text-small text-error">{updateProduct.error.message}</Text> : null}
        </View>
      </AppModal>
    </ScrollView>
  );
}
