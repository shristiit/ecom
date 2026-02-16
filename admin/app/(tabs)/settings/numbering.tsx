import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, AppCard, AppInput, PageHeader } from '@/components/ui';
import { useSaveSettingsNumberingMutation, useSettingsNumberingQuery } from '@/features/settings';

export default function SettingsNumberingScreen() {
  const query = useSettingsNumberingQuery();
  const saveNumbering = useSaveSettingsNumberingMutation();

  const [salesOrderPattern, setSalesOrderPattern] = useState('');
  const [purchaseOrderPattern, setPurchaseOrderPattern] = useState('');
  const [invoicePattern, setInvoicePattern] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) return;
    setSalesOrderPattern(query.data.salesOrderPattern);
    setPurchaseOrderPattern(query.data.purchaseOrderPattern);
    setInvoicePattern(query.data.invoicePattern);
  }, [query.data]);

  const handleSave = async () => {
    await saveNumbering.mutateAsync({
      salesOrderPattern: salesOrderPattern.trim(),
      purchaseOrderPattern: purchaseOrderPattern.trim(),
      invoicePattern: invoicePattern.trim(),
    });
    setMessage('Numbering rules saved.');
    await query.refetch();
  };

  return (
    <ScrollView className="bg-bg px-6 py-6">
      <PageHeader title="Settings · Numbering" subtitle="Document sequence and prefix patterns." />

      <View className="gap-4">
        <AppCard title="Sequences">
          <View className="gap-3">
            {query.isLoading ? <Text className="text-small text-muted">Loading numbering...</Text> : null}
            {query.error ? <Text className="text-small text-error">{query.error.message}</Text> : null}
            <AppInput label="Sales Order pattern" placeholder="SO-{YYYY}-{####}" value={salesOrderPattern} onChangeText={setSalesOrderPattern} />
            <AppInput label="Purchase Order pattern" placeholder="PO-{YYYY}-{####}" value={purchaseOrderPattern} onChangeText={setPurchaseOrderPattern} />
            <AppInput label="Invoice pattern" placeholder="INV-{YYYY}-{####}" value={invoicePattern} onChangeText={setInvoicePattern} />
            {message ? <Text className="text-small text-success">{message}</Text> : null}
            <AppButton label="Save numbering" size="sm" onPress={() => void handleSave()} loading={saveNumbering.isPending} />
          </View>
        </AppCard>
      </View>
    </ScrollView>
  );
}
