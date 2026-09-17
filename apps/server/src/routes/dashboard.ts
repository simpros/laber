import { Elysia } from "elysia";
import { getDashboard } from "../lib/dashboard";

export const dashboardRoutes = new Elysia().get("/api/dashboard", async () => {
  return getDashboard();
});
