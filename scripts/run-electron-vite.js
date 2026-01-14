#!/usr/bin/env node
/**
 * Wrapper script to run electron-vite with ELECTRON_RUN_AS_NODE unset.
 * This is needed because VS Code and Claude Code set ELECTRON_RUN_AS_NODE=1
 * which breaks Electron's module resolution.
 */

// Delete the environment variable that causes issues
delete process.env.ELECTRON_RUN_AS_NODE;

// Get the command from arguments
const args = process.argv.slice(2);
const command = args[0] || 'dev';

// Run electron-vite with the clean environment
const { spawn } = require('child_process');
const path = require('path');

// Use cross-spawn for better cross-platform support
const electronViteBin = path.join(__dirname, '..', 'node_modules', '.bin', 'electron-vite');

// On Windows, spawn .cmd files requires shell: true
const child = spawn(electronViteBin, args, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32'
});

child.on('close', (code) => {
  process.exit(code);
});
