import { useState } from "react";
import { ClipboardList, Users, FileDown } from "lucide-react";
import { Button, Breadcrumbs } from "../../components";
import { useAssignableUsersQuery } from "../tasks/hook";
import { TaskList } from "../tasks";
import { ExportDialog } from "../reports";
import { TEAM_DELEGATIONS_BREADCRUMBS } from "./adminBreadcrumbs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

// --- Constants ---
const ALL_USERS = "__all__";

// Org-wide task browser — reachable at /tasks/team by both PC and ADMIN (the admin panel's own
// "Tasks" nav item links here too, rather than duplicating the page under /admin/*). Layers a
// person filter on top of TaskList's own status/category/priority/department/due-date filters
// (TaskList has its own built-in date-range picker in its toolbar, so this page doesn't need a
// second one). Deliberately uses the open `/users/assignable` endpoint rather than the
// admin-only `/users` list, since PC doesn't have the ADMIN role and would 403 on that one.
export const AdminTaskList = () => {
  const { data: users = [] } = useAssignableUsersQuery();
  const [userId, setUserId] = useState("");
  const [showExport, setShowExport] = useState(false);

  return (
    <div className="flex flex-col gap-6 w-full">
        <Breadcrumbs items={TEAM_DELEGATIONS_BREADCRUMBS} />

        {/* Header Section */}
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-6 border-b border-border">

          {/* Title Module */}
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center size-12 rounded-2xl bg-primary-500/10 text-primary-700 dark:text-primary-300 border border-primary-500/20 shrink-0">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold tracking-tight text-text">
                Team Delegations
              </h1>
              <p className="text-sm text-text-muted max-w-lg leading-relaxed">
                Every delegation across the organization — filter by person, department, status, or date to narrow your view.
              </p>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-3 w-full sm:w-auto">

            {/* Person Filter */}
            <Select value={userId || ALL_USERS} onValueChange={v => setUserId(v === ALL_USERS ? "" : v)}>
              <SelectTrigger className="flex-1 sm:w-56 h-10 text-sm" aria-label="Filter delegations by person">
                <Users className="w-4 h-4 shrink-0 text-text-light" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_USERS}>All people</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.firstName} {u.lastName ?? ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Export Button */}
            <Button variant="secondary" className="gap-2 shrink-0" onClick={() => setShowExport(true)}>
              <FileDown className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>

          </div>
        </header>

        {/* List Content */}
        <section aria-label="Delegation List" className="flex flex-col flex-1">
          <TaskList userId={userId || undefined} hideHeader />
        </section>

        {/* Modal Entry */}
        {showExport && (
          <ExportDialog
            reportModule="tasks"
            title="Export Delegations"
            description="Every delegation created in the selected period, with its status, priority, department and assignee."
            onClose={() => setShowExport(false)}
          />
        )}
    </div>
  );
};
