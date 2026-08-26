import { createRequire } from 'module';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Use ts-node/register via require for CommonJS interop
const require = createRequire(import.meta.url);
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    esModuleInterop: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
  },
});

// Handle .js -> .ts mapping like the project
const Module = require('module');
const orig = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  try {
    return orig.call(this, request, parent, isMain, options);
  } catch (e) {
    if (request.endsWith('.js')) {
      const tsReq = request.replace(/\.js$/, '.ts');
      try {
        return orig.call(this, tsReq, parent, isMain, options);
      } catch (_) {}
    }
    throw e;
  }
};

const { getAllVolumes, getAllSnapshots } = require('./src/utils/aws/awsEc2.ts');

async function main() {
  const creds = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
  console.log('calling getAllVolumes');
  const volumes = await getAllVolumes(creds);
  console.log('VOLUMES KEYS', Object.keys(volumes));
  for (const [region, vols] of Object.entries(volumes)) {
    console.log(region, 'count', vols.length);
  }

  console.log('calling getAllSnapshots');
  const snaps = await getAllSnapshots(creds);
  console.log('SNAPSHOT KEYS', Object.keys(snaps));
  for (const [region, s] of Object.entries(snaps)) {
    console.log(region, 'count', s.length);
  }
}
main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
