import { createBrowserRouter, Navigate } from "react-router-dom"
import { AppLayout } from "./layouts/AppLayout"
import { DashboardPage } from "./pages/Dashboard"
import { SettingsPage } from "./pages/Settings"
import { OfficeHoursPage } from "./pages/project/OfficeHours"
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
import { ToolPlazaPage } from "./pages/tools/Plaza"
// Wave 4 — 图像创作
import { BaoyuImaginePage }            from "./pages/tools/plaza/BaoyuImaginePage"
import { BaoyuCoverImagePage }         from "./pages/tools/plaza/BaoyuCoverImagePage"
import { BaoyuArticleIllustratorPage } from "./pages/tools/plaza/BaoyuArticleIllustratorPage"
import { BaoyuInfographicPage }        from "./pages/tools/plaza/BaoyuInfographicPage"
import { BaoyuXhsImagesPage }          from "./pages/tools/plaza/BaoyuXhsImagesPage"
import { BaoyuComicPage }              from "./pages/tools/plaza/BaoyuComicPage"
import { GifStickerMakerPage }         from "./pages/tools/plaza/GifStickerMakerPage"
import { MinimaxImagePage }            from "./pages/tools/plaza/MinimaxImagePage"

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/",         element: <DashboardPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/project/:id/office-hours", element: <OfficeHoursPage /> },
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
      { path: "/tools/plaza",             element: <ToolPlazaPage /> },
      // Wave 4 — 图像创作
      { path: "/tools/plaza/baoyu-imagine",             element: <BaoyuImaginePage /> },
      { path: "/tools/plaza/baoyu-cover-image",         element: <BaoyuCoverImagePage /> },
      { path: "/tools/plaza/baoyu-article-illustrator", element: <BaoyuArticleIllustratorPage /> },
      { path: "/tools/plaza/baoyu-infographic",         element: <BaoyuInfographicPage /> },
      { path: "/tools/plaza/baoyu-xhs-images",          element: <BaoyuXhsImagesPage /> },
      { path: "/tools/plaza/baoyu-comic",               element: <BaoyuComicPage /> },
      { path: "/tools/plaza/gif-sticker-maker",         element: <GifStickerMakerPage /> },
      { path: "/tools/plaza/minimax-multimodal-image",  element: <MinimaxImagePage /> },
      // 其余 plaza skill 页面（Wave 5-7，待实现）
      { path: "/tools/plaza/:skillId", element: <div className="flex items-center justify-center h-full text-sm text-[var(--text-tertiary)]">该技能页面正在开发中</div> },
      { path: "*",                         element: <Navigate to="/" replace /> },
    ],
  },
])
