import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';

function gitValue(...args: string[]) {
  try { return execFileSync('git', args, { encoding: 'utf8', timeout: 1500 }).trim(); }
  catch { return 'DEV UNKNOWN'; }
}

export default defineConfig({
  plugins: [{
    name: 'qimen-build-fingerprint',
    resolveId(id) { return id === 'virtual:qimen-build' ? '\0virtual:qimen-build' : null; },
    load(id) {
      if (id !== '\0virtual:qimen-build') return null;
      return `export const buildBranch = ${JSON.stringify(gitValue('branch', '--show-current'))};\n` +
        `export const buildCommit = ${JSON.stringify(gitValue('rev-parse', '--short', 'HEAD'))};`;
    },
  }],
  server: {
    host: 'localhost',
    port: 5173,
  },
  preview: {
    host: 'localhost',
    port: 4173,
  },
});
