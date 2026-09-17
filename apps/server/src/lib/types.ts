export type ContainerInfo = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: Array<{
    host: number;
    container: number;
    protocol: string;
  }>;
  labels: Record<string, string>;
  networks: string[];
  createdAt: string;
};
