const { app, BrowserWindow, utilityProcess } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    backgroundColor: '#0f172a'
  });

  const serverPath = path.join(__dirname, 'server', 'server.js');
  
  if (app.isPackaged) {
    serverProcess = utilityProcess.fork(serverPath, [], {
      execArgv: ['--max-old-space-size=2048'],
      env: {
        ...process.env,
        NODE_PATH: path.join(__dirname, 'node_modules')
      }
    });
  } else {
    serverProcess = fork(serverPath, [], {
      execArgv: ['--max-old-space-size=2048']
    });
  }

  serverProcess.on('exit', (code) => {
    console.log(`Server process exited with code ${code}`);
  });

  // Load the Vite dev server or the production build.
  // Bug Fix: The Express server on port 3002 is forked synchronously above, but Node.js
  // still needs ~1-2 seconds to spin up and begin listening. Without a delay, React boots
  // instantly and fires API calls before the server is ready, causing connection errors.
  const isDev = !app.isPackaged;
  if (isDev) {
    setTimeout(() => {
      mainWindow.loadURL('http://localhost:5175');
      mainWindow.webContents.openDevTools();
    }, 2000);
  } else {
    setTimeout(() => {
      mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }, 2000);
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
    if (serverProcess) {
      serverProcess.kill();
    }
  });
}

app.on('ready', () => {
  createWindow();

  // Auto-Start on Boot
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
    args: []
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});
