import { useNavigate } from "@tanstack/react-router";
import AuthCredentialsForm from "@/components/AuthCredentialsForm";

export default function SetupPage() {
  const navigate = useNavigate();
  return (
    <AuthCredentialsForm mode="setup" onSuccess={() => navigate({ to: "/" })} />
  );
}
