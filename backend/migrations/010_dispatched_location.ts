/* eslint-disable */
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('invoices', {
    dispatched_location_id: {
      type: 'uuid',
      references: 'locations',
      onDelete: 'set null',
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('invoices', ['dispatched_location_id']);
}
