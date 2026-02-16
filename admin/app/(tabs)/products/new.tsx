import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, AppCard, AppInput, AppSelect, PageHeader } from '@/components/ui';
import { useCreateProductMutation } from '@/features/products';

const categoryOptions = [
  { label: 'Tops', value: 'tops' },
  { label: 'Shirts', value: 'shirts' },
  { label: 'Bottoms', value: 'bottoms' },
  { label: 'Outerwear', value: 'outerwear' },
];

export default function ProductCreateScreen() {
  const router = useRouter();
  const createProduct = useCreateProductMutation();

  const [name, setName] = useState('');
  const [styleCode, setStyleCode] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [brand, setBrand] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (overrideStatus?: 'active' | 'inactive') => {
    setFormError(null);

    const parsedPrice = Number(basePrice);
    if (!name.trim() || !styleCode.trim()) {
      setFormError('Product name and style code are required.');
      return;
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setFormError('Base price must be a non-negative number.');
      return;
    }

    try {
      const created = await createProduct.mutateAsync({
        name: name.trim(),
        styleCode: styleCode.trim(),
        category,
        brand: brand.trim(),
        basePrice: Math.round(parsedPrice),
        status: overrideStatus ?? status,
      });
      router.replace(`/products/${created.id}`);
    } catch {
      // Surface API error through mutation state below.
    }
  };

  return (
    <ScrollView className="bg-bg px-6 py-6">
      <PageHeader title="Create Product" subtitle="Add a new catalog item with pricing and inventory defaults." />

      <View className="gap-4">
        <AppCard title="Product basics">
          <View className="gap-4">
            <AppInput label="Product name" placeholder="Core Cotton Tee" required value={name} onChangeText={setName} />
            <AppInput label="Style code" placeholder="CORE-TEE-001" required value={styleCode} onChangeText={setStyleCode} />
            <AppSelect
              label="Category"
              placeholder="Select category"
              value={category}
              options={categoryOptions}
              onValueChange={setCategory}
            />
            <AppInput label="Brand" placeholder="StockAisle" value={brand} onChangeText={setBrand} />
          </View>
        </AppCard>

        <AppCard title="Pricing & status">
          <View className="gap-4">
            <AppInput
              label="Base price"
              placeholder="49"
              keyboardType="decimal-pad"
              required
              value={basePrice}
              onChangeText={setBasePrice}
            />
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
        </AppCard>

        {formError ? <Text className="text-small text-error">{formError}</Text> : null}
        {createProduct.error ? <Text className="text-small text-error">{createProduct.error.message}</Text> : null}

        <View className="flex-row flex-wrap items-center gap-2">
          <AppButton label="Save product" onPress={() => void handleSubmit('active')} loading={createProduct.isPending} />
          <AppButton
            label="Save inactive"
            variant="secondary"
            onPress={() => void handleSubmit('inactive')}
            disabled={createProduct.isPending}
          />
          <Link href="/products" asChild>
            <AppButton label="Cancel" variant="tertiary" />
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}
