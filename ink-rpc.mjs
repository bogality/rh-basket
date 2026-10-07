// CLI-only HTTP transport. Curl honors managed runtime proxy settings.
import { spawn } from 'node:child_process';
import { FetchRequest, JsonRpcProvider } from 'ethers';
import { INK } from './ink-engine.mjs';

export function inkProvider() {
  const request = new FetchRequest(process.env.INK_RPC_URL || INK.rpc);
  request.timeout = 60000;
  if (process.env.INK_RPC_CURL === '1') {
    request.getUrlFunc = req => new Promise((resolve, reject) => {
      const child = spawn('curl', ['-sS', '--connect-timeout', '10', '--max-time', '55',
        '-X', req.method, '-H', 'content-type: application/json', '--data-binary', '@-',
        '-w', '\n%{http_code}', req.url]);
      const parts = [], errors = [];
      child.stdout.on('data', data => parts.push(data));
      child.stderr.on('data', data => errors.push(data));
      child.on('error', reject);
      child.on('close', code => {
        if (code !== 0) return reject(new Error(`RPC transport failed (curl ${code}).`));
        const output = Buffer.concat(parts);
        const split = output.lastIndexOf(10);
        resolve({statusCode: Number(output.subarray(split+1).toString()), statusMessage: 'RPC response',
          headers: {}, body: new Uint8Array(output.subarray(0,split))});
      });
      child.stdin.end(req.body || '');
    });
  }
  return new JsonRpcProvider(request, 57073, {batchMaxCount:1, staticNetwork:true});
}
