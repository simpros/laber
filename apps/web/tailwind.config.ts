import type { Config } from "tailwindcss";
import sharedConfig from "@laber/tailwind-config";

const config: Config = {
  content: ["./src/**/*.{html,js,jsx,ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx,js}"],
  theme: {
    ...sharedConfig.theme,
  },
  plugins: [...(sharedConfig.plugins ?? [])],
};

export default config;
