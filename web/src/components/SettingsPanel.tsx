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
                <pre className="text-sm bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-auto max-h-[60vh]">
                  {JSON.stringify(diagnostics, null, 2)}
                </pre>
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
