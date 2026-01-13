import { ipcMain } from 'electron';
import { getAuthManager } from '../auth';

export function registerAuthHandlers(): void {
  const auth = getAuthManager();

  // Initialize and check credentials
  ipcMain.handle('auth:initialize', async () => {
    return auth.initialize();
  });

  // Get current auth state
  ipcMain.handle('auth:getState', () => {
    return auth.getState();
  });

  // Set manual credentials
  ipcMain.handle('auth:setCredentials', (_event, type: 'oauth' | 'api_key', value: string) => {
    auth.setManualCredentials(type, value);
    return auth.getState();
  });

  // Clear credentials
  ipcMain.handle('auth:clearCredentials', () => {
    auth.clearCredentials();
    return auth.getState();
  });

  // Check if authenticated
  ipcMain.handle('auth:isAuthenticated', () => {
    return auth.isAuthenticated();
  });
}
