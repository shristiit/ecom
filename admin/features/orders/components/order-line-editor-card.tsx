import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { AppButton, AppCard, AppInput, AppSelect } from '@admin/components/ui';
import type { SelectOption } from '@admin/components/ui';
import { useProductQuery } from '@admin/features/products';

export type DraftOrderLine = {
  id: string;
  productId?: string;
  sizeId?: string;
  qty: string;
  unitAmount: string;
};

type OrderLineEditorCardProps = {
  line: DraftOrderLine;
  index: number;
  productOptions: SelectOption[];
  defaultAmountByProductId?: Record<string, number>;
  qtyLabel?: string;
  amountLabel: string;
  amountPlaceholder: string;
  canRemove: boolean;
  onChange: (line: DraftOrderLine) => void;
  onRemove: () => void;
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

type SizeOption = SelectOption & {
  suggestedAmount?: number;
};

export function OrderLineEditorCard({
  line,
  index,
  productOptions,
  defaultAmountByProductId,
  qtyLabel = 'Quantity',
  amountLabel,
  amountPlaceholder,
  canRemove,
  onChange,
  onRemove,
}: OrderLineEditorCardProps) {
  const productQuery = useProductQuery(line.productId, Boolean(line.productId));

  const sizeOptions = useMemo<SizeOption[]>(() => {
    if (!productQuery.data) return [];

    return productQuery.data.skus
      .filter((sku) => sku.status === 'active')
      .flatMap((sku) =>
        sku.sizes
          .filter((size) => size.status === 'active')
          .map((size) => {
            const suggestedAmount = size.priceOverride ?? sku.priceOverride ?? productQuery.data?.basePrice;
            return {
              label: `${sku.colorName} / ${size.sizeLabel}`,
              value: size.id,
              description: `${sku.skuCode}${suggestedAmount !== undefined ? ` • ${currency.format(suggestedAmount)}` : ''}`,
              suggestedAmount: suggestedAmount ?? undefined,
            };
          }),
      );
  }, [productQuery.data]);

  const selectedProduct = useMemo(
    () => productOptions.find((option) => option.value === line.productId),
    [line.productId, productOptions],
  );

  const handleProductChange = (productId: string) => {
    const defaultAmount = defaultAmountByProductId?.[productId];
    onChange({
      ...line,
      productId,
      sizeId: undefined,
      unitAmount: defaultAmount !== undefined ? String(defaultAmount) : '',
    });
  };

  const handleSizeChange = (sizeId: string) => {
    const selectedSize = sizeOptions.find((option) => option.value === sizeId);
    onChange({
      ...line,
      sizeId,
      unitAmount:
        line.unitAmount.trim().length > 0
          ? line.unitAmount
          : selectedSize?.suggestedAmount !== undefined
            ? String(selectedSize.suggestedAmount)
            : line.unitAmount,
    });
  };

  return (
    <AppCard
      title={`Line ${index + 1}`}
      subtitle={selectedProduct?.description ?? 'Pick a product, then choose a size and quantity.'}
      rightSlot={canRemove ? <AppButton label="Remove" size="sm" variant="tertiary" onPress={onRemove} /> : null}
    >
      <View className="gap-4">
        <AppSelect
          label="Product"
          placeholder="Select a product"
          value={line.productId}
          options={productOptions}
          onValueChange={handleProductChange}
          required
          modalTitle="Select product"
        />

        <AppSelect
          label="Size"
          placeholder={
            line.productId
              ? productQuery.isLoading
                ? 'Loading sizes...'
                : sizeOptions.length > 0
                  ? 'Select a size'
                  : 'No active sizes available'
              : 'Select a product first'
          }
          value={line.sizeId}
          options={sizeOptions}
          onValueChange={handleSizeChange}
          required
          disabled={!line.productId || productQuery.isLoading || sizeOptions.length === 0}
          modalTitle="Select size"
        />

        {productQuery.error ? <Text className="text-small text-error">{productQuery.error.message}</Text> : null}
        {line.productId && !productQuery.isLoading && sizeOptions.length === 0 && !productQuery.error ? (
          <Text className="text-small text-muted">This product has no active sellable sizes yet.</Text>
        ) : null}

        <View className="gap-4 md:flex-row">
          <AppInput
            label={qtyLabel}
            placeholder="1"
            keyboardType="number-pad"
            value={line.qty}
            onChangeText={(qty) => onChange({ ...line, qty })}
            containerClassName="flex-1"
          />
          <AppInput
            label={amountLabel}
            placeholder={amountPlaceholder}
            keyboardType="decimal-pad"
            value={line.unitAmount}
            onChangeText={(unitAmount) => onChange({ ...line, unitAmount })}
            containerClassName="flex-1"
          />
        </View>
      </View>
    </AppCard>
  );
}
