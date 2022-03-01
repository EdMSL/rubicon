import {
  BrowserWindow,
  globalShortcut,
  ipcMain,
} from 'electron';
import windowStateKeeper from 'electron-window-state';

import { createWaitForWebpackDevServer } from './waitDevServer';
import { defaultDevWindowResolution } from '$constants/defaultParameters';
import { AppEvent, AppWindowName } from '$constants/misc';

/**
 * Функция для создания и показа окна разработчика
*/
export const createDevWindow = (): BrowserWindow => {
  const devWindowState = windowStateKeeper({
    defaultWidth: defaultDevWindowResolution.width,
    defaultHeight: defaultDevWindowResolution.height,
    file: 'window-dev-state.json',
  });

  const devWindow: BrowserWindow = new BrowserWindow({
    x: devWindowState.x,
    y: devWindowState.y,
    minWidth: defaultDevWindowResolution.minWidth,
    minHeight: defaultDevWindowResolution.minHeight,
    maxWidth: defaultDevWindowResolution.maxWidth,
    maxHeight: defaultDevWindowResolution.maxHeight,
    width: devWindowState.width,
    height: devWindowState.height,
    resizable: true,
    frame: false,
    show: false,
    title: 'Developer Screen',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      devTools: process.env.NODE_ENV === 'development',
    },
  });

  if (process.env.NODE_ENV === 'production') {
    devWindow.loadURL(`file://${__dirname}/index.html#/developer`);
  } else {
    const waitForWebpackDevServer = createWaitForWebpackDevServer(
      devWindow, 'http://localhost:8081/build/index.html/#developer',
    );
    waitForWebpackDevServer();
  }

  if (process.env.NODE_ENV === 'development') {
    globalShortcut.register('F10', () => {
      devWindow.webContents.openDevTools();
    });
  }

  devWindowState.manage(devWindow);

  return devWindow;
};

export const addDevWindowListeners = (
  devWindow: BrowserWindow,
  mainWindow: BrowserWindow,
): void => {
  ipcMain.on(AppEvent.OPEN_DEV_WINDOW, () => {
    devWindow.show();
    devWindow.focus();
  });

  ipcMain.on(AppEvent.MINIMIZE_WINDOW, (event, windowName) => {
    if (windowName === AppWindowName.DEV) {
      devWindow.minimize();
    }
  });

  ipcMain.on(AppEvent.MAX_UNMAX_WINDOW, (evt, isMax, windowName) => {
    if (windowName === AppWindowName.DEV) {
      if (isMax) {
        devWindow.unmaximize();
      } else {
        devWindow.maximize();
      }
    }
  });

  devWindow.on('maximize', () => {
    devWindow.webContents.send(AppEvent.MAX_UNMAX_WINDOW, true);
  });

  devWindow.on('unmaximize', () => {
    devWindow.webContents.send(AppEvent.MAX_UNMAX_WINDOW, false);
  });

  devWindow.on('show', () => {
    devWindow.webContents.send(AppEvent.MAX_UNMAX_WINDOW, devWindow.isMaximized());
  });

  ipcMain.on(AppEvent.CLOSE_DEV_WINDOW, () => {
    mainWindow.webContents.send(AppEvent.DEV_WINDOW_CLOSED);
    devWindow.hide();
  });

  devWindow.on('close', (event) => {
    // Изменено ввиду проблем с закрытием окон из панели задач системы
    mainWindow.webContents.send(AppEvent.DEV_WINDOW_CLOSED);
    event.preventDefault();
    devWindow.hide();
  });
};
