import React from 'react';

export const CardHeader = ({
    icon: Icon,
    title,
    subtitle,
    color = "text-primary",
    action
}: {
    icon: any,
    title: string,
    subtitle?: string | React.ReactNode,
    color?: string,
    action?: React.ReactNode
}) => (
    <div className="flex items-center justify-between mb-4">
        <div className={`flex items-center gap-2 ${color} font-bold uppercase text-xs tracking-wider`}>
            <Icon size={16} />
            {title}
        </div>
        <div className="flex items-center gap-2">
            {subtitle && <span className="text-[10px] opacity-50 font-mono">{subtitle}</span>}
            {action}
        </div>
    </div>
);
