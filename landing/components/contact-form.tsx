import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { HeroButton, MS_FORMS_URL, SurfaceCard } from './marketing-shell';

type FormValues = {
  fullName: string;
  companyName: string;
  workEmail: string;
  phone: string;
  message: string;
};

const initialValues: FormValues = {
  fullName: '',
  companyName: '',
  workEmail: '',
  phone: '',
  message: '',
};

async function submitContactForm(values: FormValues) {
  if (!MS_FORMS_URL.trim()) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    return { ok: true };
  }

  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => {
    formData.append(key, String(value));
  });

  await fetch(MS_FORMS_URL, {
    method: 'POST',
    mode: 'no-cors',
    body: formData,
  });

  return { ok: true };
}

function InputShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="min-w-[260px] flex-1 gap-2">
      <Text className="text-[15px] font-semibold text-text">{label}</Text>
      {children}
    </View>
  );
}

function FieldInput({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      keyboardType={keyboardType}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      className={`rounded-[20px] border border-border bg-surface px-4 text-base text-text ${multiline ? 'min-h-[150px] py-4' : 'min-h-[56px]'}`}
      placeholderTextColor="rgba(88,101,122,0.72)"
    />
  );
}

export function ContactForm({
  title = 'Request a demo',
  intro = 'We will get back to you shortly.',
}: {
  title?: string;
  intro?: string;
}) {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [feedback, setFeedback] = useState('');

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const validate = () => {
    if (!values.fullName.trim() || !values.workEmail.trim() || !values.phone.trim() || !values.message.trim()) {
      return 'Please complete the required fields.';
    }

    if (!values.workEmail.includes('@')) {
      return 'Enter a valid work email address.';
    }

    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setStatus('error');
      setFeedback(validationError);
      return;
    }

    setStatus('submitting');
    setFeedback('');

    try {
      await submitContactForm(values);
      setStatus('success');
      setValues(initialValues);
    } catch (error) {
      console.error(error);
      setStatus('error');
      setFeedback('The request could not be sent right now. Please try again.');
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setFeedback('');
  };

  if (status === 'success') {
    return (
      <SurfaceCard className="gap-5">
        <Text className="font-display text-[42px] leading-[46px] tracking-[-1px] text-text">{title}</Text>
        <Text className="font-display text-[34px] leading-[38px] tracking-[-0.8px] text-text">
          Thank you. We will be in touch shortly.
        </Text>
        <Text className="text-base leading-7 text-muted">Your request has been received.</Text>
        <HeroButton label="Send another request" variant="secondary" onPress={handleReset} />
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard className="gap-6">
      <View className="gap-3">
        <Text className="font-display text-[42px] leading-[46px] tracking-[-1px] text-text">{title}</Text>
        <Text className="max-w-[520px] text-base leading-7 text-muted">{intro}</Text>
      </View>

      <View className="flex-row flex-wrap gap-4">
        <InputShell label="Full name">
          <FieldInput value={values.fullName} onChangeText={(text) => setField('fullName', text)} placeholder="Jane Smith" />
        </InputShell>

        <InputShell label="Company name">
          <FieldInput value={values.companyName} onChangeText={(text) => setField('companyName', text)} placeholder="Northshore Wholesale" />
        </InputShell>

        <InputShell label="Work email">
          <FieldInput
            value={values.workEmail}
            onChangeText={(text) => setField('workEmail', text)}
            placeholder="jane@company.com"
            keyboardType="email-address"
          />
        </InputShell>

        <InputShell label="Phone">
          <FieldInput
            value={values.phone}
            onChangeText={(text) => setField('phone', text)}
            placeholder="+44 20 7946 0000"
            keyboardType="phone-pad"
          />
        </InputShell>

        <View className="w-full">
          <InputShell label="Message">
            <FieldInput
              value={values.message}
              onChangeText={(text) => setField('message', text)}
              placeholder="Tell us about your current stock process, number of locations, and what you want to improve."
              multiline
            />
          </InputShell>
        </View>
      </View>

      <Text className="text-sm leading-6 text-muted">We will get back to you shortly.</Text>

      {feedback ? (
        <Text className={`text-sm leading-6 ${status === 'error' ? 'text-error' : 'text-success'}`}>{feedback}</Text>
      ) : null}

      <View className="w-fit">
        <HeroButton label={status === 'submitting' ? 'Submitting...' : 'Book a Demo'} onPress={handleSubmit} />
      </View>
    </SurfaceCard>
  );
}
