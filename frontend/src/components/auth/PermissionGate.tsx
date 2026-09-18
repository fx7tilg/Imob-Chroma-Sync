import type { PropsWithChildren, ReactNode } from "react";
import { useAuth } from "../../auth/AuthContext";
import type { PermissionKey } from "../../utils/permissions";

interface PermissionGateProps extends PropsWithChildren {
  permission: PermissionKey;
  fallback?: ReactNode;
}

export default function PermissionGate({
  permission,
  children,
  fallback
}: PermissionGateProps) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) {
    return (
      <>{fallback ?? (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            color: "var(--text-2)",
            fontSize: "0.875rem"
          }}
        >
          You do not have permission to view this page.
        </div>
      )}</>
    );
  }
  return <>{children}</>;
}
