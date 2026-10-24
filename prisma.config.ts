import 'dotenv/config';
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig, prisma7Schema } from '@prisma/orm-postgres/config';
import { resolve } from 'node:path';
import { cliConnectionString } from './src/prisma/connection';

// Database commands use verified TLS too (S8, SEC-017). The CA is the same
// Supabase Root 2021 certificate the app bundles, as a file for the driver.
const CA_FILE = resolve(process.cwd(), 'prisma/certs/supabase-prod-ca-2021.crt');

export default definePrismaConfig({
  orm: ormConfig({
    contract: prisma7Schema("./prisma/schema.prisma"),
    output: "src/prisma",
    db: {
      connection: cliConnectionString(process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'], CA_FILE),
    },
  }),
  skills: {
    agents: ["claude", "cursor", "agents", "devin"],
  },
});
