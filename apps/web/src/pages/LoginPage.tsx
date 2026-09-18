import { useRouter } from "@tanstack/react-router";
import AuthCredentialsForm from "@/components/AuthCredentialsForm";
import { enterApp } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  return (
    <AuthCredentialsForm
      mode="login"
      onSuccess={() => enterApp(router)}
    />
  );
}
