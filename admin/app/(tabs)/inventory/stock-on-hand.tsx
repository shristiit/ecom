import { useEffect, useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppTable,
  AppTableCell,
  AppTableHeaderCell,
  AppTableRow,
  PageHeader,
} from '@admin/components/ui';
import { useStockOnHandQuery } from '@admin/features/inventory';

export default function StockOnHandScreen() {
  const [productName, setProductName] = useState('');
  const [sku, setSku] = useState('');
  const [locationId, setLocationId] = useState('');
  const [debouncedFilters, setDebouncedFilters] = useState({ productName: '', sku: '', locationId: '' });

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedFilters({
        productName: productName.trim(),
        sku: sku.trim(),
        locationId: locationId.trim(),
      });
    }, 250);

    return () => clearTimeout(timeout);
  }, [locationId, productName, sku]);

  const filters = useMemo(
    () => ({
      productName: debouncedFilters.productName || undefined,
      sku: debouncedFilters.sku || undefined,
      locationId: debouncedFilters.locationId || undefined,
    }),
    [debouncedFilters],
  );

  const hasActiveFilters = Boolean(filters.productName || filters.sku || filters.locationId);
  const query = useStockOnHandQuery(filters);
  const rows = query.data?.items ?? [];

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Stock on hand"
        subtitle="SKU-level position across active locations."
        actions={<AppButton label="Export" size="sm" variant="secondary" />}
      />

      <AppCard>
        {query.isLoading ? <Text className="text-small text-muted">Loading stock balances...</Text> : null}
        {query.error ? (
          <View className="gap-3">
            <Text className="text-small text-error">{query.error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}

        {!query.isLoading && !query.error ? (
          <View className="gap-4">
            <View className="gap-3">
              <AppInput
                label="Filter by product"
                placeholder="Blue denim jacket"
                value={productName}
                onChangeText={setProductName}
                autoCapitalize="words"
                autoCorrect={false}
              />
              <AppInput
                label="Filter by SKU"
                placeholder="STK-0006"
                value={sku}
                onChangeText={setSku}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <AppInput
                label="Filter by location"
                placeholder="Location UUID"
                value={locationId}
                onChangeText={setLocationId}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {hasActiveFilters ? (
                <View className="items-start">
                  <AppButton
                    label="Clear filters"
                    size="sm"
                    variant="secondary"
                    onPress={() => {
                      setProductName('');
                      setSku('');
                      setLocationId('');
                    }}
                  />
                </View>
              ) : null}
            </View>

            <AppTable>
              <AppTableRow header>
                <AppTableHeaderCell>SKU</AppTableHeaderCell>
                <AppTableHeaderCell>Product</AppTableHeaderCell>
                <AppTableHeaderCell>Location</AppTableHeaderCell>
                <AppTableHeaderCell align="right">On hand</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Reserved</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Available</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
              </AppTableRow>

              {rows.map((row) => (
                <AppTableRow key={`${row.sizeId ?? row.skuId}-${row.locationId}`}>
                  <AppTableCell>
                    {row.productId ? (
                      <Link href={`/products/${row.productId}`} asChild>
                        <Text className="text-small font-medium text-primary">{row.sku}</Text>
                      </Link>
                    ) : (
                      row.sku
                    )}
                  </AppTableCell>
                  <AppTableCell>{row.productName ?? '-'}</AppTableCell>
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
                  <AppTableCell align="right">
                    <AppBadge label={row.available > 5 ? 'healthy' : 'low'} tone={row.available > 5 ? 'success' : 'warning'} />
                  </AppTableCell>
                </AppTableRow>
              ))}

              {rows.length === 0 ? (
                <AppTableRow>
                  <AppTableCell className="min-w-full">
                    <Text className="text-small text-muted">
                      {hasActiveFilters ? 'No stock balances match those filters.' : 'No stock balances found.'}
                    </Text>
                  </AppTableCell>
                </AppTableRow>
              ) : null}
            </AppTable>
          </View>
        ) : null}
      </AppCard>
    </ScrollView>
  );
}
