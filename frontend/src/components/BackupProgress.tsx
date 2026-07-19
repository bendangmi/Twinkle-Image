'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

interface BackupProgressProps {
    percent: number;
    message: string;
    isActive: boolean;
}

export function BackupProgress({ percent, message, isActive }: BackupProgressProps) {
    useEffect(() => {
        if (!isActive) return;

        // 防止用户在操作期间刷新页面或关闭标签页
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = ''; // Chrome 需要设置 returnValue
            return ''; // 其他浏览器
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [isActive]);

    if (!isActive) return null;

    return (
        <div className="space-y-4">
            {/* 警告横幅 */}
            <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
                <AlertCircle className="mt-0.5 w-5 h-5 flex-shrink-0 text-warning" />
                <div className="flex-1 text-sm">
                    <p className="mb-1 font-medium text-foreground">
                        正在处理数据，请勿关闭页面
                    </p>
                    <p className="text-muted-foreground">
                        请保持此页面在前台运行，不要刷新或切换到其他标签页，否则可能导致数据丢失。
                    </p>
                </div>
            </div>

            {/* 进度条 */}
            <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{message}</span>
                    <span className="font-medium">{percent}%</span>
                </div>

                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-300 ease-out"
                        style={{ width: `${percent}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
