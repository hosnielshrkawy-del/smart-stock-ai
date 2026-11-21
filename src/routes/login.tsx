import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthScreen } from "@/components/shell";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  useEffect(() => {
    if (!isPending && user) void navigate({ to: "/" });
  }, [isPending, navigate, user]);
  if (isPending || user) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <div className="h-8 w-40 animate-pulse rounded-md bg-surface-2" />
      </div>
    );
  }
  return <AuthScreen />;
}
