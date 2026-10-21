import { ShareUnavailable } from "@/components/doctor-dashboard/share-gate";

/** Same answer for unknown, expired and revoked links, so a guess learns nothing. */
export default function ShareNotFound() {
  return <ShareUnavailable />;
}
