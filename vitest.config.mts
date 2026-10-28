import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Run every test in one fixed time zone, whatever the machine's own zone is.
// Code that formats a timestamp in the runtime's local zone gives a different
// result on each machine (golden snapshots recorded in UTC+7 failed on the UTC
// CI runner), and UTC also shows when a screen forgets the building's zone.
// Set here, before the workers start, so each worker inherits it.
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
