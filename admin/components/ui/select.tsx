import { Check, ChevronDown } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppButton } from './button';
import { AppModal } from './modal';

export type SelectOption = {
  label: string;
  value: string;
  description?: string;
};

type AppSelectProps = {
  label?: string;
  placeholder?: string;
  value?: string | null;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  modalTitle?: string;
  className?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function AppSelect({
  label,
  placeholder = 'Select an option',
  value,
  options,
  onValueChange,
  hint,
  error,
  required = false,
  disabled = false,
  modalTitle,
  className,
  accessibilityLabel,
  accessibilityHint,
}: AppSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const closeModal = () => setIsOpen(false);

  const selectOption = (nextValue: string) => {
    onValueChange(nextValue);
    closeModal();
  };

  return (
    <View className={`gap-2 ${className ?? ''}`.trim()}>
      {label ? (
        <Text className="text-small font-medium text-text">
          {label}
          {required ? <Text className="text-error"> *</Text> : null}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? 'Selection field'}
        accessibilityHint={accessibilityHint ?? error ?? hint ?? `Opens options for ${label ?? 'this field'}.`}
        accessibilityState={{
          disabled,
          expanded: isOpen,
        }}
        className={`${error ? 'border-error' : 'border-border'} flex-row items-center justify-between rounded-md border bg-surface px-3 py-2.5 ${disabled ? 'opacity-50' : ''}`}
        disabled={disabled}
        onPress={() => setIsOpen(true)}
      >
        <Text className={`text-body ${selectedOption ? 'text-text' : 'text-subtle'}`}>
          {selectedOption?.label ?? placeholder}
        </Text>
        <ChevronDown size={16} color="#64748B" />
      </Pressable>

      {error ? <Text className="text-caption text-error">{error}</Text> : null}
      {!error && hint ? <Text className="text-caption text-subtle">{hint}</Text> : null}

      <AppModal
        isOpen={isOpen}
        onClose={closeModal}
        title={modalTitle ?? label ?? 'Select'}
        footer={<AppButton label="Close" variant="secondary" size="sm" onPress={closeModal} />}
      >
        <View className="gap-2">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityHint={option.description ?? `Select ${option.label}.`}
                accessibilityState={{ selected: isSelected }}
                className={`rounded-md border px-3 py-3 ${isSelected ? 'border-primary bg-primary-tint' : 'border-border bg-surface-2'}`}
                onPress={() => selectOption(option.value)}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 gap-0.5">
                    <Text className={`text-small font-medium ${isSelected ? 'text-primary' : 'text-text'}`}>
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text className="text-caption text-muted">{option.description}</Text>
                    ) : null}
                  </View>
                  {isSelected ? <Check size={16} color="#1F3A5F" /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </AppModal>
    </View>
  );
}
