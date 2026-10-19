import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Testing Library only cleans up automatically when Vitest globals are enabled.
afterEach(() => cleanup());

// Nothing under test may reach the network: the latest-release lookup sees "no release yet" unless a test stubs fetch itself.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});
