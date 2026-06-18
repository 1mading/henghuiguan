const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

const ALLOWED_EXT = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
  '.zip', '.rar', '.7z', '.txt', '.csv', '.md',
]);

function getUploadsDir() {
  const dir = config.uploadsDir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeExt(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (!ext || !ALLOWED_EXT.has(ext)) return null;
  return ext;
}

function buildStoredPath(fileId, ext) {
  return path.join(getUploadsDir(), `${fileId}${ext}`);
}

function resolveStoredPath(fileId) {
  const dir = getUploadsDir();
  const entries = fs.readdirSync(dir).filter(name => name.startsWith(fileId));
  if (!entries.length) return null;
  return path.join(dir, entries[0]);
}

function saveUploadedFile(file, originalName) {
  const ext = sanitizeExt(originalName);
  if (!ext) {
    const err = new Error('不支持的文件类型');
    err.code = 'UNSUPPORTED_TYPE';
    throw err;
  }
  if (file.size > config.maxUploadBytes) {
    const err = new Error(`文件过大，最大 ${Math.round(config.maxUploadBytes / 1024 / 1024)}MB`);
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }

  const fileId = 'F-' + uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();
  const storedPath = buildStoredPath(fileId, ext);
  fs.writeFileSync(storedPath, file.buffer);
  return {
    fileId,
    name: path.basename(originalName),
    size: file.size,
    mimeType: file.mimetype || 'application/octet-stream',
    ext,
  };
}

function deleteStoredFile(fileId) {
  const storedPath = resolveStoredPath(fileId);
  if (storedPath && fs.existsSync(storedPath)) {
    fs.unlinkSync(storedPath);
    return true;
  }
  return false;
}

function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

module.exports = {
  ALLOWED_EXT,
  saveUploadedFile,
  deleteStoredFile,
  resolveStoredPath,
  formatFileSize,
  sanitizeExt,
};
