/* eslint-disable */
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    UPDATE roles
    SET permissions = array_append(permissions, 'purchasing.read')
    WHERE permissions @> ARRAY['purchasing.write']::text[]
      AND NOT permissions @> ARRAY['purchasing.read']::text[];
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    UPDATE roles
    SET permissions = array_remove(permissions, 'purchasing.read')
    WHERE permissions @> ARRAY['purchasing.write']::text[]
      AND permissions @> ARRAY['purchasing.read']::text[];
  `);
}
