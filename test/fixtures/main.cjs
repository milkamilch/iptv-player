// Minimaler Electron-Host für den gebauten Renderer, ferngesteuert über CDP.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.commandLine.appendSwitch('remote-debugging-port', '9333');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(() => {
  new BrowserWindow({
    width: 1400, height: 900, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: false,
      webSecurity: false,
    },
  }).loadURL(process.env.APP_URL);
});

app.on('window-all-closed', () => app.quit());
