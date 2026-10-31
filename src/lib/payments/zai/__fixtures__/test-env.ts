/**
 * Settings for tests only. Every value is a placeholder, not a credential:
 * no test reaches Zai (the transport is always a mock).
 */
import type { ZaiConfig } from "../config";

export const TEST_ENV: Record<string, string> = {
  ZAI_PAYMENTS: "on",
  ZAI_ENVIRONMENT: "prelive",
  ZAI_API_BASE_URL: "https://test.api.promisepay.com",
  ZAI_AUTH_TOKEN_URL: "https://auth.example.test/tokens",
  ZAI_CLIENT_ID: "placeholder-client-id",
  ZAI_CLIENT_SECRET: "placeholder-not-a-secret",
  ZAI_SCOPE: "placeholder-scope",
  ZAI_WEBHOOK_SECRET: "placeholder-webhook-key-32-chars-or-more",
};

export const TEST_CONFIG: ZaiConfig = {
  environment: "prelive",
  apiBaseUrl: "https://test.api.promisepay.com",
  tokenUrl: "https://auth.example.test/tokens",
  clientId: "placeholder-client-id",
  clientSecret: "placeholder-not-a-secret",
  scope: "placeholder-scope",
  webhookSecret: "placeholder-webhook-key-32-chars-or-more",
  webhookToleranceSeconds: 300,
  receiptActorId: null,
  receiptDebitFrom: null,
};
