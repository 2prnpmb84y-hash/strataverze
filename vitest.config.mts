import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Run every test in one fixed time zone, whatever the machine's own zone is.
// Some screens format timestamps with the runtime's local zone (for example
// the audit trail and committee pack times, and the cutover "Executed" line),
// so golden snapshots recorded on a machine in UTC+7 failed on the UTC CI
// runner. Set here, before the workers start, so each worker inherits it.
// UTC matches the GitHub runner and the server runtime.
process.env.TZ = "UTC";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
    },
  },
});
