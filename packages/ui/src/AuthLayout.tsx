import type { ReactNode } from "react";

export interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export default function AuthLayout({
  title,
  subtitle,
  children,
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-mono text-2xl font-bold tracking-tight">
            {title}
          </h1>
          <p className="text-text-secondary mt-1 text-sm">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
