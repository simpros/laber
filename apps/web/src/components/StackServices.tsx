import { Card } from "@laber/ui";
import { statusColor, containerStatusBg } from "@/lib/utils";
import type { ContainerInfo } from "@/lib/types";

export type ServiceInfo = {
  name: string;
  image: string;
  traefikRoute?: { subdomain: string; port: number };
};

export default function StackServices({
  containers,
  services,
}: {
  containers: ContainerInfo[];
  services: ServiceInfo[];
}) {
  if (containers.length > 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-text-secondary text-xs font-medium tracking-wider uppercase">
          Running Containers
        </h3>
        {containers.map((container) => (
          <div
            key={container.name}
            className={`rounded-xl border p-4 ${containerStatusBg(container.state)}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-sm font-medium">
                  {container.name}
                </p>
                <p className="text-text-muted mt-0.5 font-mono text-xs">
                  {container.image}
                </p>
              </div>
              <span
                className={`text-xs font-medium ${statusColor(container.state)}`}
              >
                {container.status}
              </span>
            </div>
            {container.ports.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {container.ports.map((port, i) => (
                  <span
                    key={i}
                    className="bg-surface-3 rounded px-1.5 py-0.5 font-mono text-xs"
                  >
                    {port.host}:{port.container}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
  if (services.length > 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-text-secondary text-xs font-medium tracking-wider uppercase">
          Defined Services
        </h3>
        {services.map((svc) => (
          <Card key={svc.name} className="p-4">
            <div className="flex items-center justify-between">
              <p className="font-mono text-sm font-medium">{svc.name}</p>
              <span className="text-text-muted font-mono text-xs">
                {svc.image}
              </span>
            </div>
            {svc.traefikRoute && (
              <p className="text-accent mt-1 font-mono text-xs">
                {svc.traefikRoute.subdomain}.* :{svc.traefikRoute.port}
              </p>
            )}
          </Card>
        ))}
      </div>
    );
  }
  return (
    <p className="text-text-muted text-sm">No service data available</p>
  );
}
