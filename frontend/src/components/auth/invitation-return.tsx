import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { consumeKakaoInvitationReturn, readKakaoInvitationReturn } from "@/lib/auth-return";

export default function InvitationReturn({ children }: { children: ReactNode }) {
  // Reading without consuming keeps the destination stable during StrictMode renders.
  const [returnTo] = useState(readKakaoInvitationReturn);
  useEffect(() => {
    if (returnTo) consumeKakaoInvitationReturn();
  }, [returnTo]);

  return returnTo ? <Navigate to={returnTo} replace /> : <>{children}</>;
}
