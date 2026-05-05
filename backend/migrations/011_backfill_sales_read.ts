/* eslint-disable */
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    UPDATE roles
    SET permissions = array_append(permissions, 'sales.read')
    WHERE permissions @> ARRAY['sales.write']::text[]
      AND NOT permissions @> ARRAY['sales.read']::text[];
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    UPDATE roles
    SET permissions = array_remove(permissions, 'sales.read')
    WHERE permissions @> ARRAY['sales.write']::text[]
      AND permissions @> ARRAY['sales.read']::text[];
  `);
}
