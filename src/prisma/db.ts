import 'dotenv/config';
import { contractFromJson } from '@prisma/orm-postgres/static';
import { Pool } from 'pg';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };
import { databaseConnection } from './connection';

export const contract = contractFromJson<Contract>(contractJson);

// TLS to the database, with the server's certificate checked (S8, SEC-017).
// See connection.ts for the rules and the DATABASE_SSL settings.
const connection = databaseConnection();
if (connection.warning) console.warn(`[db] ${connection.warning}`);

// The same timeouts Prisma's own pool uses, so a busy or unreachable pooler
// fails after 20 seconds instead of waiting until the function times out.
const pool = new Pool({
  connectionString: connection.connectionString,
  ssl: connection.ssl,
  connectionTimeoutMillis: 20_000,
  idleTimeoutMillis: 30_000,
});

export const db = postgres({
  contract,
  pg: pool,
});
