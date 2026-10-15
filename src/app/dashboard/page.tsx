import { requireProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { SystemManagerDashboard } from "./system/SystemManagerDashboard";
import { GeneralPrincipalDashboard } from "@/components/dashboards/GeneralPrincipalDashboard";
import { CenterPrincipalDashboard } from "@/components/dashboards/CenterPrincipalDashboard";
import { MediaDashboard } from "./media/MediaDashboard";
import { WorkerDashboard } from "@/components/dashboards/WorkerDashboard";
import { FosterParentDashboard } from "@/components/dashboards/FosterParentDashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await requireProfile();

  const content = (() => {
    switch (profile.system_role) {
      case "system_manager":
        return <SystemManagerDashboard profile={profile} />;
      case "general_principal":
        return <GeneralPrincipalDashboard />;
      case "center_principal":
        return <CenterPrincipalDashboard />;
      case "media":
        return <MediaDashboard profile={profile} />;
      case "foster_parent":
        return <FosterParentDashboard profile={profile} />;
      default:
        return <WorkerDashboard profile={profile} />;
    }
  })();

  if (!profile) redirect("/login");

  return <DashboardShell profile={profile}>{content}</DashboardShell>;
}
