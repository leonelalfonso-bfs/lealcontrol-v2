import { Navigate, useLocation } from "react-router-dom";

/** Redirige conservando ?query y #hash (por ejemplo, el retorno de OAuth a una dirección vieja). */
export function RedirectKeepingQuery({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}
