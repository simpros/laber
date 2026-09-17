import type { ReactNode } from "react";

export interface CardHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export default function CardHeader({
  title,
  subtitle,
  actions,
}: CardHeaderProps) {
  return (
    <div className="border-border border-b px-5 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">{title}</h2>
          {subtitle}
        </div>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
