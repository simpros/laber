import { TEST_USER } from "../fixtures/credentials";

export async function createTestUsers(baseUrl: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: TEST_USER.name,
      email: TEST_USER.email,
      password: TEST_USER.password,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn(`Seed user creation returned ${res.status}: ${text}`);
  }
}
