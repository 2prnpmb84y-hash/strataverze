/**
 * Custom error class so callers can distinguish authorisation failures from
 * unexpected errors without inspecting message strings. In its own module so
 * every auth helper can import it without circular imports.
 */
export class AuthorisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorisationError";
  }
}
