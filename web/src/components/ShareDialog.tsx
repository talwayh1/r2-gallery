import React, { useState, useEffect } from 'react';
import { createShare } from '../api';
import { toast } from '../hooks/useToast';

interface ShareDialogProps {
  filePath: string;
  fileName: string;
  onClose: () => void;
}

export default function ShareDialog({ filePath, fileName, onClose }: ShareDialogProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const share = await createShare(filePath, password || undefined, expiresIn || undefined);
      setShareUrl(`${window.location.origin}/share/${share.id}`);
    } catch (err) {
      toast('error', '创建失败: ' + (err as Error).message);
    }
    setLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      toast('success', '链接已复制到剪贴板');
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-medium mb-4">分享「{fileName}」</h3>
        
        {!shareUrl ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">密码保护 (可选)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
                placeholder="留空则无密码"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">有效期 (可选)</label>
              <select
                value={expiresIn || ''}
                onChange={(e) => setExpiresIn(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
              >
                <option value="">永不过期</option>
                <option value="3600">1 小时</option>
                <option value="86400">1 天</option>
                <option value="604800">7 天</option>
                <option value="2592000">30 天</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? '创建中...' : '创建链接'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm break-all font-mono">
              {shareUrl}
            </div>
            <p className="text-xs text-gray-500">
              {password ? '🔐 需要密码访问' : '🔓 无需密码'}
              {expiresIn && ` · ${Math.floor(expiresIn / 86400)}天后过期`}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={handleCopy} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
                复制链接
              </button>
              <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
