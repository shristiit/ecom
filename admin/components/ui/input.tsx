import { Text, TextInput, TextInputProps, View } from 'react-native';

type InputProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  containerClassName?: string;
  inputClassName?: string;
};

export function AppInput({
  label,
  hint,
  error,
  required = false,
  containerClassName,
  inputClassName,
  ...props
}: InputProps) {
  const hasError = Boolean(error);

  return (
    <View className={`gap-2 ${containerClassName ?? ''}`.trim()}>
      {label ? (
        <Text className="text-small font-medium text-text">
          {label}
          {required ? <Text className="text-error"> *</Text> : null}
        </Text>
      ) : null}

      <TextInput
        placeholderTextColor="rgb(var(--text-subtle))"
        className={`${hasError ? 'border-error' : 'border-border'} rounded-md border bg-surface px-3 py-2.5 text-body text-text ${inputClassName ?? ''}`.trim()}
        {...props}
      />

      {error ? <Text className="text-caption text-error">{error}</Text> : null}
      {!error && hint ? <Text className="text-caption text-subtle">{hint}</Text> : null}
    </View>
  );
}
