import { Link, useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, AppCard, AppSelect, PageHeader } from '@/components/ui';
import { useMasterCustomersQuery } from '@/features/master';
import { OrderLineEditorCard, type DraftOrderLine, useCreateSalesOrderMutation } from '@/features/orders';
import { useProductsQuery } from '@/features/products';

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

export default function NewSalesOrderScreen() {
  const router = useRouter();
  const customersQuery = useMasterCustomersQuery();
  const productsQuery = useProductsQuery({ page: 1, pageSize: 100 });
  const createSalesOrder = useCreateSalesOrderMutation();

  const [customerId, setCustomerId] = useState<string | undefined>();
  const [lines, setLines] = useState<DraftOrderLine[]>([createDraftLine()]);
  const [formError, setFormError] = useState<string | null>(null);

  const customerOptions = useMemo(
    () =>
      (customersQuery.data ?? [])
        .filter((customer) => customer.status === 'active')
        .map((customer) => ({
          label: customer.name,
          value: customer.id,
          description: customer.email || customer.phone || customer.address || customer.id,
        })),
    [customersQuery.data],
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

  const productBasePriceById = useMemo(
    () =>
      Object.fromEntries((productsQuery.data?.items ?? []).map((product) => [product.id, Number(product.basePrice ?? 0)])),
    [productsQuery.data?.items],
  );

  const subtotal = useMemo(
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

    if (!customerId) {
      setFormError('Select a customer before creating the order.');
      return;
    }

    const payloadLines: { sizeId: string; qty: number; unitPrice: number }[] = [];
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
      const unitPrice = Number(line.unitAmount);
      if (!Number.isFinite(qty) || qty <= 0) {
        setFormError(`Enter a valid quantity for line ${index + 1}.`);
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        setFormError(`Enter a valid unit price for line ${index + 1}.`);
        return;
      }

      payloadLines.push({
        sizeId: line.sizeId,
        qty,
        unitPrice,
      });
    }

    const result = await createSalesOrder.mutateAsync({
      customerId,
      lines: payloadLines,
    });

    router.replace(`/orders/sales/${result.id}`);
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="New sales order"
        subtitle="Build a full invoice with multiple products, sizes, and quantities."
        actions={
          <Link href="/orders/sales" asChild>
            <AppButton label="Back to sales orders" size="sm" variant="secondary" />
          </Link>
        }
      />

      <View className="gap-4">
        <AppCard title="Order details" subtitle="Choose the customer first, then compose the order lines below.">
          <View className="gap-4">
            <AppSelect
              label="Customer"
              placeholder="Select a customer"
              value={customerId}
              options={customerOptions}
              onValueChange={setCustomerId}
              required
              modalTitle="Select customer"
            />

            {customersQuery.isLoading ? <Text className="text-small text-muted">Loading customers...</Text> : null}
            {customersQuery.error ? <Text className="text-small text-error">{customersQuery.error.message}</Text> : null}
            {productsQuery.isLoading ? <Text className="text-small text-muted">Loading products...</Text> : null}
            {productsQuery.error ? <Text className="text-small text-error">{productsQuery.error.message}</Text> : null}
          </View>
        </AppCard>

        <AppCard
          title="Order lines"
          subtitle="Add as many product and size combinations as needed."
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
                defaultAmountByProductId={productBasePriceById}
                amountLabel="Unit price"
                amountPlaceholder="49"
                canRemove={lines.length > 1}
                onChange={(nextLine) => updateLine(line.id, nextLine)}
                onRemove={() => removeLine(line.id)}
              />
            ))}
          </View>
        </AppCard>

        <AppCard title="Summary" subtitle="Review the order before saving the draft invoice.">
          <View className="gap-3">
            <Text className="text-small text-muted">Lines: {lines.length}</Text>
            <Text className="text-small text-muted">Estimated total: {currency.format(subtotal)}</Text>
            {formError ? <Text className="text-small text-error">{formError}</Text> : null}
            {createSalesOrder.error ? <Text className="text-small text-error">{createSalesOrder.error.message}</Text> : null}

            <View className="flex-row flex-wrap justify-end gap-2">
              <AppButton label="Add another product" size="sm" variant="secondary" onPress={addLine} />
              <AppButton label="Create sales order" size="sm" loading={createSalesOrder.isPending} onPress={() => void handleCreate()} />
            </View>
          </View>
        </AppCard>
      </View>
    </ScrollView>
  );
}
