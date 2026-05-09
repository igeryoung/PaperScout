// In Vitest, the real `server-only` package throws because it detects a non-RSC runtime.
// We never run real server-only enforcement in tests; this stub satisfies the import.
export {};
