import { useNavigate, useRouter } from "@tanstack/react-router";
import AuthCredentialsForm from "@/components/AuthCredentialsForm";

export default function SetupPage() {
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <AuthCredentialsForm
      mode="setup"
      onSuccess={() => {
        // Refresh the router gate (setup + session probes) before entering
        // the app shell so a cached needs-setup verdict can't loop us back.
        void router.invalidate();
        navigate({ to: "/" });
      }}
    />
  );
}
