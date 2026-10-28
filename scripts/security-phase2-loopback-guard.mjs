// Test-only preload. Never import this from the application.
import net from 'node:net';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import { appendFileSync } from 'node:fs';

const local = host => ['127.0.0.1', '::1', 'localhost', '[::1]'].includes(String(host));
function refuse(host) {
  const error = new Error('PHASE2_EXTERNAL_NETWORK_BLOCKED');
  if (process.env.PHASE2_NETWORK_LOG) appendFileSync(process.env.PHASE2_NETWORK_LOG,
    JSON.stringify({ event: 'blocked-external-connection', host: String(host) }) + '\n');
  throw error;
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...input) {
  const args = Array.isArray(input[0]) ? input[0] : input;
  const options = args[0];
  const pipe = typeof options === 'string' ? options : options?.path;
  const localTsxPipe = typeof pipe === 'string' && process.env.TEMP
    && pipe.toLowerCase().startsWith(('\\\\?\\pipe\\' + process.env.TEMP + '\\tsx-').toLowerCase())
    && pipe.endsWith('.pipe');
  if (localTsxPipe) return connect.apply(this, input);
  const host = typeof options === 'object' && options !== null ? options.host ?? options.hostname ?? 'localhost'
    : typeof args[1] === 'string' ? args[1] : 'localhost';
  if (typeof options === 'string' || options?.path || !local(host)) refuse(options?.path ?? host);
  return connect.apply(this, input);
};
const lookup = dns.lookup;
dns.lookup = function (hostname, ...args) {
  if (!local(hostname)) refuse(hostname);
  return lookup.call(this, hostname, ...args);
};
syncBuiltinESMExports();
