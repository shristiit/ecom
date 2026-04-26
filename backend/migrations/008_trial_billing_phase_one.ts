/* eslint-disable */
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('tenant_subscriptions', {
    trial_starts_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    trial_ends_at: { type: 'timestamptz', notNull: true, default: pgm.func("now() + interval '15 days'") },
    billing_setup_status: { type: 'text', notNull: true, default: 'not_started' },
  });

  pgm.alterColumn('tenant_payment_methods', 'status', { default: 'not_started' });

  pgm.sql(`
    UPDATE tenant_subscriptions
    SET trial_starts_at = COALESCE(current_period_start, created_at, NOW()),
        trial_ends_at = COALESCE(current_period_start + INTERVAL '15 days', created_at + INTERVAL '15 days', NOW() + INTERVAL '15 days'),
        billing_setup_status = CASE
          WHEN provider_mandate_id IS NOT NULL OR provider_customer_id IS NOT NULL OR provider_subscription_id IS NOT NULL THEN 'pending'
          ELSE 'not_started'
        END
  `);

  pgm.sql(`
    UPDATE tenant_payment_methods
    SET status = CASE
      WHEN status = 'pending' THEN 'not_started'
      ELSE status
    END
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.alterColumn('tenant_payment_methods', 'status', { default: 'pending' });
  pgm.dropColumns('tenant_subscriptions', ['trial_starts_at', 'trial_ends_at', 'billing_setup_status']);
}
