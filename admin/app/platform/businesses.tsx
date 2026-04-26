import { Link } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppBadge, AppCard, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow, PageHeader, PageShell } from '@admin/components/ui';
import { queryKeys, useQuery } from '@admin/lib/query';
import { platformService } from '@admin/features/platform/services/platform.service';

export default function PlatformBusinessesScreen() {
  const query = useQuery({
    key: queryKeys.platform.businesses(),
    queryFn: () => platformService.listBusinesses(),
  });

  useEffect(() => {
    const intervalId = setInterval(() => {
      void query.refetch();
    }, 10000);
    return () => clearInterval(intervalId);
  }, [query.refetch]);

  const rows = query.data ?? [];

  return (
    <PageShell>
      <ScrollView className="px-6 py-6">
        <PageHeader
          title="Businesses"
          subtitle="Manage tenant lifecycle status, limits, features, billing references, and restrictions."
        />

        <AppCard title="Registered businesses" subtitle="Each tenant is isolated and managed centrally from the platform console.">
          <AppTable>
            <AppTableRow header>
              <AppTableHeaderCell>Business</AppTableHeaderCell>
              <AppTableHeaderCell>Status</AppTableHeaderCell>
              <AppTableHeaderCell>Plan</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Users</AppTableHeaderCell>
              <AppTableHeaderCell align="right">SKU usage</AppTableHeaderCell>
            </AppTableRow>

            {rows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>
                  <Link href={`/platform/businesses/${row.id}`}>{row.name}</Link>
                  <Text className="text-caption text-muted">{row.slug}</Text>
                </AppTableCell>
                <AppTableCell>
                  <View className="gap-2">
                    <AppBadge label={row.lifecycle_status} tone={row.lifecycle_status === 'active' ? 'success' : 'warning'} />
                    {row.write_blocked ? <AppBadge label="Writes blocked" tone="warning" /> : null}
                  </View>
                </AppTableCell>
                <AppTableCell>{row.plan_code}</AppTableCell>
                <AppTableCell align="right">{row.user_count}</AppTableCell>
                <AppTableCell align="right">
                  {row.sku_count} / {row.max_skus}
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTable>
          {rows.length === 0 ? <Text className="mt-4 text-small text-muted">No businesses found.</Text> : null}
        </AppCard>
      </ScrollView>
    </PageShell>
  );
}
