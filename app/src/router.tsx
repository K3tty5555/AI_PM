import { createBrowserRouter } from "react-router-dom"
import { AppLayout } from "./layouts/AppLayout"
import { ProjectLayout } from "./layouts/ProjectLayout"
import { ToolsLayout } from "./layouts/ToolsLayout"
import { DashboardPage } from "./pages/Dashboard"
import { SettingsPage } from "./pages/Settings"
import { RequirementPage } from "./pages/project/Requirement"
import { AnalysisPage } from "./pages/project/Analysis"
import { ResearchPage } from "./pages/project/Research"
import { StoriesPage } from "./pages/project/Stories"
import { PrdPage } from "./pages/project/Prd"
import { PrototypePage } from "./pages/project/Prototype"
import { ReviewPage } from "./pages/project/Review"
import { ToolPriorityPage }  from "./pages/tools/Priority"
import { ToolWeeklyPage }    from "./pages/tools/Weekly"
import { ToolKnowledgePage } from "./pages/tools/Knowledge"
import { ToolPersonaPage }   from "./pages/tools/Persona"
import { ToolDataPage }      from "./pages/tools/Data"
import { ToolInterviewPage } from "./pages/tools/Interview"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  {
    path: "/project/:id",
    element: <ProjectLayout />,
    children: [
      { path: "requirement", element: <RequirementPage /> },
      { path: "analysis", element: <AnalysisPage /> },
      { path: "research", element: <ResearchPage /> },
      { path: "stories", element: <StoriesPage /> },
      { path: "prd", element: <PrdPage /> },
      { path: "prototype", element: <PrototypePage /> },
      { path: "review", element: <ReviewPage /> },
    ],
  },
  {
    path: "/tools",
    element: <ToolsLayout />,
    children: [
      { path: "priority",  element: <ToolPriorityPage /> },
      { path: "weekly",    element: <ToolWeeklyPage /> },
      { path: "knowledge", element: <ToolKnowledgePage /> },
      { path: "persona",   element: <ToolPersonaPage /> },
      { path: "data",      element: <ToolDataPage /> },
      { path: "interview", element: <ToolInterviewPage /> },
    ],
  },
])
