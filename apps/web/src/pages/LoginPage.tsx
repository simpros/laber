import { useNavigate } from "@tanstack/react-router";
import AuthCredentialsForm from "@/components/AuthCredentialsForm";

export default function LoginPage() {
  const navigate = useNavigate();
  return (
    <AuthCredentialsForm mode="login" onSuccess={() => navigate({ to: "/" })} />
  );
}
