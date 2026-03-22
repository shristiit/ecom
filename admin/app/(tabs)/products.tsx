import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import {
  AppBadge,
  AppButton,
  AppCard,
  PageShell,
  AppTable,
  AppTableCell,
  AppTableHeaderCell,
  AppTableRow,
  PageHeader,
} from '@/components/ui';
import { useProductsQuery } from '@/features/products';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function ProductsListScreen() {
  const { data, error, isLoading, refetch } = useProductsQuery({ page: 1, pageSize: 100 });
  const products = data?.items ?? [];

  return (
    <PageShell variant="products">
      <ScrollView className="px-6 py-6">
        <PageHeader
          title="Products"
          subtitle="Manage catalog records, variants, and sellable statuses."
          actions={
            <Link href="/products/new" asChild>
              <AppButton label="Create product" size="sm" />
            </Link>
          }
        />

        <AppCard title="Catalog" subtitle="Open a product to manage SKUs and location assignments.">
          {isLoading ? <Text className="text-small text-muted">Loading products...</Text> : null}
          {error ? (
            <View className="gap-3">
              <Text className="text-small text-error">{error.message}</Text>
              <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void refetch()} />
            </View>
          ) : null}

          {!isLoading && !error ? (
            <AppTable>
              <AppTableRow header>
                <AppTableHeaderCell>Product</AppTableHeaderCell>
                <AppTableHeaderCell>Style code</AppTableHeaderCell>
                <AppTableHeaderCell>Category</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Base price</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
              </AppTableRow>

              {products.map((product) => (
                <AppTableRow key={product.id}>
                  <AppTableCell>
                    <Link href={`/products/${product.id}`} asChild>
                      <Text className="text-small font-medium text-primary">{product.name}</Text>
                    </Link>
                  </AppTableCell>
                  <AppTableCell>{product.styleCode}</AppTableCell>
                  <AppTableCell>{product.category || '-'}</AppTableCell>
                  <AppTableCell align="right" className="tabular-nums">
                    {currency.format(Number(product.basePrice ?? 0))}
                  </AppTableCell>
                  <AppTableCell align="right">
                    <AppBadge label={product.status} tone={product.status === 'active' ? 'success' : 'default'} />
                  </AppTableCell>
                </AppTableRow>
              ))}

              {products.length === 0 ? (
                <AppTableRow>
                  <AppTableCell className="min-w-full">
                    <Text className="text-small text-muted">No products found.</Text>
                  </AppTableCell>
                </AppTableRow>
              ) : null}
            </AppTable>
          ) : null}
        </AppCard>
      </ScrollView>
    </PageShell>
  );
}
