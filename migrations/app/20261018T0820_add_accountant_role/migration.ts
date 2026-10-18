#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/b9a382f1b4e30d14a55041910b7151ab9d44c8de837bd397115b61fcd06a7dd7/contract';
import endContract from '../../snapshots/b9a382f1b4e30d14a55041910b7151ab9d44c8de837bd397115b61fcd06a7dd7/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/cc87571028cf1461ebbc949681bae339f12c61a976de9f88fcfaa84261b262d8/contract';
import startContract from '../../snapshots/cc87571028cf1461ebbc949681bae339f12c61a976de9f88fcfaa84261b262d8/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addNativeEnumValue({ schema: 'public', typeName: 'PortalRole', value: 'ACCOUNTANT' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
