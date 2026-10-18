#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/cc87571028cf1461ebbc949681bae339f12c61a976de9f88fcfaa84261b262d8/contract';
import endContract from '../../snapshots/cc87571028cf1461ebbc949681bae339f12c61a976de9f88fcfaa84261b262d8/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e2be0ab069ca13d5f54a3f2daab5a6a83faa5d7beb6882d6d3984fae21149153/contract';
import startContract from '../../snapshots/e2be0ab069ca13d5f54a3f2daab5a6a83faa5d7beb6882d6d3984fae21149153/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'matching_rules',
        columns: [
          col('auto_post', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'character varying(500)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 500 } },
          }),
          col('description_pattern', 'character varying(500)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 500 } },
          }),
          col('exact_amount', 'numeric(12,2)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('last_matched_at', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('match_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('match_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('max_amount', 'numeric(12,2)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
          col('min_amount', 'numeric(12,2)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
          col('name', 'character varying(200)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('priority', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('reference_pattern', 'character varying(200)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('scheme_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('target_account_code_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('target_fund_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('transaction_sign', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'bank_transactions',
        column: col('matching_rule_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'matching_rules',
        index: 'matching_rules_scheme_id_is_active_idx',
        columns: ['scheme_id', 'is_active'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'matching_rules',
        foreignKey: {
          name: 'matching_rules_scheme_id_fkey',
          columns: ['scheme_id'],
          references: { schema: 'public', table: 'schemes', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'matching_rules',
        foreignKey: {
          name: 'matching_rules_target_account_code_id_fkey',
          columns: ['target_account_code_id'],
          references: { schema: 'public', table: 'account_codes', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'matching_rules',
        foreignKey: {
          name: 'matching_rules_target_fund_id_fkey',
          columns: ['target_fund_id'],
          references: { schema: 'public', table: 'funds', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'bank_transactions',
        foreignKey: {
          name: 'bank_transactions_matching_rule_id_fkey',
          columns: ['matching_rule_id'],
          references: { schema: 'public', table: 'matching_rules', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
