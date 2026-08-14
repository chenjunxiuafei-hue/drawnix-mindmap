const CLOUD_FOLDER_NAME = 'MindMap Cloud Data';
const CLOUD_FOLDER_ID_KEY = 'MINDMAP_CLOUD_FOLDER_ID_V1';
const LIBRARY_FILE_NAME = 'drawnix-library.json';
const LEGACY_FILE_NAME = 'ecommerce-pyramid-data.json';

const ALLOWED_PARENT_ORIGINS = [
  'https://chenjunxiuafei-hue.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

function doGet(e) {
  const mode = e && e.parameter && e.parameter.mode;
  if (mode === 'bridge') {
    const tpl = HtmlService.createTemplateFromFile('Bridge');
    tpl.allowedOriginsJson = JSON.stringify(ALLOWED_PARENT_ORIGINS);
    return tpl.evaluate()
      .setTitle('MindMap Cloud Bridge')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8"><title>MindMap Cloud</title>' +
    '<style>body{font-family:system-ui;padding:32px;color:#172033}code{background:#f2f4f7;padding:2px 6px;border-radius:6px}</style>' +
    '<h2>MindMap Cloud 后台已运行</h2><p>这是 Drawnix 思维导图库的 Google Drive 云端桥接后台。</p>' +
    '<p>前端会通过 <code>?mode=bridge</code> 的隐藏 iframe 调用这里。</p>'
  );
}

function apiPing() {
  return { ok: true, at: new Date().toISOString() };
}

function apiLoadLibrary() {
  const file = findFile_(LIBRARY_FILE_NAME);
  return { data: file ? readFile_(file) : null, updatedAt: file ? file.getLastUpdated().toISOString() : null };
}

function apiSaveLibrary(jsonText) {
  const parsed = parseJson_(jsonText);
  if (!parsed || parsed.id !== 'drawnix-mindmap-library' || !Array.isArray(parsed.maps)) {
    throw new Error('目录数据格式不正确');
  }
  return saveNamedFile_(LIBRARY_FILE_NAME, JSON.stringify(parsed));
}

function apiLoadMap(mapId) {
  const id = normalizeMapId_(mapId);
  const file = findFile_(mapFileName_(id));
  return { data: file ? readFile_(file) : null, updatedAt: file ? file.getLastUpdated().toISOString() : null };
}

function apiSaveMap(mapId, jsonText) {
  const id = normalizeMapId_(mapId);
  const parsed = parseJson_(jsonText);
  if (!parsed || parsed.id !== id || !parsed.board || !Array.isArray(parsed.board.children)) {
    throw new Error('思维导图数据格式不正确');
  }
  return saveNamedFile_(mapFileName_(id), JSON.stringify(parsed));
}

function apiDeleteMap(mapId) {
  const id = normalizeMapId_(mapId);
  const file = findFile_(mapFileName_(id));
  if (file) file.setTrashed(true);
  return { ok: true };
}

function apiLoadLegacy() {
  const rootFiles = DriveApp.getFilesByName(LEGACY_FILE_NAME);
  if (!rootFiles.hasNext()) return { data: null };
  const file = rootFiles.next();
  return { data: readFile_(file), updatedAt: file.getLastUpdated().toISOString() };
}

function getCloudFolder_() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty(CLOUD_FOLDER_ID_KEY);
  if (saved) {
    try { return DriveApp.getFolderById(saved); }
    catch (err) { props.deleteProperty(CLOUD_FOLDER_ID_KEY); }
  }
  const folders = DriveApp.getFoldersByName(CLOUD_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(CLOUD_FOLDER_NAME);
  props.setProperty(CLOUD_FOLDER_ID_KEY, folder.getId());
  return folder;
}

function findFile_(name) {
  const files = getCloudFolder_().getFilesByName(name);
  return files.hasNext() ? files.next() : null;
}

function saveNamedFile_(name, content) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let file = findFile_(name);
    if (file) file.setContent(content);
    else file = getCloudFolder_().createFile(name, content, MimeType.PLAIN_TEXT);
    return { ok: true, fileId: file.getId(), updatedAt: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function readFile_(file) {
  return file.getBlob().getDataAsString('UTF-8');
}

function parseJson_(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('保存内容为空');
  return JSON.parse(text);
}

function normalizeMapId_(id) {
  id = String(id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('思维导图 ID 不合法');
  return id;
}

function mapFileName_(id) {
  return 'map-' + id + '.json';
}
