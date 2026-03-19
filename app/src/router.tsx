import { createBrowserRouter } from "react-router-dom"
import { AppLayout } from "./layouts/AppLayout"
import { DashboardPage } from "./pages/Dashboard"
import { SettingsPage } from "./pages/Settings"
import { RequirementPage } from "./pages/project/Requirement"
import { AnalysisPage } from "./pages/project/Analysis"
import { ResearchPage } from "./pages/project/Research"
import { StoriesPage } from "./pages/project/Stories"
import { PrdPage } from "./pages/project/Prd"
import { AnalyticsPage } from "./pages/project/Analytics"
import { PrototypePage } from "./pages/project/Prototype"
import { ReviewPage } from "./pages/project/Review"
import { RetrospectivePage } from "./pages/project/Retrospective"
import { ToolPriorityPage }  from "./pages/tools/Priority"
import { ToolWeeklyPage }    from "./pages/tools/Weekly"
import { ToolKnowledgePage } from "./pages/tools/Knowledge"
import { ToolPersonaPage }   from "./pages/tools/Persona"
import { ToolDataPage }      from "./pages/tools/Data"
import { ToolInterviewPage } from "./pages/tools/Interview"
import { ToolDesignSpecPage } from "./pages/tools/DesignSpec"

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/",         element: <DashboardPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/project/:id/requirement", element: <RequirementPage /> },
      { path: "/project/:id/analysis",    element: <AnalysisPage /> },
      { path: "/project/:id/research",    element: <ResearchPage /> },
      { path: "/project/:id/stories",     element: <StoriesPage /> },
      { path: "/project/:id/prd",         element: <PrdPage /> },
      { path: "/project/:id/analytics",   element: <AnalyticsPage /> },
      { path: "/project/:id/prototype",   element: <PrototypePage /> },
      { path: "/project/:id/review",         element: <ReviewPage /> },
      { path: "/project/:id/retrospective", element: <RetrospectivePage /> },
      { path: "/tools/priority",          element: <ToolPriorityPage /> },
      { path: "/tools/weekly",            element: <ToolWeeklyPage /> },
      { path: "/tools/knowledge",         element: <ToolKnowledgePage /> },
      { path: "/tools/persona",           element: <ToolPersonaPage /> },
      { path: "/tools/data",              element: <ToolDataPage /> },
      { path: "/tools/interview",         element: <ToolInterviewPage /> },
      { path: "/tools/design-spec",       element: <ToolDesignSpecPage /> },
    ],
  },
])
