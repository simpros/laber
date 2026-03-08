import { describe, it, expect } from "bun:test";
import { getCoreComposeContent, type CoreConfig } from "./core-stack";
import { parse } from "yaml";

const minimalConfig: CoreConfig = {
  rootDomain: "example.com",
  cfDnsApiToken: "test-token-123",
};

describe("getCoreComposeContent", () => {
  describe("base config with minimal required fields", () => {
    it("returns valid YAML", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed).toBeDefined();
      expect(parsed.services).toBeDefined();
    });

    it("includes the reverse-proxy service", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"]).toBeDefined();
    });

    it("uses traefik:v3 image", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].image).toBe("traefik:v3");
    });

    it("sets container name to laber-reverse-proxy", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].container_name).toBe(
        "laber-reverse-proxy"
      );
    });

    it("sets restart policy to unless-stopped", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].restart).toBe("unless-stopped");
    });

    it("sets no-new-privileges security opt", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].security_opt).toEqual([
        "no-new-privileges:true",
      ]);
    });

    it("does not include tunnel service", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services.tunnel).toBeUndefined();
    });

    it("does not include cloudflare-companion service", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["cloudflare-companion"]).toBeUndefined();
    });
  });

  describe("ports", () => {
    it("exposes port 80", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].ports).toContain("80:80");
    });

    it("exposes port 443", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].ports).toContain("443:443");
    });

    it("exposes port 8080", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].ports).toContain("8080:8080");
    });
  });

  describe("volumes", () => {
    it("mounts docker socket as read-only", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].volumes).toContain(
        "/var/run/docker.sock:/var/run/docker.sock:ro"
      );
    });

    it("mounts acme volume", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].volumes).toContain("acme:/acme");
    });

    it("mounts traefik volume", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].volumes).toContain(
        "traefik:/etc/traefik"
      );
    });

    it("defines acme and traefik named volumes", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.volumes).toBeDefined();
      expect("acme" in parsed.volumes).toBe(true);
      expect("traefik" in parsed.volumes).toBe(true);
    });
  });

  describe("environment", () => {
    it("sets CF_DNS_API_TOKEN from config", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].environment.CF_DNS_API_TOKEN).toBe(
        "test-token-123"
      );
    });
  });

  describe("labels", () => {
    it("enables traefik", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].labels).toContain(
        "traefik.enable=true"
      );
    });
  });

  describe("networks", () => {
    it("attaches reverse-proxy to main network", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].networks).toContain("main");
    });

    it("defines main as external network", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.networks.main.name).toBe("main");
      expect(parsed.networks.main.external).toBe(true);
    });
  });

  describe("command defaults", () => {
    it("defaults log level to ERROR", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].command).toContain(
        "--log.level=ERROR"
      );
    });

    it("defaults acmeEmail to admin@rootDomain", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      const emailCommand = parsed.services["reverse-proxy"].command.find(
        (c: string) => c.startsWith("--certificatesresolvers.letsencrypt.acme.email=")
      );
      expect(emailCommand).toBe(
        "--certificatesresolvers.letsencrypt.acme.email=admin@example.com"
      );
    });

    it("sets rootDomain in TLS main domain", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].command).toContain(
        "--entrypoints.websecure.http.tls.domains[0].main=example.com"
      );
    });

    it("sets wildcard SAN for rootDomain", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].command).toContain(
        "--entrypoints.websecure.http.tls.domains[0].sans=*.example.com"
      );
    });

    it("enables docker provider", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].command).toContain(
        "--providers.docker=true"
      );
    });

    it("disables exposed by default", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].command).toContain(
        "--providers.docker.exposedbydefault=false"
      );
    });

    it("sets docker network to main", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].command).toContain(
        "--providers.docker.network=main"
      );
    });

    it("enables cloudflare DNS challenge", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].command).toContain(
        "--certificatesresolvers.letsencrypt.acme.dnschallenge.provider=cloudflare"
      );
    });

    it("enables insecure skip verify", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].command).toContain(
        "--serversTransport.insecureSkipVerify=true"
      );
    });
  });

  describe("custom acmeEmail", () => {
    it("uses provided acmeEmail instead of default", () => {
      const config: CoreConfig = {
        ...minimalConfig,
        acmeEmail: "custom@mysite.org",
      };
      const result = getCoreComposeContent(config);
      const parsed = parse(result);
      const emailCommand = parsed.services["reverse-proxy"].command.find(
        (c: string) => c.startsWith("--certificatesresolvers.letsencrypt.acme.email=")
      );
      expect(emailCommand).toBe(
        "--certificatesresolvers.letsencrypt.acme.email=custom@mysite.org"
      );
    });
  });

  describe("custom logLevel", () => {
    it("uses provided logLevel", () => {
      const config: CoreConfig = {
        ...minimalConfig,
        logLevel: "DEBUG",
      };
      const result = getCoreComposeContent(config);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].command).toContain(
        "--log.level=DEBUG"
      );
    });

    it("does not contain default ERROR level when custom is set", () => {
      const config: CoreConfig = {
        ...minimalConfig,
        logLevel: "INFO",
      };
      const result = getCoreComposeContent(config);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"].command).not.toContain(
        "--log.level=ERROR"
      );
    });
  });

  describe("config with tunnel token", () => {
    const tunnelConfig: CoreConfig = {
      ...minimalConfig,
      tunnelToken: "my-tunnel-token",
    };

    it("adds tunnel service", () => {
      const result = getCoreComposeContent(tunnelConfig);
      const parsed = parse(result);
      expect(parsed.services.tunnel).toBeDefined();
    });

    it("uses cloudflare/cloudflared:latest image", () => {
      const result = getCoreComposeContent(tunnelConfig);
      const parsed = parse(result);
      expect(parsed.services.tunnel.image).toBe(
        "cloudflare/cloudflared:latest"
      );
    });

    it("sets tunnel container name", () => {
      const result = getCoreComposeContent(tunnelConfig);
      const parsed = parse(result);
      expect(parsed.services.tunnel.container_name).toBe("laber-tunnel");
    });

    it("sets tunnel command to 'tunnel run'", () => {
      const result = getCoreComposeContent(tunnelConfig);
      const parsed = parse(result);
      expect(parsed.services.tunnel.command).toBe("tunnel run");
    });

    it("sets TUNNEL_TOKEN environment variable", () => {
      const result = getCoreComposeContent(tunnelConfig);
      const parsed = parse(result);
      expect(parsed.services.tunnel.environment.TUNNEL_TOKEN).toBe(
        "my-tunnel-token"
      );
    });

    it("connects tunnel to main network", () => {
      const result = getCoreComposeContent(tunnelConfig);
      const parsed = parse(result);
      expect(parsed.services.tunnel.networks).toContain("main");
    });

    it("sets restart policy to unless-stopped", () => {
      const result = getCoreComposeContent(tunnelConfig);
      const parsed = parse(result);
      expect(parsed.services.tunnel.restart).toBe("unless-stopped");
    });
  });

  describe("config with zone ID", () => {
    const zoneConfig: CoreConfig = {
      ...minimalConfig,
      zoneId: "zone-abc-123",
    };

    it("adds cloudflare-companion service", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(parsed.services["cloudflare-companion"]).toBeDefined();
    });

    it("uses correct companion image", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(parsed.services["cloudflare-companion"].image).toBe(
        "ghcr.io/tiredofit/docker-traefik-cloudflare-companion:latest"
      );
    });

    it("sets companion container name", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(parsed.services["cloudflare-companion"].container_name).toBe(
        "laber-cloudflare-companion"
      );
    });

    it("sets CF_TOKEN from cfDnsApiToken", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(
        parsed.services["cloudflare-companion"].environment.CF_TOKEN
      ).toBe("test-token-123");
    });

    it("sets TARGET_DOMAIN from rootDomain", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(
        parsed.services["cloudflare-companion"].environment.TARGET_DOMAIN
      ).toBe("example.com");
    });

    it("sets DOMAIN1 from rootDomain", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(
        parsed.services["cloudflare-companion"].environment.DOMAIN1
      ).toBe("example.com");
    });

    it("sets DOMAIN1_ZONE_ID from zoneId", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(
        parsed.services["cloudflare-companion"].environment.DOMAIN1_ZONE_ID
      ).toBe("zone-abc-123");
    });

    it("sets DOMAIN1_PROXIED to true", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(
        parsed.services["cloudflare-companion"].environment.DOMAIN1_PROXIED
      ).toBe("true");
    });

    it("sets CF_DNS_API_TOKEN in companion", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(
        parsed.services["cloudflare-companion"].environment.CF_DNS_API_TOKEN
      ).toBe("test-token-123");
    });

    it("defaults HTTP_TIMEOUT to 180", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(
        parsed.services["cloudflare-companion"].environment.HTTP_TIMEOUT
      ).toBe("180");
    });

    it("defaults POLLING_INTERVAL to 30", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(
        parsed.services["cloudflare-companion"].environment.POLLING_INTERVAL
      ).toBe("30");
    });

    it("defaults PROPAGATION_TIMEOUT to 300", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(
        parsed.services["cloudflare-companion"].environment
          .PROPAGATION_TIMEOUT
      ).toBe("300");
    });

    it("defaults DNS_TTL to 1", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(
        parsed.services["cloudflare-companion"].environment.DNS_TTL
      ).toBe("1");
    });

    it("mounts docker socket as read-only", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(parsed.services["cloudflare-companion"].volumes).toContain(
        "/var/run/docker.sock:/var/run/docker.sock:ro"
      );
    });

    it("connects companion to main network", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(parsed.services["cloudflare-companion"].networks).toContain(
        "main"
      );
    });

    it("sets restart policy to unless-stopped", () => {
      const result = getCoreComposeContent(zoneConfig);
      const parsed = parse(result);
      expect(parsed.services["cloudflare-companion"].restart).toBe(
        "unless-stopped"
      );
    });
  });

  describe("custom httpTimeout and pollingInterval with zone ID", () => {
    it("uses provided httpTimeout", () => {
      const config: CoreConfig = {
        ...minimalConfig,
        zoneId: "zone-123",
        httpTimeout: "60",
      };
      const result = getCoreComposeContent(config);
      const parsed = parse(result);
      expect(
        parsed.services["cloudflare-companion"].environment.HTTP_TIMEOUT
      ).toBe("60");
    });

    it("uses provided pollingInterval", () => {
      const config: CoreConfig = {
        ...minimalConfig,
        zoneId: "zone-123",
        pollingInterval: "10",
      };
      const result = getCoreComposeContent(config);
      const parsed = parse(result);
      expect(
        parsed.services["cloudflare-companion"].environment.POLLING_INTERVAL
      ).toBe("10");
    });

    it("uses provided propagationTimeout", () => {
      const config: CoreConfig = {
        ...minimalConfig,
        zoneId: "zone-123",
        propagationTimeout: "600",
      };
      const result = getCoreComposeContent(config);
      const parsed = parse(result);
      expect(
        parsed.services["cloudflare-companion"].environment
          .PROPAGATION_TIMEOUT
      ).toBe("600");
    });

    it("uses provided ttl", () => {
      const config: CoreConfig = {
        ...minimalConfig,
        zoneId: "zone-123",
        ttl: "120",
      };
      const result = getCoreComposeContent(config);
      const parsed = parse(result);
      expect(
        parsed.services["cloudflare-companion"].environment.DNS_TTL
      ).toBe("120");
    });
  });

  describe("full config with all options", () => {
    it("includes all three services", () => {
      const config: CoreConfig = {
        rootDomain: "mysite.dev",
        cfDnsApiToken: "full-token",
        zoneId: "full-zone-id",
        tunnelToken: "full-tunnel-token",
        httpTimeout: "90",
        pollingInterval: "15",
        propagationTimeout: "120",
        ttl: "60",
        logLevel: "WARN",
        acmeEmail: "ops@mysite.dev",
      };
      const result = getCoreComposeContent(config);
      const parsed = parse(result);

      expect(parsed.services["reverse-proxy"]).toBeDefined();
      expect(parsed.services.tunnel).toBeDefined();
      expect(parsed.services["cloudflare-companion"]).toBeDefined();
    });
  });

  describe("traefik is always present", () => {
    it("is present with minimal config", () => {
      const result = getCoreComposeContent(minimalConfig);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"]).toBeDefined();
    });

    it("is present with tunnel token only", () => {
      const config: CoreConfig = {
        ...minimalConfig,
        tunnelToken: "tok",
      };
      const result = getCoreComposeContent(config);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"]).toBeDefined();
    });

    it("is present with zone ID only", () => {
      const config: CoreConfig = {
        ...minimalConfig,
        zoneId: "zone",
      };
      const result = getCoreComposeContent(config);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"]).toBeDefined();
    });

    it("is present with all options", () => {
      const config: CoreConfig = {
        ...minimalConfig,
        tunnelToken: "tok",
        zoneId: "zone",
      };
      const result = getCoreComposeContent(config);
      const parsed = parse(result);
      expect(parsed.services["reverse-proxy"]).toBeDefined();
    });
  });
});
