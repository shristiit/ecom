import { ScrollView, Text, View } from 'react-native';
import { AppBadge, AppButton, AppCard, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow, PageHeader } from '@/components/ui';

const movementRows = [
  { sku: 'SBT-001-M-BLK', location: 'WH-01', action: 'Transfer In', qty: '+24', status: 'Posted' },
  { sku: 'LOS-014-L-NAT', location: 'STORE-02', action: 'Adjustment', qty: '-2', status: 'Review' },
  { sku: 'WTT-207-32-CHR', location: 'WH-02', action: 'Write-off', qty: '-1', status: 'Posted' },
];

export default function AdminInventory() {
  return (
    <ScrollView className="bg-bgPrimary px-6 py-6">
      <PageHeader
        title="Inventory"
        subtitle="Transfers, adjustments, receipts, write-offs, and count accuracy."
        actions={<AppButton label="New Movement" size="sm" />}
      />

      <View className="gap-4">
        <View className="flex-row gap-3">
          <AppCard className="flex-1" title="Stock Health">
            <Text className="text-display-3 font-bold text-text">98.6%</Text>
            <Text className="text-small text-muted">In-stock SKUs across active locations.</Text>
          </AppCard>

          <AppCard className="flex-1" title="Pending Reviews">
            <Text className="text-display-3 font-bold text-text">7</Text>
            <Text className="text-small text-muted">Adjustments awaiting supervisor approval.</Text>
          </AppCard>
        </View>

        <AppCard title="Recent Inventory Movements" subtitle="Latest posted and pending transactions.">
          <AppTable>
            <AppTableRow header>
              <AppTableHeaderCell>SKU</AppTableHeaderCell>
              <AppTableHeaderCell>Location</AppTableHeaderCell>
              <AppTableHeaderCell>Action</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Qty</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
            </AppTableRow>

            {movementRows.map((row) => (
              <AppTableRow key={`${row.sku}-${row.location}-${row.action}`}>
                <AppTableCell>{row.sku}</AppTableCell>
                <AppTableCell>{row.location}</AppTableCell>
                <AppTableCell>{row.action}</AppTableCell>
                <AppTableCell align="right">{row.qty}</AppTableCell>
                <AppTableCell align="right">
                  <AppBadge label={row.status} tone={row.status === 'Posted' ? 'success' : 'warning'} />
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTable>
        </AppCard>
      </View>
    </ScrollView>
  );
}
