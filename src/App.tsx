import { useEffect, useMemo, useRef, useState } from 'react';
import { Drawnix, type DrawnixToolState } from '@drawnix/drawnix';
import '@drawnix/drawnix/index.css';
import type { BoardChangeData } from '@plait-board/react-board';
import { CloudBridge } from './cloudBridge';
import { blankBoard, migrateLegacy } from './migration';
import type { BoardValue, Directory, MapMeta, StoredMap } from './types';
import './styles.css';

const LIBRARY_ID = 'drawnix-mindmap-library' as const;
const LOCAL_DIR = 'drawnix_cloud_dir_v1';
const LOCAL_MAP_PREFIX = 'drawnix_cloud_map_v1_';
const now = () => new Date().toISOString();
const uid = () => `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function fmtTime(value: string) {
  try { return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return value; }
}

function loadLocalDirectory(): Directory | null {
  try {
    const raw = localStorage.getItem(LOCAL_DIR);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.id === LIBRARY_ID && Array.isArray(parsed.maps) ? parsed : null;
  } catch { return null; }
}

function loadLocalMap(id: string): StoredMap | null {
  try {
    const raw = localStorage.getItem(LOCAL_MAP_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function App() {
  const bridge = useMemo(() => new CloudBridge(), []);
  const [backendUrl, setBackendUrl] = useState(bridge.getSavedUrl());
  const [backendDraft, setBackendDraft] = useState(bridge.getSavedUrl());
  const [setupOpen, setSetupOpen] = useState(!bridge.getSavedUrl());
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('未连接');
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [currentMap, setCurrentMap] = useState<StoredMap | null>(null);
  const [board, setBoard] = useState<BoardValue>({ children: [] });
  const [toolState, setToolState] = useState<Partial<DrawnixToolState> | undefined>();
  const [error, setError] = useState('');
  const saveTimer = useRef<number | null>(null);
  const currentMapRef = useRef<StoredMap | null>(null);
  const boardRef = useRef<BoardValue>({ children: [] });
  const ignoreChanges = useRef(false);

  const currentMeta = directory?.maps.find((m) => m.id === directory.currentMapId) || null;

  useEffect(() => { currentMapRef.current = currentMap; }, [currentMap]);
  useEffect(() => { boardRef.current = board; }, [board]);

  useEffect(() => {
    if (!backendUrl) { setLoading(false); return; }
    void boot(backendUrl);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl]);

  async function boot(url: string) {
    setLoading(true); setError(''); setStatus('连接云端…');
    try {
      await bridge.connect(url);
      setStatus('云端已连接');
      const libResult = await bridge.call<{ data: string | null }>('loadLibrary');
      let dir: Directory | null = null;
      if (libResult?.data) {
        try { dir = JSON.parse(libResult.data); } catch { dir = null; }
      }
      if (!dir || dir.id !== LIBRARY_ID || !Array.isArray(dir.maps) || dir.maps.length === 0) {
        const legacy = await bridge.call<{ data: string | null }>('loadLegacy');
        const firstId = 'map-ecommerce';
        const firstBoard = await migrateLegacy(legacy?.data || null);
        const stamp = now();
        const firstMap: StoredMap = { id: firstId, title: '电商运营体系', version: 1, board: firstBoard, updatedAt: stamp };
        dir = { id: LIBRARY_ID, version: 1, currentMapId: firstId, maps: [{ id: firstId, title: firstMap.title, createdAt: stamp, updatedAt: stamp }] };
        await bridge.call('saveMap', { id: firstId, data: JSON.stringify(firstMap) });
        await bridge.call('saveLibrary', { data: JSON.stringify(dir) });
      }
      setDirectory(dir);
      localStorage.setItem(LOCAL_DIR, JSON.stringify(dir));
      await openMap(dir.currentMapId, dir);
      setStatus('云端已同步');
    } catch (e: any) {
      console.error(e);
      setError(e?.message || String(e));
      setStatus('云端连接失败');
      const localDir = loadLocalDirectory();
      if (localDir?.maps.length) {
        setDirectory(localDir);
        const local = loadLocalMap(localDir.currentMapId);
        if (local) applyMap(local);
      }
    } finally { setLoading(false); }
  }

  function applyMap(map: StoredMap) {
    ignoreChanges.current = true;
    setCurrentMap(map);
    setBoard(map.board || { children: [] });
    window.setTimeout(() => { ignoreChanges.current = false; }, 0);
  }

  async function openMap(id: string, sourceDir = directory) {
    if (!sourceDir) return;
    await flushSave();
    setStatus('读取云端…');
    let map: StoredMap | null = null;
    try {
      const res = await bridge.call<{ data: string | null }>('loadMap', { id });
      if (res?.data) map = JSON.parse(res.data);
    } catch (e) { console.warn(e); }
    if (!map) map = loadLocalMap(id);
    if (!map) {
      const meta = sourceDir.maps.find((m) => m.id === id);
      map = { id, title: meta?.title || '未命名思维导图', version: 1, board: await blankBoard(meta?.title || '未命名思维导图'), updatedAt: now() };
    }
    const nextDir = { ...sourceDir, currentMapId: id };
    setDirectory(nextDir); localStorage.setItem(LOCAL_DIR, JSON.stringify(nextDir));
    applyMap(map); localStorage.setItem(LOCAL_MAP_PREFIX + id, JSON.stringify(map));
    setLibraryOpen(false); setStatus('云端已同步');
    void bridge.call('saveLibrary', { data: JSON.stringify(nextDir) }).catch(console.warn);
  }

  function onBoardChange(value: BoardChangeData) {
    if (ignoreChanges.current || !currentMapRef.current) return;
    const next = value as unknown as BoardValue;
    setBoard(next);
    boardRef.current = next;
    const map = { ...currentMapRef.current, board: next, updatedAt: now() };
    setCurrentMap(map); currentMapRef.current = map;
    localStorage.setItem(LOCAL_MAP_PREFIX + map.id, JSON.stringify(map));
    setDirectory((old) => {
      if (!old) return old;
      const d = { ...old, maps: old.maps.map((m) => m.id === map.id ? { ...m, updatedAt: map.updatedAt } : m) };
      localStorage.setItem(LOCAL_DIR, JSON.stringify(d));
      return d;
    });
    setStatus('有修改，等待保存…');
    scheduleSave();
  }

  function scheduleSave() {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flushSave(); }, 1200);
  }

  async function flushSave() {
    if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
    const map = currentMapRef.current;
    if (!map || !directory) return;
    try {
      setStatus('保存中…');
      const latest = { ...map, board: boardRef.current, updatedAt: now() };
      currentMapRef.current = latest; setCurrentMap(latest);
      const nextDir = { ...directory, maps: directory.maps.map((m) => m.id === latest.id ? { ...m, title: latest.title, updatedAt: latest.updatedAt } : m) };
      setDirectory(nextDir);
      localStorage.setItem(LOCAL_MAP_PREFIX + latest.id, JSON.stringify(latest));
      localStorage.setItem(LOCAL_DIR, JSON.stringify(nextDir));
      await Promise.all([
        bridge.call('saveMap', { id: latest.id, data: JSON.stringify(latest) }),
        bridge.call('saveLibrary', { data: JSON.stringify(nextDir) }),
      ]);
      setStatus('云端已同步');
    } catch (e: any) {
      console.error(e); setStatus('已保存在本机，云端失败'); setError(e?.message || String(e));
    }
  }

  async function createMap() {
    if (!directory) return;
    const title = window.prompt('新思维导图名称', '新思维导图')?.trim();
    if (!title) return;
    const id = uid(), stamp = now();
    const map: StoredMap = { id, title, version: 1, board: await blankBoard(title), updatedAt: stamp };
    const next: Directory = { ...directory, currentMapId: id, maps: [{ id, title, createdAt: stamp, updatedAt: stamp }, ...directory.maps] };
    setDirectory(next); applyMap(map); setLibraryOpen(false);
    localStorage.setItem(LOCAL_DIR, JSON.stringify(next)); localStorage.setItem(LOCAL_MAP_PREFIX + id, JSON.stringify(map));
    await Promise.all([bridge.call('saveMap', { id, data: JSON.stringify(map) }), bridge.call('saveLibrary', { data: JSON.stringify(next) })]);
    setStatus('云端已同步');
  }

  async function renameMap(meta: MapMeta) {
    if (!directory) return;
    const title = window.prompt('重命名', meta.title)?.trim(); if (!title || title === meta.title) return;
    const nextDir = { ...directory, maps: directory.maps.map((m) => m.id === meta.id ? { ...m, title, updatedAt: now() } : m) };
    setDirectory(nextDir); localStorage.setItem(LOCAL_DIR, JSON.stringify(nextDir));
    let map = meta.id === currentMapRef.current?.id ? currentMapRef.current : loadLocalMap(meta.id);
    if (!map) { const r = await bridge.call<{data:string|null}>('loadMap', {id:meta.id}); map = r?.data ? JSON.parse(r.data) : null; }
    if (map) {
      const nextMap = { ...map, title, updatedAt: now() };
      localStorage.setItem(LOCAL_MAP_PREFIX + meta.id, JSON.stringify(nextMap));
      if (meta.id === currentMapRef.current?.id) { setCurrentMap(nextMap); currentMapRef.current = nextMap; }
      await bridge.call('saveMap', { id: meta.id, data: JSON.stringify(nextMap) });
    }
    await bridge.call('saveLibrary', { data: JSON.stringify(nextDir) });
  }

  async function duplicateMap(meta: MapMeta) {
    if (!directory) return;
    let source = loadLocalMap(meta.id);
    if (!source) { const r = await bridge.call<{data:string|null}>('loadMap', { id: meta.id }); source = r?.data ? JSON.parse(r.data) : null; }
    if (!source) return;
    const id = uid(), stamp = now(), title = `${meta.title} - 副本`;
    const copy: StoredMap = { ...clone(source), id, title, updatedAt: stamp };
    const next = { ...directory, maps: [{ id, title, createdAt: stamp, updatedAt: stamp }, ...directory.maps] };
    setDirectory(next); localStorage.setItem(LOCAL_DIR, JSON.stringify(next)); localStorage.setItem(LOCAL_MAP_PREFIX + id, JSON.stringify(copy));
    await Promise.all([bridge.call('saveMap', { id, data: JSON.stringify(copy) }), bridge.call('saveLibrary', { data: JSON.stringify(next) })]);
  }

  async function deleteMap(meta: MapMeta) {
    if (!directory || directory.maps.length <= 1) return alert('至少保留一张思维导图。');
    if (!window.confirm(`删除“${meta.title}”？云端文件也会移到回收站。`)) return;
    const maps = directory.maps.filter((m) => m.id !== meta.id);
    const currentMapId = directory.currentMapId === meta.id ? maps[0].id : directory.currentMapId;
    const next = { ...directory, maps, currentMapId };
    setDirectory(next); localStorage.setItem(LOCAL_DIR, JSON.stringify(next)); localStorage.removeItem(LOCAL_MAP_PREFIX + meta.id);
    await Promise.all([bridge.call('deleteMap', { id: meta.id }), bridge.call('saveLibrary', { data: JSON.stringify(next) })]);
    if (directory.currentMapId === meta.id) await openMap(currentMapId, next);
  }

  async function saveBackend() {
    const url = backendDraft.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(url)) {
      return setError('请粘贴 Apps Script 部署后的 /exec 地址。');
    }
    setError(''); setSetupOpen(false); setBackendUrl(bridge.saveUrl(url));
  }

  return (
    <div className="app-shell">
      <div className="board-shell">
        {!loading && currentMap && (
          <Drawnix
            key={currentMap.id}
            value={board.children}
            viewport={board.viewport}
            theme={board.theme}
            initialToolState={toolState}
            initialLanguage="zh"
            onChange={onBoardChange}
            onToolStateChange={(state) => setToolState(state)}
            tutorial={false}
          />
        )}
      </div>

      <div className="top-left-bar">
        <button className="glass-btn" onClick={() => setLibraryOpen(true)}>目录</button>
        <div className="title-chip">{currentMeta?.title || currentMap?.title || '思维导图库'}</div>
        <div className={`status-chip ${status.includes('失败') ? 'bad' : status.includes('同步') ? 'ok' : ''}`}>{status}</div>
      </div>
      <div className="top-right-bar">
        <button className="glass-btn" onClick={() => void flushSave()}>立即保存</button>
        <button className="glass-btn" onClick={() => { setBackendDraft(bridge.getSavedUrl()); setSetupOpen(true); }}>云端设置</button>
      </div>

      {libraryOpen && directory && (
        <div className="overlay">
          <div className="library-panel">
            <div className="panel-head"><div><h1>思维导图库</h1><p>Drawnix 负责编辑，Google Drive 负责跨设备保存。</p></div><div className="head-actions"><button className="btn primary" onClick={() => void createMap()}>新建思维导图</button><button className="btn" onClick={() => setLibraryOpen(false)}>返回当前导图</button></div></div>
            <div className="map-grid">
              {directory.maps.map((meta) => <div className={`map-card ${meta.id === directory.currentMapId ? 'current' : ''}`} key={meta.id}>
                <div className="map-card-title"><h3>{meta.title}</h3>{meta.id === directory.currentMapId && <span>当前</span>}</div>
                <p>最近编辑：{fmtTime(meta.updatedAt)}</p>
                <div className="card-actions"><button className="btn" onClick={() => void openMap(meta.id)}>打开</button><button className="btn" onClick={() => void renameMap(meta)}>重命名</button><button className="btn" onClick={() => void duplicateMap(meta)}>复制</button><button className="btn danger" onClick={() => void deleteMap(meta)}>删除</button></div>
              </div>)}
            </div>
          </div>
        </div>
      )}

      {setupOpen && (
        <div className="overlay setup-overlay">
          <div className="setup-card">
            <h2>连接 Google Drive 云端</h2>
            <p>粘贴 Apps Script Web App 的 <code>/exec</code> 地址。页面会通过隐藏桥接 iframe 调用 Apps Script，因此 Drawnix 页面本身不会显示 Google 顶部提示栏。</p>
            <input value={backendDraft} onChange={(e) => setBackendDraft(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" />
            {error && <div className="error-box">{error}</div>}
            <div className="setup-actions"><button className="btn primary" onClick={() => void saveBackend()}>连接云端</button>{backendUrl && <button className="btn" onClick={() => setSetupOpen(false)}>取消</button>}</div>
            {backendUrl && <a className="open-backend" href={backendUrl} target="_blank" rel="noreferrer">如果桥接连接不上，先在新窗口打开一次 Apps Script 完成登录/授权</a>}
          </div>
        </div>
      )}

      {loading && <div className="loading"><div className="loader"></div><strong>正在加载 Drawnix</strong><span>{status}</span></div>}
      {!loading && !currentMap && backendUrl && <div className="empty-state"><h2>没有加载到思维导图</h2><p>{error || '请检查云端连接。'}</p><button className="btn" onClick={() => setSetupOpen(true)}>检查云端设置</button></div>}
    </div>
  );
}
