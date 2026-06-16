import React, { useState, useEffect } from 'react';
import { getSettings, saveSettings, getUsers, createUser, deleteUser, cleanCache, getDiagnostics } from '../api';

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
      alert('设置已保存');
    } catch (err) {
      alert('保存失败: ' + (err as Error).message);
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
      alert('创建失败: ' + (err as Error).message);
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('确定删除此用户？')) return;
    try {
      await deleteUser(id);
      loadUsers();
    } catch (err) {
      alert('删除失败: ' + (err as Error).message);
    }
  };

  const handleCleanCache = async () => {
    setLoading(true);
    try {
      const result = await cleanCache();
      alert(`已清理 ${result.deleted} 个缓存条目`);
    } catch (err) {
      alert('清理失败: ' + (err as Error).message);
    }
    setLoading(false);
  };

  const handleLoadDiagnostics = async () => {
    setLoading(true);
    try {
      const data = await getDiagnostics();
      setDiagnostics(data);
    } catch (err) {
      alert('加载失败: ' + (err as Error).message);
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
              <button onClick={handleCleanCache} disabled={loading} className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
                {loading ? '清理中...' : '清理缓存'}
              </button>
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
                  <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div>
                      <span className="font-medium">{user.username}</span>
                      <span className="ml-2 text-xs text-gray-500">({user.role})</span>
                    </div>
                    <button onClick={() => handleDeleteUser(user.id)} className="text-red-500 hover:text-red-700 text-sm">删除</button>
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
