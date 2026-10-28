// Local-only emulator controller; avoids the CLI entry point's remote MOTD/update check.
import { createRequire } from 'node:module';
import path from 'node:path';
import { readFileSync, appendFileSync } from 'node:fs';
const [cliFile, workspace, configFile] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const cliRoot = path.dirname(path.dirname(path.dirname(cliFile)));
const { Config } = require(path.join(cliRoot, 'lib/config.js'));
const controller = require(path.join(cliRoot, 'lib/emulator/controller.js'));
if (process.env.GOOGLE_CLOUD_PROJECT !== 'demo-phase2-local' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8287') throw new Error('Local demo configuration required');
const data = JSON.parse(readFileSync(configFile, 'utf8').replace(/^\uFEFF/, ''));
data.firestore.rules = 'firestore.rules'; data.storage.rules = 'storage.rules';
appendFileSync(path.join(process.cwd(), 'controller-events.log'), 'starting local controller\n');
await controller.startAll({ project: 'demo-phase2-local', projectId: 'demo-phase2-local', only: 'auth,firestore,storage',
  config: new Config(data, { projectDir: workspace }), nonInteractive: true, ui: false }, false, true);
appendFileSync(path.join(process.cwd(), 'controller-events.log'), 'local emulators ready\n');
setInterval(() => {}, 1000);
