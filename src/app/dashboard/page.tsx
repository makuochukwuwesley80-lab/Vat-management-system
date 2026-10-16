import { requireProfile } from "@/lib/auth";
import { DashboardShell } from "@/components/DashboardShell";
import { SystemManagerDashboard } from "./system/SystemManagerDashboard";
import { GeneralPrincipalDashboard } from "@/components/dashboards/GeneralPrincipalDashboard";
import { CenterPrincipalDashboard } from "@/components/dashboards/CenterPrincipalDashboard";
import { MediaDashboard } from "./media/MediaDashboard";
import { WorkerDashboard } from "@/components/dashboards/WorkerDashboard";
import { FosterParentDashboard } from "@/components/dashboards/FosterParentDashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // requireProfile redirects to /login when there is no active profile
  const profile = await requireProfile();

  let content: React.ReactNode;

  switch (profile.system_role) {
    case "system_manager":
      content = <SystemManagerDashboard profile={profile} />;
      break;
    case "general_principal":
      content = <GeneralPrincipalDashboard />;
      break;
    case "center_principal":
      content = <CenterPrincipalDashboard />;
      break;
    case "media":
      content = <MediaDashboard profile={profile} />;
      break;
    case "foster_parent":
      content = <FosterParentDashboard profile={profile} />;
      break;
    default:
      // worker (Form Teacher, Subject Teacher, GDC Teacher, PDR Parent, Media Person, etc.)
      content = <WorkerDashboard profile={profile} />;
  }

  return <DashboardShell profile={profile}>{content}</DashboardShell>;
}
