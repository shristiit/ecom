import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { AppButton, AppInput, AppModal } from '@/components/ui';

export type TransactionField = {
  key: string;
  label: string;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad';
  required?: boolean;
};

type TransactionFormModalProps = {
  isOpen: boolean;
  title: string;
  description: string;
  fields: TransactionField[];
  submitLabel: string;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
};

export function TransactionFormModal({
  isOpen,
  title,
  description,
  fields,
  submitLabel,
  loading = false,
  error,
  onClose,
  onSubmit,
}: TransactionFormModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const initial: Record<string, string> = {};
    fields.forEach((field) => {
      initial[field.key] = '';
    });
    setValues(initial);
    setValidationError(null);
  }, [fields, isOpen]);

  const setField = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setValidationError(null);
    const missing = fields.find((field) => field.required && !values[field.key]?.trim());
    if (missing) {
      setValidationError(`${missing.label} is required.`);
      return;
    }
    await onSubmit(values);
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <View className="flex-row justify-end gap-2">
          <AppButton label="Cancel" variant="secondary" size="sm" onPress={onClose} />
          <AppButton label={submitLabel} size="sm" onPress={() => void handleSubmit()} loading={loading} />
        </View>
      }
    >
      <View className="gap-3">
        {fields.map((field) => (
          <AppInput
            key={field.key}
            label={field.label}
            required={field.required}
            placeholder={field.placeholder}
            keyboardType={field.keyboardType}
            value={values[field.key] ?? ''}
            onChangeText={(value) => setField(field.key, value)}
          />
        ))}
        {validationError ? <Text className="text-small text-error">{validationError}</Text> : null}
        {error ? <Text className="text-small text-error">{error}</Text> : null}
      </View>
    </AppModal>
  );
}
