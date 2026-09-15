import { spawn } from 'node:child_process';

const npmCli = process.env.npm_execpath;
if (npmCli === undefined) throw new Error('npm_execpath is required to build the E2E package.');

const child = spawn(process.execPath, [npmCli, 'run', 'package'], {
  env: { ...process.env, MANGABOUND_E2E: '1' },
  stdio: 'inherit',
  windowsHide: true,
});

child.once('error', (error) => {
  throw error;
});
child.once('exit', (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
