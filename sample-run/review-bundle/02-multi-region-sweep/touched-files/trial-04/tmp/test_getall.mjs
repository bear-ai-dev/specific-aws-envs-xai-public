import { createRequire } from 'module';
const require = createRequire(process.cwd() + '/package.json');

// Use ts-node/register via child? Better compile with tsc or use dynamic import after compiling just the file.
// We'll spawn ts-node in CJS mode.
