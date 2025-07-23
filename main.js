const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

let mainWindow;
let renameHistory = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadFile('renderer/index.html');
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('get-files', async (event, folderPath) => {
  try {
    const files = await fs.readdir(folderPath);
    const fileDetails = [];
    
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isFile()) {
        fileDetails.push({
          name: file,
          path: filePath,
          size: stats.size,
          modified: stats.mtime
        });
      }
    }
    
    return fileDetails;
  } catch (error) {
    throw new Error(`Failed to read directory: ${error.message}`);
  }
});

ipcMain.handle('rename-files', async (event, renameOperations) => {
  const results = [];
  const currentOperation = {
    timestamp: new Date().toISOString(),
    operations: []
  };
  
  for (const operation of renameOperations) {
    try {
      const oldPath = operation.oldPath;
      const newPath = path.join(path.dirname(oldPath), operation.newName);
      
      await fs.rename(oldPath, newPath);
      
      const operationRecord = {
        oldName: operation.oldName,
        newName: operation.newName,
        oldPath: oldPath,
        newPath: newPath,
        success: true
      };
      
      results.push(operationRecord);
      currentOperation.operations.push(operationRecord);
    } catch (error) {
      const operationRecord = {
        oldName: operation.oldName,
        newName: operation.newName,
        oldPath: operation.oldPath,
        success: false,
        error: error.message
      };
      
      results.push(operationRecord);
      currentOperation.operations.push(operationRecord);
    }
  }
  
  renameHistory.push(currentOperation);
  return results;
});

ipcMain.handle('undo-rename', async () => {
  if (renameHistory.length === 0) {
    throw new Error('No operations to undo');
  }
  
  const lastOperation = renameHistory.pop();
  const results = [];
  
  for (const operation of lastOperation.operations.reverse()) {
    if (operation.success) {
      try {
        await fs.rename(operation.newPath, operation.oldPath);
        results.push({
          name: operation.newName,
          success: true,
          revertedTo: operation.oldName
        });
      } catch (error) {
        results.push({
          name: operation.newName,
          success: false,
          error: error.message
        });
      }
    }
  }
  
  return results;
});

ipcMain.handle('export-log', async (event, logData) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'rename-log.txt',
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'JSON Files', extensions: ['json'] }
    ]
  });
  
  if (!result.canceled) {
    const extension = path.extname(result.filePath);
    const content = extension === '.json' 
      ? JSON.stringify(logData, null, 2)
      : logData.map(entry => `${entry.timestamp}: ${entry.oldName} -> ${entry.newName}`).join('\n');
    
    await fs.writeFile(result.filePath, content);
    return result.filePath;
  }
  
  return null;
});