const { ipcRenderer } = require('electron');
const path = require('path');

// DOM elements
const dropZone = document.getElementById('drop-zone');
const browseFolder = document.getElementById('browse-folder');
const folderInfo = document.getElementById('folder-info');
const folderPath = document.getElementById('folder-path');
const fileCount = document.getElementById('file-count');
const noFiles = document.getElementById('no-files');
const fileTable = document.getElementById('file-table');
const fileTableBody = document.getElementById('file-table-body');
const themeToggle = document.getElementById('theme-toggle');
const exportLog = document.getElementById('export-log');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');

// Rule elements
const prefixEnabled = document.getElementById('prefix-enabled');
const prefixText = document.getElementById('prefix-text');
const suffixEnabled = document.getElementById('suffix-enabled');
const suffixText = document.getElementById('suffix-text');
const numberingEnabled = document.getElementById('numbering-enabled');
const numberingStart = document.getElementById('numbering-start');
const numberingDigits = document.getElementById('numbering-digits');
const dateEnabled = document.getElementById('date-enabled');
const dateFormat = document.getElementById('date-format');
const replaceEnabled = document.getElementById('replace-enabled');
const replaceFind = document.getElementById('replace-find');
const replaceWith = document.getElementById('replace-with');

// Action buttons
const previewBtn = document.getElementById('preview-btn');
const applyBtn = document.getElementById('apply-btn');
const undoBtn = document.getElementById('undo-btn');

// State
let currentFiles = [];
let currentFolderPath = '';
let renameLog = [];
let isDarkMode = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    setupEventListeners();
    setupRuleToggling();
});

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        isDarkMode = true;
        document.documentElement.classList.add('dark');
    }
}

function setupEventListeners() {
    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);
    
    // Folder selection
    browseFolder.addEventListener('click', selectFolder);
    dropZone.addEventListener('click', selectFolder);
    
    // Drag and drop
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    
    // Action buttons
    previewBtn.addEventListener('click', previewRename);
    applyBtn.addEventListener('click', applyRename);
    undoBtn.addEventListener('click', undoRename);
    exportLog.addEventListener('click', exportRenameLog);
    
    // Rule input changes
    const inputs = [prefixText, suffixText, numberingStart, numberingDigits, dateFormat, replaceFind, replaceWith];
    inputs.forEach(input => {
        input.addEventListener('input', updatePreview);
    });
}

function setupRuleToggling() {
    const rules = [
        { checkbox: prefixEnabled, inputs: [prefixText] },
        { checkbox: suffixEnabled, inputs: [suffixText] },
        { checkbox: numberingEnabled, inputs: [numberingStart, numberingDigits] },
        { checkbox: dateEnabled, inputs: [dateFormat] },
        { checkbox: replaceEnabled, inputs: [replaceFind, replaceWith] }
    ];
    
    rules.forEach(rule => {
        rule.checkbox.addEventListener('change', () => {
            const isEnabled = rule.checkbox.checked;
            rule.inputs.forEach(input => {
                input.disabled = !isEnabled;
            });
            updatePreview();
        });
    });
}

function toggleTheme() {
    isDarkMode = !isDarkMode;
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
}

async function selectFolder() {
    try {
        const folderPath = await ipcRenderer.invoke('select-folder');
        if (folderPath) {
            await loadFolder(folderPath);
        }
    } catch (error) {
        showError('Failed to select folder: ' + error.message);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    dropZone.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
}

async function handleDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const folderPath = files[0].path;
        await loadFolder(folderPath);
    }
}

async function loadFolder(folderPath) {
    try {
        currentFolderPath = folderPath;
        const files = await ipcRenderer.invoke('get-files', folderPath);
        currentFiles = files;
        
        // Update UI
        folderPath.textContent = path.basename(currentFolderPath);
        fileCount.textContent = files.length;
        folderInfo.classList.remove('hidden');
        
        displayFiles();
        enableControls();
    } catch (error) {
        showError('Failed to load folder: ' + error.message);
    }
}

function displayFiles() {
    if (currentFiles.length === 0) {
        noFiles.classList.remove('hidden');
        fileTable.classList.add('hidden');
        return;
    }
    
    noFiles.classList.add('hidden');
    fileTable.classList.remove('hidden');
    
    fileTableBody.innerHTML = '';
    currentFiles.forEach((file, index) => {
        const row = document.createElement('tr');
        row.className = 'file-row border-b border-gray-100 dark:border-gray-700';
        
        row.innerHTML = `
            <td class="py-3 px-2 text-sm text-gray-900 dark:text-white truncate">${file.name}</td>
            <td class="py-3 px-2 text-sm text-gray-900 dark:text-white truncate" id="new-name-${index}">${file.name}</td>
            <td class="py-3 px-2 text-sm" id="status-${index}">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                    Ready
                </span>
            </td>
        `;
        
        fileTableBody.appendChild(row);
    });
}

function enableControls() {
    previewBtn.disabled = false;
    applyBtn.disabled = false;
}

