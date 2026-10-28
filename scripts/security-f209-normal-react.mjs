// Test-only: permit server-only modules while retaining ordinary React for real PDF rendering.
// The separate loopback guard and isolated emulator configuration remain mandatory.
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true };
  return next(specifier, context);
} });
