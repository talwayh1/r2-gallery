import React, { useState, useEffect } from 'react';
import { getSettings, saveSettings, getUsers, createUser, deleteUser, cleanCache, getDiagnostics } from '../api';
import { toast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';

interface SettingsPanelProps {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<{ id: number; username: string; role: string }[]>([]);
  const [activeTab, setActiveTab] = useState<'settings' | 'users' | 'diagnostics'>('settings');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    loadSettings();
    loadUsers();
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const loadSettings = async () => {
    try {
      const data = await getSettings();
      setSettings(data);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await saveSettings(settings);
      toast('success', '设置已保存');
    } catch (err) {
      toast('error', '保存失败: ' + (err as Error).message);
    }
  };

  const handleCreateUser = async () => {
    if (!newUsername || !newPassword) return;
    try {
      await createUser(newUsername, newPassword);
      setNewUsername('');
      setNewPassword('');
      loadUsers();
    } catch (err) {
      toast('error', '创建失败: ' + (err as Error).message);
    }
  };

  const handleDeleteUser = async (id: number) => {
    const confirmed = await confirm({
      title: '删除用户',
      message: '确定删除此用户？',
      confirmLabel: '删除',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteUser(id);
      loadUsers();
    } catch (err) {
      toast('error', '删除失败: ' + (err as Error).message);
    }
  };

  const handleCleanCache = async () => {
    setLoading(true);
    try {
      const result = await cleanCache();
      toast('success', `已清理 ${result.deleted} 个缓存条目`);
    } catch (err) {
      toast('error', '清理失败: ' + (err as Error).message);
    }
    setLoading(false);
  };

  const handleLoadDiagnostics = async () => {
    setLoading(true);
    try {
      const data = await getDiagnostics();
      setDiagnostics(data);
    } catch (err) {
      toast('error', '加载诊断信息失败: ' + (err as Error).message);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-4xl h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-medium">设置</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xl">✕</button>
        </div>
        <div className="flex border-b dark:border-gray-700">
          {(['settings', 'users', 'diagnostics'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); if (tab === 'diagnostics') handleLoadDiagnostics(); }}
              className={`px-4 py-2 text-sm ${activeTab === tab ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {tab === 'settings' ? '配置' : tab === 'users' ? '用户管理' : '诊断'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'settings' && (
            <div className="space-y-4 max-w-xl">
              <div>
                <label className="block text-sm font-medium mb-1">默认布局</label>
                <select
                  value={settings.layout || 'grid'}
                  onChange={(e) => setSettings({ ...settings, layout: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
                >
                  <option value="grid">网格</option>
                  <option value="list">列表</option>
                  <option value="rows">行</option>
                  <option value="columns">列</option>
                  <option value="imagelist">图片列表</option>
                  <option value="blocks">块</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">默认排序</label>
                <select
                  value={settings.sort || 'name'}
                  onChange={(e) => setSettings({ ...settings, sort: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
                >
                  <option value="name">名称</option>
                  <option value="size">大小</option>
                  <option value="mtime">日期</option>
                  <option value="kind">类型</option>
                  <option value="shuffle">随机</option>
                </select>
              </div>
              <button onClick={handleSaveSettings} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                保存设置
              </button>
              <hr className="dark:border-gray-700" />
              <div className="flex items-center justify-between">
                <span className="text-sm">隐藏登录按钮</span>
                <button onClick={() => setSettings({ ...settings, hide_login_button: settings.hide_login_button === 'true' ? 'false' : 'true' })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${settings.hide_login_button === 'true' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.hide_login_button === 'true' ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
              <p className="text-xs text-gray-500">隐藏后可通过 ?login=1 访问登录页</p>
              <hr className="dark:border-gray-700" />

              {/* Upload restrictions */}
              <h4 className="text-sm font-medium mt-4">上传限制</h4>
              <div>
                <label className="block text-sm mb-1">允许的文件类型</label>
                <input
                  type="text"
                  value={settings.upload_allowed_file_types || ''}
                  onChange={(e) => setSettings({ ...settings, upload_allowed_file_types: e.target.value })}
                  placeholder="留空允许所有类型，如: jpg,png,pdf,image/*"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">逗号分隔的扩展名或 MIME 类型，如: jpg,png,pdf,image/*</p>
              </div>
              <div>
                <label className="block text-sm mb-1">最大文件大小 (MB)</label>
                <input
                  type="number"
                  value={settings.upload_max_filesize ? Math.round(parseInt(settings.upload_max_filesize) / 1024 / 1024) : ''}
                  onChange={(e) => setSettings({ ...settings, upload_max_filesize: e.target.value ? String(parseInt(e.target.value) * 1024 * 1024) : '0' })}
                  placeholder="0 = 无限制"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">文件存在时处理</label>
                <select
                  value={settings.upload_exists || 'increment'}
                  onChange={(e) => setSettings({ ...settings, upload_exists: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
                >
                  <option value="increment">自动重命名 (文件-2.jpg)</option>
                  <option value="overwrite">覆盖</option>
                  <option value="fail">拒绝上传</option>
                </select>
              </div>
              <hr className="dark:border-gray-700" />

              {/* Cache settings */}
              <h4 className="text-sm font-medium mt-4">缓存设置</h4>
              <div>
                <label className="block text-sm mb-1">缓存清理间隔 (天)</label>
                <input
                  type="number"
                  value={settings.clean_cache_interval || '7'}
                  onChange={(e) => setSettings({ ...settings, clean_cache_interval: e.target.value })}
                  placeholder="0 = 禁用自动清理"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">0 = 禁用自动清理</p>
              </div>
              <hr className="dark:border-gray-700" />

              <button onClick={handleCleanCache} disabled={loading} className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
                {loading ? '清理中...' : '手动清理缓存'}
              </button>

              <hr className="dark:border-gray-700" />

              {/* File/Folder Filters */}
              <h4 className="text-sm font-medium mt-4">文件过滤</h4>
              <div>
                <label className="block text-sm mb-1">包含文件 (正则)</label>
                <input
                  type="text"
                  value={settings.files_include || ''}
                  onChange={(e) => setSettings({ ...settings, files_include: e.target.value })}
                  placeholder="如: \\.jpe?g$"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">排除文件 (正则)</label>
                <input
                  type="text"
                  value={settings.files_exclude || ''}
                  onChange={(e) => setSettings({ ...settings, files_exclude: e.target.value })}
                  placeholder="如: ^_hidden"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">包含目录 (正则)</label>
                <input
                  type="text"
                  value={settings.dirs_include || ''}
                  onChange={(e) => setSettings({ ...settings, dirs_include: e.target.value })}
                  placeholder="如: ^public"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">排除目录 (正则)</label>
                <input
                  type="text"
                  value={settings.dirs_exclude || ''}
                  onChange={(e) => setSettings({ ...settings, dirs_exclude: e.target.value })}
                  placeholder="如: (\\/|^)[@.]"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
                />
              </div>

              <hr className="dark:border-gray-700" />

              {/* Start Path */}
              <h4 className="text-sm font-medium mt-4">启动路径</h4>
              <div>
                <label className="block text-sm mb-1">初始目录</label>
                <input
                  type="text"
                  value={settings.start_path || ''}
                  onChange={(e) => setSettings({ ...settings, start_path: e.target.value })}
                  placeholder="留空显示根目录"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
                />
              </div>

              <hr className="dark:border-gray-700" />

              {/* Video Autoplay */}
              <h4 className="text-sm font-medium mt-4">视频设置</h4>
              <div className="flex items-center justify-between">
                <span className="text-sm">视频自动播放</span>
                <button onClick={() => setSettings({ ...settings, video_autoplay: settings.video_autoplay === 'true' ? 'false' : 'true' })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${settings.video_autoplay === 'true' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.video_autoplay === 'true' ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>

              <hr className="dark:border-gray-700" />

              {/* Download Mode */}
              <h4 className="text-sm font-medium mt-4">下载设置</h4>
              <div>
                <label className="block text-sm mb-1">下载模式</label>
                <select
                  value={settings.download_mode || 'browser'}
                  onChange={(e) => setSettings({ ...settings, download_mode: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
                >
                  <option value="browser">浏览器下载（逐文件）</option>
                  <option value="zip">ZIP 压缩下载</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">复制链接分隔符</label>
                <select
                  value={localStorage.getItem('copyLinksSeparator') || '\n'}
                  onChange={(e) => { localStorage.setItem('copyLinksSeparator', e.target.value); setSettings({ ...settings }); }}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
                >
                  <option value={'\n'}>换行符</option>
                  <option value=",">逗号</option>
                  <option value=" ">空格</option>
                  <option value="\t">制表符</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">批量复制链接时使用此分隔符连接多个链接</p>
              </div>

              <hr className="dark:border-gray-700" />

              {/* Auto-refresh Interval */}
              <h4 className="text-sm font-medium mt-4">自动刷新</h4>
              <div>
                <label className="block text-sm mb-1">自动刷新间隔</label>
                <select
                  value={localStorage.getItem('refreshInterval') || '0'}
                  onChange={(e) => { localStorage.setItem('refreshInterval', e.target.value); setSettings({ ...settings }); }}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
                >
                  <option value="0">从不自动刷新</option>
                  <option value="30000">30 秒</option>
                  <option value="60000">1 分钟</option>
                  <option value="300000">5 分钟</option>
                  <option value="900000">15 分钟</option>
                  <option value="1800000">30 分钟</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">页面在后台时自动刷新文件列表数据</p>
              </div>

              <hr className="dark:border-gray-700" />

              {/* Drag Behavior */}
              <h4 className="text-sm font-medium mt-4">拖拽行为</h4>
              <div className="flex items-center justify-between">
                <span className="text-sm">拖拽时复制 (而非移动)</span>
                <button onClick={() => setSettings({ ...settings, drag_copy: settings.drag_copy === 'true' ? 'false' : 'true' })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${settings.drag_copy === 'true' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.drag_copy === 'true' ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm">拖拽时提示确认</span>
                <button onClick={() => setSettings({ ...settings, drag_prompt: settings.drag_prompt === 'true' ? 'false' : 'true' })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${settings.drag_prompt === 'true' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.drag_prompt === 'true' ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>

              <hr className="dark:border-gray-700" />

              {/* Menu Settings */}
              <h4 className="text-sm font-medium mt-4">侧边栏菜单</h4>
              <div className="flex items-center justify-between">
                <span className="text-sm">启用侧边栏菜单</span>
                <button onClick={() => setSettings({ ...settings, menu_enabled: settings.menu_enabled === 'false' ? 'true' : 'false' })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${settings.menu_enabled !== 'false' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.menu_enabled !== 'false' ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
              <div>
                <label className="block text-sm mb-1">菜单最大深度</label>
                <input
                  type="number"
                  value={settings.menu_max_depth || '5'}
                  onChange={(e) => setSettings({ ...settings, menu_max_depth: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">菜单排序</label>
                <select
                  value={settings.menu_sort || 'name_asc'}
                  onChange={(e) => setSettings({ ...settings, menu_sort: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
                >
                  <option value="name_asc">名称升序</option>
                  <option value="name_desc">名称降序</option>
                  <option value="date_asc">日期升序</option>
                  <option value="date_desc">日期降序</option>
                </select>
              </div>

              <hr className="dark:border-gray-700" />

              {/* Image Cache Controls */}
              <h4 className="text-sm font-medium mt-4">图片缓存</h4>
              <div className="flex items-center justify-between">
                <span className="text-sm">启用 localStorage 缓存</span>
                <button onClick={() => setSettings({ ...settings, localStorage_cache: settings.localStorage_cache === 'false' ? 'true' : 'false' })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${settings.localStorage_cache !== 'false' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.localStorage_cache !== 'false' ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">启用 JavaScript 缓存</span>
                <button onClick={() => setSettings({ ...settings, javascript_cache: settings.javascript_cache === 'false' ? 'true' : 'false' })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${settings.javascript_cache !== 'false' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.javascript_cache !== 'false' ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>

              <hr className="dark:border-gray-700" />

              {/* Custom CSS */}
              <h4 className="text-sm font-medium mt-4">自定义样式</h4>
              <div>
                <label className="block text-sm mb-1">自定义 CSS</label>
                <textarea
                  value={settings.custom_css || ''}
                  onChange={(e) => setSettings({ ...settings, custom_css: e.target.value })}
                  placeholder="输入自定义 CSS..."
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm font-mono"
                />
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-4 max-w-xl">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="用户名"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
                />
                <input
                  type="password"
                  placeholder="密码"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
                />
                <button onClick={handleCreateUser} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
                  添加
                </button>
              </div>
              <div className="space-y-2">
                {users.map((user) => (
                  <div key={user.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{user.username}</span>
                        <span className="ml-2 text-xs text-gray-500">({user.role})</span>
                      </div>
                      <button onClick={() => handleDeleteUser(user.id)} className="text-red-500 hover:text-red-700 text-sm">删除</button>
                    </div>
                    {/* Per-user settings */}
                    <div className="mt-2 space-y-1">
                      <input
                        type="text"
                        placeholder="根目录 (留空=默认)"
                        className="w-full px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
                        onBlur={async (e) => {
                          if (e.target.value) {
                            try {
                              await saveSettings({ [`user_${user.username}_root`]: e.target.value });
                              toast('success', `已设置 ${user.username} 的根目录`);
                            } catch (err) {
                              toast('error', `保存失败: ${(err as Error).message}`);
                            }
                          }
                        }}
                      />
                      <input
                        type="text"
                        placeholder="包含文件 (正则，如: \\.jpg$)"
                        className="w-full px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
                        onBlur={async (e) => {
                          if (e.target.value) {
                            try {
                              await saveSettings({ [`user_${user.username}_files_include`]: e.target.value });
                              toast('success', `已设置 ${user.username} 的文件过滤`);
                            } catch (err) {
                              toast('error', `保存失败: ${(err as Error).message}`);
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8 text-gray-400">加载中...</div>
              ) : diagnostics ? (
                <div className="space-y-6">
                  {/* Database section */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                      </svg>
                      数据库
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{diagnostics.database?.users ?? '?'}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">用户</div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">{diagnostics.database?.files ?? '?'}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">文件</div>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{diagnostics.database?.settings ?? '?'}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">设置</div>
                      </div>
                    </div>
                  </div>

                  {/* R2 Storage section */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      R2 对象存储
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{diagnostics.r2?.objects ?? '?'}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">对象数</div>
                      </div>
                      <div className="bg-rose-50 dark:bg-rose-900/20 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-rose-600 dark:text-rose-400">
                          {(() => {
                            const bytes = diagnostics.r2?.totalSize ?? 0;
                            if (bytes === 0) return '0 B';
                            const k = 1024;
                            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                            const i = Math.floor(Math.log(bytes) / Math.log(k));
                            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
                          })()}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">总大小</div>
                      </div>
                    </div>
                  </div>

                  {/* Settings summary */}
                  {diagnostics.settings && Object.keys(diagnostics.settings).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        系统设置 ({(diagnostics.settings as Record<string, string>) ? Object.keys(diagnostics.settings).length : 0} 项)
                      </h4>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden text-xs">
                        <table className="w-full">
                          <tbody>
                            {diagnostics.settings && (() => {
                              const entries = Object.entries(diagnostics.settings as Record<string, string>);
                              return entries.slice(0, 10).map(([key, value], i) => (
                                <tr key={key} className={i % 2 === 0 ? 'bg-white/50 dark:bg-white/5' : ''}>
                                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300 font-mono truncate max-w-[160px]" title={key}>{key}</td>
                                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono truncate max-w-[180px]" title={value}>{value}</td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                        {diagnostics.settings && Object.keys(diagnostics.settings).length > 10 && (
                          <div className="px-3 py-2 text-center text-gray-400 text-[10px] border-t border-gray-200 dark:border-gray-700">
                            仅显示前 10 项，共 {Object.keys(diagnostics.settings).length} 项
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Environment info */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      运行环境
                    </h4>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                      <div className="grid grid-cols-2 gap-y-2 text-xs">
                        <span className="text-gray-500 dark:text-gray-400">运行时</span>
                        <span className="text-gray-700 dark:text-gray-200">{diagnostics.environment?.nodeVersion ?? '?'}</span>
                        <span className="text-gray-500 dark:text-gray-400">TypeScript</span>
                        <span className="text-gray-700 dark:text-gray-200">{diagnostics.environment?.typescript ? '✓ 启用' : '✗'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Raw JSON expandable */}
                  <details className="group">
                    <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 select-none">
                      <span className="group-open:hidden">▶</span>
                      <span className="hidden group-open:inline">▼</span>
                      {' '}查看原始 JSON 数据
                    </summary>
                    <pre className="text-[11px] bg-gray-100 dark:bg-gray-800 p-3 mt-2 rounded-lg overflow-auto max-h-[40vh] leading-relaxed">
                      {JSON.stringify(diagnostics, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">点击"诊断"标签加载</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
