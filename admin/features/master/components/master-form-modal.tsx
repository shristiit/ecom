import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { AppButton, AppInput, AppModal } from '@admin/components/ui';

export type MasterFormField = {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
};

type MasterFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  fields: MasterFormField[];
  initialValues?: Record<string, string>;
  loading?: boolean;
  error?: string | null;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
};

export function MasterFormModal({
  isOpen,
  onClose,
  title,
  submitLabel,
  fields,
  initialValues,
  loading = false,
  error,
  onSubmit,
}: MasterFormModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const next: Record<string, string> = {};
    fields.forEach((field) => {
      next[field.key] = initialValues?.[field.key] ?? '';
    });
    setValues(next);
    setValidationError(null);
  }, [fields, initialValues, isOpen]);

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
      footer={
        <View className="flex-row justify-end gap-2">
          <AppButton label="Cancel" size="sm" variant="secondary" onPress={onClose} />
          <AppButton label={submitLabel} size="sm" loading={loading} onPress={() => void handleSubmit()} />
        </View>
      }
    >
      <View className="gap-3">
        {fields.map((field) => (
          <AppInput
            key={field.key}
            label={field.label}
            placeholder={field.placeholder}
            required={field.required}
            value={values[field.key] ?? ''}
            onChangeText={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))}
          />
        ))}
        {validationError ? <Text className="text-small text-error">{validationError}</Text> : null}
        {error ? <Text className="text-small text-error">{error}</Text> : null}
      </View>
    </AppModal>
  );
}
