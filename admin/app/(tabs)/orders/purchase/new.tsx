import { Link, useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, AppCard, AppInput, AppSelect, PageHeader } from '@admin/components/ui';
import { useMasterSuppliersQuery } from '@admin/features/master';
import { OrderLineEditorCard, type DraftOrderLine, useCreatePurchaseOrderMutation } from '@admin/features/orders';
import { useProductsQuery } from '@admin/features/products';

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDraftLine(): DraftOrderLine {
  return {
    id: makeId(),
    qty: '1',
    unitAmount: '',
  };
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function NewPurchaseOrderScreen() {
  const router = useRouter();
  const suppliersQuery = useMasterSuppliersQuery();
  const productsQuery = useProductsQuery({ page: 1, pageSize: 100 });
  const createPurchaseOrder = useCreatePurchaseOrderMutation();

  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [expectedDate, setExpectedDate] = useState('');
  const [lines, setLines] = useState<DraftOrderLine[]>([createDraftLine()]);
  const [formError, setFormError] = useState<string | null>(null);

  const supplierOptions = useMemo(
    () =>
      (suppliersQuery.data ?? [])
        .filter((supplier) => supplier.status === 'active')
        .map((supplier) => ({
          label: supplier.name,
          value: supplier.id,
          description: supplier.email || supplier.phone || supplier.address || supplier.id,
        })),
    [suppliersQuery.data],
  );

  const productOptions = useMemo(
    () =>
      (productsQuery.data?.items ?? [])
        .filter((product) => product.status === 'active')
        .map((product) => ({
          label: product.name,
          value: product.id,
          description: `${product.styleCode}${product.category ? ` • ${product.category}` : ''}`,
        })),
    [productsQuery.data?.items],
  );

  const totalCost = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const qty = Number(line.qty);
        const unitAmount = Number(line.unitAmount);
        if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitAmount) || unitAmount < 0) {
          return sum;
        }
        return sum + qty * unitAmount;
      }, 0),
    [lines],
  );

  const updateLine = (lineId: string, nextLine: DraftOrderLine) => {
    setLines((previous) => previous.map((line) => (line.id === lineId ? nextLine : line)));
  };

  const addLine = () => {
    setLines((previous) => [...previous, createDraftLine()]);
  };

  const removeLine = (lineId: string) => {
    setLines((previous) => (previous.length > 1 ? previous.filter((line) => line.id !== lineId) : previous));
  };

  const handleCreate = async () => {
    setFormError(null);

    if (!supplierId) {
      setFormError('Select a supplier before creating the purchase order.');
      return;
    }

    let expectedDateIso: string | undefined;
    if (expectedDate.trim()) {
      const parsedDate = new Date(`${expectedDate.trim()}T00:00:00.000Z`);
      if (Number.isNaN(parsedDate.getTime())) {
        setFormError('Expected date must be in YYYY-MM-DD format.');
        return;
      }
      expectedDateIso = parsedDate.toISOString();
    }

    const payloadLines: { sizeId: string; qty: number; unitCost: number }[] = [];
    for (const [index, line] of lines.entries()) {
      if (!line.productId) {
        setFormError(`Select a product for line ${index + 1}.`);
        return;
      }
      if (!line.sizeId) {
        setFormError(`Select a size for line ${index + 1}.`);
        return;
      }

      const qty = Number(line.qty);
      const unitCost = Number(line.unitAmount);
      if (!Number.isFinite(qty) || qty <= 0) {
        setFormError(`Enter a valid quantity for line ${index + 1}.`);
        return;
      }
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        setFormError(`Enter a valid unit cost for line ${index + 1}.`);
        return;
      }

      payloadLines.push({
        sizeId: line.sizeId,
        qty,
        unitCost,
      });
    }

    const result = await createPurchaseOrder.mutateAsync({
      supplierId,
      expectedDate: expectedDateIso,
      lines: payloadLines,
    });

    router.replace(`/orders/purchase/${result.id}`);
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="New purchase order"
        subtitle="Create a full supplier order with multiple products, sizes, and quantities."
        actions={
          <Link href="/orders/purchase" asChild>
            <AppButton label="Back to purchase orders" size="sm" variant="secondary" />
          </Link>
        }
      />

      <View className="gap-4">
        <AppCard title="Order details" subtitle="Select the supplier and any expected receipt date before adding lines.">
          <View className="gap-4">
            <AppSelect
              label="Supplier"
              placeholder="Select a supplier"
              value={supplierId}
              options={supplierOptions}
              onValueChange={setSupplierId}
              required
              modalTitle="Select supplier"
            />
            <AppInput
              label="Expected date (YYYY-MM-DD)"
              placeholder="2026-03-30"
              value={expectedDate}
              onChangeText={setExpectedDate}
            />

            {suppliersQuery.isLoading ? <Text className="text-small text-muted">Loading suppliers...</Text> : null}
            {suppliersQuery.error ? <Text className="text-small text-error">{suppliersQuery.error.message}</Text> : null}
            {productsQuery.isLoading ? <Text className="text-small text-muted">Loading products...</Text> : null}
            {productsQuery.error ? <Text className="text-small text-error">{productsQuery.error.message}</Text> : null}
          </View>
        </AppCard>

        <AppCard
          title="Order lines"
          subtitle="Add every product and size the supplier should fulfil."
          rightSlot={
            <AppButton label="Add product" size="sm" variant="secondary" leftIcon={<Plus size={16} color="#111827" />} onPress={addLine} />
          }
        >
          <View className="gap-4">
            {lines.map((line, index) => (
              <OrderLineEditorCard
                key={line.id}
                line={line}
                index={index}
                productOptions={productOptions}
                amountLabel="Unit cost"
                amountPlaceholder="20"
                canRemove={lines.length > 1}
                onChange={(nextLine) => updateLine(line.id, nextLine)}
                onRemove={() => removeLine(line.id)}
              />
            ))}
          </View>
        </AppCard>

        <AppCard title="Summary" subtitle="Review the purchasing total before creating the PO.">
          <View className="gap-3">
            <Text className="text-small text-muted">Lines: {lines.length}</Text>
            <Text className="text-small text-muted">Estimated total: {currency.format(totalCost)}</Text>
            {formError ? <Text className="text-small text-error">{formError}</Text> : null}
            {createPurchaseOrder.error ? <Text className="text-small text-error">{createPurchaseOrder.error.message}</Text> : null}

            <View className="flex-row flex-wrap justify-end gap-2">
              <AppButton label="Add another product" size="sm" variant="secondary" onPress={addLine} />
              <AppButton label="Create purchase order" size="sm" loading={createPurchaseOrder.isPending} onPress={() => void handleCreate()} />
            </View>
          </View>
        </AppCard>
      </View>
    </ScrollView>
  );
}
