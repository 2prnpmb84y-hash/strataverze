/**
 * Global test setup for Vitest.
 *
 * This file runs before each test file and configures the test
 * environment (mocks, globals, etc.).
 */

import { vi } from "vitest";

// Suppress console.error in tests unless explicitly expected
// (comment out during debugging if needed)
vi.spyOn(console, "error").mockImplementation(() => {});
