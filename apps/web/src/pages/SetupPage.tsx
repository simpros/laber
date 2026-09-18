import { useRouter } from "@tanstack/react-router";
import AuthCredentialsForm from "@/components/AuthCredentialsForm";
import { enterApp } from "@/lib/auth";

export default function SetupPage() {
  const router = useRouter();
  return (
    <AuthCredentialsForm
      mode="setup"
      onSuccess={() => {
        void enterApp(router);
      }}
    />
  );
}
