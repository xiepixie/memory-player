import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

export interface DashboardCardProps {
    title: string;
    icon: LucideIcon;
    subtitle?: string | ReactNode;
    headerAction?: ReactNode;
    children: ReactNode;
    className?: string;
    headerColor?: string;
}

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
    <div className="flex items-center justify-between mb-4 shrink-0">
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

export const DashboardCard = ({
    title,
    icon,
    subtitle,
    headerAction,
    children,
    className = "",
    headerColor
}: DashboardCardProps) => {
    return (
        <div className={`card bg-base-100 shadow-sm border border-base-200 h-full ${className}`}>
            <div className="card-body p-6 flex flex-col h-full">
                <CardHeader 
                    icon={icon} 
                    title={title} 
                    subtitle={subtitle} 
                    action={headerAction}
                    color={headerColor}
                />
                <div className="flex-1 relative min-h-0 flex flex-col">
                    {children}
                </div>
            </div>
        </div>
    );
};

export const TooltipCard = ({
    title,
    items,
    footer,
    severity = 'neutral'
}: {
    title?: string;
    items: { label: string; value: string | number; color?: string }[];
    footer?: string;
    severity?: 'neutral' | 'success' | 'warning' | 'error';
}) => {
    const bgColors = {
        neutral: 'bg-gray-800 text-gray-100',
        success: 'bg-emerald-800 text-emerald-50',
        warning: 'bg-amber-900 text-amber-50',
        error: 'bg-rose-900 text-rose-50'
    };

    return (
        <div className={`z-50 px-3 py-2 rounded-lg shadow-xl text-xs backdrop-blur-md ${bgColors[severity]} border border-white/10 min-w-[120px]`}>
            {title && <div className="font-bold mb-1 border-b border-white/10 pb-1 opacity-90">{title}</div>}
            <div className="space-y-1">
                {items.map((item, i) => (
                    <div key={i} className="flex justify-between items-center gap-3">
                        <span className="opacity-70">{item.label}</span>
                        <span className={`font-mono font-bold ${item.color || ''}`}>{item.value}</span>
                    </div>
                ))}
            </div>
            {footer && <div className="mt-2 pt-1 border-t border-white/10 opacity-60 text-[10px] italic">{footer}</div>}
        </div>
    );
};

export const StatLabelIcon = ({
    icon: Icon,
    label,
    iconClassName,
}: {
    icon: any,
    label: string,
    iconClassName?: string,
}) => (
    <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-base-content/40">
        <Icon size={12} className={iconClassName} />
        {label}
    </div>
);