function updatePreview() {
    if (currentFiles.length === 0) return;
    
    currentFiles.forEach((file, index) => {
        const newName = generateNewName(file.name, index);
        const newNameCell = document.getElementById(`new-name-${index}`);
        if (newNameCell) {
            newNameCell.textContent = newName;
        }
    });
}

function generateNewName(originalName, index) {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    let newName = baseName;
    
    // Apply find and replace first
    if (replaceEnabled.checked && replaceFind.value) {
        const findText = replaceFind.value;
        const replaceText = replaceWith.value || '';
        newName = newName.replace(new RegExp(findText, 'g'), replaceText);
    }
    
    // Add prefix
    if (prefixEnabled.checked && prefixText.value) {
        newName = prefixText.value + newName;
    }
    
    // Add suffix
    if (suffixEnabled.checked && suffixText.value) {
        newName = newName + suffixText.value;
    }
    
    // Add numbering
    if (numberingEnabled.checked) {
        const start = parseInt(numberingStart.value) || 1;
        const digits = parseInt(numberingDigits.value) || 3;
        const number = (start + index).toString().padStart(digits, '0');
        newName = newName + '_' + number;
    }
    
    // Add date
    if (dateEnabled.checked) {
        const now = new Date();
        const format = dateFormat.value;
        let dateStr = '';
        
        switch (format) {
            case 'YYYY-MM-DD':
                dateStr = now.toISOString().split('T')[0];
                break;
            case 'MM-DD-YYYY':
                dateStr = (now.getMonth() + 1).toString().padStart(2, '0') + '-' + 
                         now.getDate().toString().padStart(2, '0') + '-' + 
                         now.getFullYear();
                break;
            case 'DD-MM-YYYY':
                dateStr = now.getDate().toString().padStart(2, '0') + '-' + 
                         (now.getMonth() + 1).toString().padStart(2, '0') + '-' + 
                         now.getFullYear();
                break;
            case 'YYYYMMDD':
                dateStr = now.getFullYear().toString() + 
                         (now.getMonth() + 1).toString().padStart(2, '0') + 
                         now.getDate().toString().padStart(2, '0');
                break;
        }
        
        newName = newName + '_' + dateStr;
    }
    
    return newName + ext;
}

function previewRename() {
    updatePreview();
    showSuccess('Preview updated! Review the new names in the table.');
}

async function applyRename() {
    if (currentFiles.length === 0) return;
    
    const renameOperations = currentFiles.map((file, index) => {
        const newName = generateNewName(file.name, index);
        return {
            oldName: file.name,
            newName: newName,
            oldPath: file.path,
            newPath: path.join(path.dirname(file.path), newName)
        };
    });
    
    // Show progress
    progressContainer.classList.remove('hidden');
    progressBar.style.width = '0%';
    
    try {
        const results = await ipcRenderer.invoke('rename-files', renameOperations);
        
        // Update UI with results
        results.forEach((result, index) => {
            const statusCell = document.getElementById(`status-${index}`);
            if (statusCell) {
                if (result.success) {
                    statusCell.innerHTML = `
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                            Success
                        </span>
                    `;
                } else {
                    statusCell.innerHTML = `
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                            Error
                        </span>
                    `;
                }
            }
        });
        
        // Update progress
        progressBar.style.width = '100%';
        
        // Add to log
        results.forEach(result => {
            if (result.success) {
                renameLog.push({
                    timestamp: new Date().toISOString(),
                    oldName: result.oldName,
                    newName: result.newName,
                    folder: currentFolderPath
                });
            }
        });
        
        // Enable undo
        undoBtn.disabled = false;
        
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.filter(r => !r.success).length;
        
        if (errorCount === 0) {
            showSuccess(`Successfully renamed ${successCount} files!`);
        } else {
            showError(`Renamed ${successCount} files with ${errorCount} errors.`);
        }
        
        // Reload folder to get updated file list
        setTimeout(() => {
            loadFolder(currentFolderPath);
            progressContainer.classList.add('hidden');
        }, 2000);
        
    } catch (error) {
        showError('Failed to rename files: ' + error.message);
        progressContainer.classList.add('hidden');
    }
}

async function undoRename() {
    try {
        const results = await ipcRenderer.invoke('undo-rename');
        
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.filter(r => !r.success).length;
        
        if (errorCount === 0) {
            showSuccess(`Successfully reverted ${successCount} files!`);
        } else {
            showError(`Reverted ${successCount} files with ${errorCount} errors.`);
        }
        
        // Reload folder
        loadFolder(currentFolderPath);
        
    } catch (error) {
        showError('Failed to undo rename: ' + error.message);
    }
}

async function exportRenameLog() {
    if (renameLog.length === 0) {
        showError('No rename operations to export.');
        return;
    }
    
    try {
        const filePath = await ipcRenderer.invoke('export-log', renameLog);
        if (filePath) {
            showSuccess(`Log exported to: ${filePath}`);
        }
    } catch (error) {
        showError('Failed to export log: ' + error.message);
    }
}

function showSuccess(message) {
    // Simple notification - you could enhance this with a proper notification system
    console.log('Success:', message);
}

function showError(message) {
    // Simple notification - you could enhance this with a proper notification system
    console.error('Error:', message);
    alert('Error: ' + message);
}