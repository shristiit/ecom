import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppModal,
  AppTable,
  AppTableCell,
  AppTableHeaderCell,
  AppTableRow,
  PageHeader,
} from '@/components/ui';
import { useCreateProductSkuMutation, useProductQuery } from '@/features/products';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function ProductSkuScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [colorName, setColorName] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [sizeLabel, setSizeLabel] = useState('');
  const [barcode, setBarcode] = useState('');
  const [price, setPrice] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = params.id;
  const productId = Array.isArray(rawId) ? rawId[0] : rawId;

  const query = useProductQuery(productId, Boolean(productId));
  const createSku = useCreateProductSkuMutation();
  const product = query.data;

  const skuRows =
    product?.skus.flatMap((sku) =>
      sku.sizes.map((size) => ({
        id: size.id,
        sku: sku.skuCode,
        option: `${sku.colorName} / ${size.sizeLabel}`,
        barcode: size.barcode,
        price: size.priceOverride ?? sku.priceOverride ?? product.basePrice,
        status: size.status,
      })),
    ) ?? [];

  const handleCreateSku = async () => {
    if (!productId) return;
    setFormError(null);

    if (!colorName.trim() || !skuCode.trim() || !sizeLabel.trim() || !barcode.trim()) {
      setFormError('Color, SKU code, size label, and barcode are required.');
      return;
    }

    const parsedPrice = price.trim() === '' ? undefined : Number(price);
    if (parsedPrice !== undefined && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setFormError('Price must be a non-negative number.');
      return;
    }

    await createSku.mutateAsync({
      productId,
      input: {
        colorName: colorName.trim(),
        skuCode: skuCode.trim(),
        sizeLabel: sizeLabel.trim(),
        barcode: barcode.trim(),
        priceOverride: parsedPrice,
        sizePriceOverride: parsedPrice,
      },
    });
    await query.refetch();
    setIsModalOpen(false);
    setColorName('');
    setSkuCode('');
    setSizeLabel('');
    setBarcode('');
    setPrice('');
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Product SKUs"
        subtitle={`Variants for ${product?.name ?? productId ?? 'product'} with barcode and pricing metadata.`}
        actions={<AppButton label="Add SKU" size="sm" onPress={() => setIsModalOpen(true)} />}
      />

      {query.isLoading ? <Text className="text-small text-muted">Loading SKU data...</Text> : null}
      {query.error ? (
        <View className="gap-3">
          <Text className="text-small text-error">{query.error.message}</Text>
          <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
        </View>
      ) : null}

      {!query.isLoading && !query.error ? (
        <AppCard>
          <AppTable>
            <AppTableRow header>
              <AppTableHeaderCell>SKU</AppTableHeaderCell>
              <AppTableHeaderCell>Variant</AppTableHeaderCell>
              <AppTableHeaderCell>Barcode</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Price</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
            </AppTableRow>

            {skuRows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>{row.sku}</AppTableCell>
                <AppTableCell>{row.option}</AppTableCell>
                <AppTableCell>{row.barcode}</AppTableCell>
                <AppTableCell align="right" className="tabular-nums">
                  {currency.format(Number(row.price ?? 0))}
                </AppTableCell>
                <AppTableCell align="right">
                  <AppBadge label={row.status} tone={row.status === 'active' ? 'success' : 'warning'} />
                </AppTableCell>
              </AppTableRow>
            ))}

            {skuRows.length === 0 ? (
              <AppTableRow>
                <AppTableCell className="min-w-full">
                  <Text className="text-small text-muted">No SKU sizes found for this product.</Text>
                </AppTableCell>
              </AppTableRow>
            ) : null}
          </AppTable>
        </AppCard>
      ) : null}

      <AppModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add SKU"
        description="Create SKU and first size option."
        footer={
          <View className="flex-row justify-end gap-2">
            <AppButton label="Cancel" size="sm" variant="secondary" onPress={() => setIsModalOpen(false)} />
            <AppButton label="Create" size="sm" loading={createSku.isPending} onPress={() => void handleCreateSku()} />
          </View>
        }
      >
        <View className="gap-3">
          <AppInput label="Color name" placeholder="Black" value={colorName} onChangeText={setColorName} />
          <AppInput label="SKU code" placeholder="CORE-TEE-BLK" value={skuCode} onChangeText={setSkuCode} />
          <AppInput label="Size label" placeholder="M" value={sizeLabel} onChangeText={setSizeLabel} />
          <AppInput label="Barcode" placeholder="1234567890123" value={barcode} onChangeText={setBarcode} />
          <AppInput label="Price override" placeholder="49" value={price} onChangeText={setPrice} keyboardType="number-pad" />
          {formError ? <Text className="text-small text-error">{formError}</Text> : null}
          {createSku.error ? <Text className="text-small text-error">{createSku.error.message}</Text> : null}
        </View>
      </AppModal>
    </ScrollView>
  );
}
