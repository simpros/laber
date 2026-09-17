import { useNavigate, useRouter } from "@tanstack/react-router";
import AuthCredentialsForm from "@/components/AuthCredentialsForm";

export default function LoginPage() {
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <AuthCredentialsForm
      mode="login"
      onSuccess={() => {
        // Refresh the router gate (session probe) before entering the app
        // shell so a cached logged-out verdict can't bounce us back.
        void router.invalidate();
        navigate({ to: "/" });
      }}
    />
  );
}
