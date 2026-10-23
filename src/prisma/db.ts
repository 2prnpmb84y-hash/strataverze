import 'dotenv/config';
import { Pool } from 'pg';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };
import { databaseConnection } from './connection';

// TLS to the database, with the server's certificate checked (S8, SEC-017).
// See connection.ts for the rules and the DATABASE_SSL settings.
const connection = databaseConnection();
if (connection.warning) console.warn(`[db] ${connection.warning}`);

const pool = new Pool({ connectionString: connection.connectionString, ssl: connection.ssl });

export const db = postgres<Contract>({
  contractJson,
  pg: pool,
});
