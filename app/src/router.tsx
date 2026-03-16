import { createBrowserRouter } from "react-router-dom"
import { AppLayout } from "./layouts/AppLayout"
import { ProjectLayout } from "./layouts/ProjectLayout"
import { DashboardPage } from "./pages/Dashboard"
import { SettingsPage } from "./pages/Settings"
import { RequirementPage } from "./pages/project/Requirement"
import { AnalysisPage } from "./pages/project/Analysis"
import { ResearchPage } from "./pages/project/Research"
import { StoriesPage } from "./pages/project/Stories"
import { PrdPage } from "./pages/project/Prd"
import { PrototypePage } from "./pages/project/Prototype"
import { ReviewPage } from "./pages/project/Review"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "settings", element: <SettingsPage /> },
      {
        path: "project/:id",
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
    ],
  },
])
