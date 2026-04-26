export type TenantBillingSummary = {
  planCode: string;
  planName: string;
  monthlyPrice: number;
  currency: string;
  monthlyPriceLabel: string;
  lifecycleStatus: string;
  provider: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  billingStatus: string;
  paymentSetupStatus: string;
  billingContact: {
    name: string;
    email: string;
  };
  paymentMethod: {
    provider: string;
    providerPaymentMethodId: string | null;
    accountName: string;
    accountMask: string;
    status: string;
    metadata: Record<string, unknown>;
  };
};
