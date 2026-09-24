import { spawn } from 'node:child_process';
const api = spawn(process.execPath, ['--watch', '--import', 'tsx', '--env-file-if-exists=.env', 'apps/api/src/server.ts'], { stdio: 'inherit' });
const web = spawn('pnpm', ['--filter', '@olimp/web', 'dev'], { stdio: 'inherit', shell: process.platform === 'win32' });
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill('SIGTERM'); web.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of [api, web]) {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => stop(code ?? 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
