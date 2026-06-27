import { app, BrowserWindow, session, utilityProcess, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: 'StreamPro IPTV',
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    autoHideMenuBar: true
  });

  // Log renderer console to terminal
  mainWindow.webContents.on('console-message', (event) => {
    console.log(`[Renderer] ${event.message}`);
  });

  if (app.isPackaged) {
    // Production: delay loading so the Express backend has time to bind to port 3001.
    // Without this, the React app loads instantly via loadFile(), makes API calls before
    // the server is ready, gets ECONNREFUSED, and shows a "Cannot connect" error.
    setTimeout(() => {
      mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }, 3500);
  } else {
    // Development: load from the Vite dev server.
    // Same 3.5s delay to let the Express backend fully start binding to its port first.
    setTimeout(() => {
      mainWindow.loadURL('http://localhost:5173');
    }, 3500);
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

const userDataPath = app.getPath('userData');
const hwAccelConfigFile = path.join(userDataPath, 'hw-accel.json');

try {
  if (fs.existsSync(hwAccelConfigFile)) {
    const hwConfig = JSON.parse(fs.readFileSync(hwAccelConfigFile, 'utf-8'));
    if (hwConfig.disableHardwareAcceleration) {
      console.log('Hardware acceleration is disabled via config.');
      app.disableHardwareAcceleration();
    }
  }
} catch (e) {
  console.error('Failed to read hw-accel config:', e);
}

ipcMain.on('set-hw-accel', (event, disable) => {
  try {
    fs.writeFileSync(hwAccelConfigFile, JSON.stringify({ disableHardwareAcceleration: disable }));
    console.log('Hardware acceleration config saved. Disable =', disable);
  } catch (e) {
    console.error('Failed to save hw-accel config:', e);
  }
});

ipcMain.on('get-hw-accel', (event) => {
  try {
    if (fs.existsSync(hwAccelConfigFile)) {
      const hwConfig = JSON.parse(fs.readFileSync(hwAccelConfigFile, 'utf-8'));
      event.returnValue = !!hwConfig.disableHardwareAcceleration;
      return;
    }
  } catch (e) {}
  event.returnValue = false;
});

ipcMain.handle('read-epg-cache', async () => {
  try {
    const cachePath = path.join(__dirname, 'server', 'epg_cache.json');
    if (fs.existsSync(cachePath)) {
      const stats = fs.statSync(cachePath);
      const hoursOld = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
      if (hoursOld > 12) {
        console.log(`[IPC Cache] epg_cache.json is ${hoursOld.toFixed(1)} hours old. Expiring...`);
        fs.unlinkSync(cachePath);
        return null;
      }
      return fs.readFileSync(cachePath, 'utf8');
    }
    return null;
  } catch (err) {
    return null;
  }
});

ipcMain.handle('save-epg-cache', async (event, dataStr) => {
  try {
    const cachePath = path.join(userDataPath, 'frontend_epg_cache.json');
    fs.writeFileSync(cachePath, dataStr, 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to save EPG cache', err);
    return false;
  }
});

app.whenReady().then(() => {
  // Force completely clear Electron cache on startup
  session.defaultSession.clearCache().then(() => {
    console.log('Electron Cache completely cleared.');
  });

  const serverPath = path.join(__dirname, 'server', 'server.js');

  if (app.isPackaged) {
    // Production: use Electron's utilityProcess.fork() instead of child_process.fork().
    //
    // Why: child_process.fork() spawns a PLAIN Node.js process that cannot read from
    // .asar virtual archives. Since node_modules is packed inside app.asar, the forked
    // server's require('express') fails silently, port 3001 never opens, and the app
    // gets stuck on the splash screen forever.
    //
    // utilityProcess runs inside Electron's runtime with asar patches active, so
    // require() can resolve modules from inside app.asar natively.
    //
    // NODE_PATH tells the module resolver to also search the asar's node_modules dir,
    // since the server scripts themselves are unpacked (asarUnpack) for write access
    // (EPG cache, TMDB cache, DVR recordings) and their __dirname is outside the asar.
    serverProcess = utilityProcess.fork(serverPath, [], {
      env: {
        ...process.env,
        NODE_PATH: path.join(__dirname, 'node_modules')
      }
    });
    serverProcess.on('exit', (code) => {
      console.log(`[Server] Backend process exited with code ${code}`);
    });
  } else {
    // Development: use child_process.fork() — no asar involved, regular filesystem
    serverProcess = fork(serverPath, [], { stdio: 'inherit' });
  }

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

// Ensure the background server is killed when the user closes the app
app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
