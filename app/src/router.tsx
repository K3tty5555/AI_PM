import { lazy, Suspense, type ReactElement } from "react"
import { createBrowserRouter, Navigate } from "react-router-dom"
import { AppLayout } from "./layouts/AppLayout"

const DashboardPage = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.DashboardPage })))
const SettingsPage = lazy(() => import("./pages/Settings").then((m) => ({ default: m.SettingsPage })))
const OfficeHoursPage = lazy(() => import("./pages/project/OfficeHours").then((m) => ({ default: m.OfficeHoursPage })))
const RequirementPage = lazy(() => import("./pages/project/Requirement").then((m) => ({ default: m.RequirementPage })))
const AnalysisPage = lazy(() => import("./pages/project/Analysis").then((m) => ({ default: m.AnalysisPage })))
const ResearchPage = lazy(() => import("./pages/project/Research").then((m) => ({ default: m.ResearchPage })))
const StoriesPage = lazy(() => import("./pages/project/Stories").then((m) => ({ default: m.StoriesPage })))
const PrdPage = lazy(() => import("./pages/project/Prd").then((m) => ({ default: m.PrdPage })))
const AnalyticsPage = lazy(() => import("./pages/project/Analytics").then((m) => ({ default: m.AnalyticsPage })))
const PrototypePage = lazy(() => import("./pages/project/Prototype").then((m) => ({ default: m.PrototypePage })))
const ReviewPage = lazy(() => import("./pages/project/Review").then((m) => ({ default: m.ReviewPage })))
const RetrospectivePage = lazy(() => import("./pages/project/Retrospective").then((m) => ({ default: m.RetrospectivePage })))
const ToolPriorityPage = lazy(() => import("./pages/tools/Priority").then((m) => ({ default: m.ToolPriorityPage })))
const ToolWeeklyPage = lazy(() => import("./pages/tools/Weekly").then((m) => ({ default: m.ToolWeeklyPage })))
const ToolKnowledgePage = lazy(() => import("./pages/tools/Knowledge").then((m) => ({ default: m.ToolKnowledgePage })))
const ToolPersonaPage = lazy(() => import("./pages/tools/Persona").then((m) => ({ default: m.ToolPersonaPage })))
const ToolDataPage = lazy(() => import("./pages/tools/Data").then((m) => ({ default: m.ToolDataPage })))
const ToolInterviewPage = lazy(() => import("./pages/tools/Interview").then((m) => ({ default: m.ToolInterviewPage })))
const ToolDesignSpecPage = lazy(() => import("./pages/tools/DesignSpec").then((m) => ({ default: m.ToolDesignSpecPage })))
const ToolIllustrationPage = lazy(() => import("./pages/tools/Illustration").then((m) => ({ default: m.ToolIllustrationPage })))
const ToolDoctorPage = lazy(() => import("./pages/tools/Doctor").then((m) => ({ default: m.ToolDoctorPage })))
const ToolPlazaPage = lazy(() => import("./pages/tools/Plaza").then((m) => ({ default: m.ToolPlazaPage })))
const BaoyuImaginePage = lazy(() => import("./pages/tools/plaza/BaoyuImaginePage").then((m) => ({ default: m.BaoyuImaginePage })))
const BaoyuCoverImagePage = lazy(() => import("./pages/tools/plaza/BaoyuCoverImagePage").then((m) => ({ default: m.BaoyuCoverImagePage })))
const BaoyuArticleIllustratorPage = lazy(() => import("./pages/tools/plaza/BaoyuArticleIllustratorPage").then((m) => ({ default: m.BaoyuArticleIllustratorPage })))
const BaoyuInfographicPage = lazy(() => import("./pages/tools/plaza/BaoyuInfographicPage").then((m) => ({ default: m.BaoyuInfographicPage })))
const BaoyuXhsImagesPage = lazy(() => import("./pages/tools/plaza/BaoyuXhsImagesPage").then((m) => ({ default: m.BaoyuXhsImagesPage })))
const BaoyuComicPage = lazy(() => import("./pages/tools/plaza/BaoyuComicPage").then((m) => ({ default: m.BaoyuComicPage })))
const GifStickerMakerPage = lazy(() => import("./pages/tools/plaza/GifStickerMakerPage").then((m) => ({ default: m.GifStickerMakerPage })))
const MinimaxImagePage = lazy(() => import("./pages/tools/plaza/MinimaxImagePage").then((m) => ({ default: m.MinimaxImagePage })))
const PptxGeneratorPage = lazy(() => import("./pages/tools/plaza/PptxGeneratorPage").then((m) => ({ default: m.PptxGeneratorPage })))
const BaoyuSlideDeckPage = lazy(() => import("./pages/tools/plaza/BaoyuSlideDeckPage").then((m) => ({ default: m.BaoyuSlideDeckPage })))
const MinimaxPdfPage = lazy(() => import("./pages/tools/plaza/MinimaxPdfPage").then((m) => ({ default: m.MinimaxPdfPage })))
const MinimaxDocxPage = lazy(() => import("./pages/tools/plaza/MinimaxDocxPage").then((m) => ({ default: m.MinimaxDocxPage })))
const MinimaxXlsxPage = lazy(() => import("./pages/tools/plaza/MinimaxXlsxPage").then((m) => ({ default: m.MinimaxXlsxPage })))
const BaoyuTranslatePage = lazy(() => import("./pages/tools/plaza/BaoyuTranslatePage").then((m) => ({ default: m.BaoyuTranslatePage })))
const BaoyuFormatMarkdownPage = lazy(() => import("./pages/tools/plaza/BaoyuFormatMarkdownPage").then((m) => ({ default: m.BaoyuFormatMarkdownPage })))
const BaoyuMarkdownToHtmlPage = lazy(() => import("./pages/tools/plaza/BaoyuMarkdownToHtmlPage").then((m) => ({ default: m.BaoyuMarkdownToHtmlPage })))
const BaoyuUrlToMarkdownPage = lazy(() => import("./pages/tools/plaza/BaoyuUrlToMarkdownPage").then((m) => ({ default: m.BaoyuUrlToMarkdownPage })))
const BaoyuYoutubeTranscriptPage = lazy(() => import("./pages/tools/plaza/BaoyuYoutubeTranscriptPage").then((m) => ({ default: m.BaoyuYoutubeTranscriptPage })))
const VisionAnalysisPage = lazy(() => import("./pages/tools/plaza/VisionAnalysisPage").then((m) => ({ default: m.VisionAnalysisPage })))
const BaoyuCompressImagePage = lazy(() => import("./pages/tools/plaza/BaoyuCompressImagePage").then((m) => ({ default: m.BaoyuCompressImagePage })))
const MinimaxMultimodalAVPage = lazy(() => import("./pages/tools/plaza/MinimaxMultimodalAVPage").then((m) => ({ default: m.MinimaxMultimodalAVPage })))
const BaoyuPostToWechatPage = lazy(() => import("./pages/tools/plaza/BaoyuPostToWechatPage").then((m) => ({ default: m.BaoyuPostToWechatPage })))
const BaoyuPostToWeiboPage = lazy(() => import("./pages/tools/plaza/BaoyuPostToWeiboPage").then((m) => ({ default: m.BaoyuPostToWeiboPage })))
const BaoyuPostToXPage = lazy(() => import("./pages/tools/plaza/BaoyuPostToXPage").then((m) => ({ default: m.BaoyuPostToXPage })))
const BaoyuXToMarkdownPage = lazy(() => import("./pages/tools/plaza/BaoyuXToMarkdownPage").then((m) => ({ default: m.BaoyuXToMarkdownPage })))

function routeElement(element: ReactElement) {
  return (
    <Suspense
      fallback={
        <div
          className="flex h-full min-h-80 items-center justify-center text-sm text-[var(--text-tertiary)]"
          role="status"
        >
          加载中...
        </div>
      }
    >
      {element}
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/",         element: routeElement(<DashboardPage />) },
      { path: "/settings", element: routeElement(<SettingsPage />) },
      { path: "/project/:id/office-hours", element: routeElement(<OfficeHoursPage />) },
      { path: "/project/:id/requirement", element: routeElement(<RequirementPage />) },
      { path: "/project/:id/analysis",    element: routeElement(<AnalysisPage />) },
      { path: "/project/:id/research",    element: routeElement(<ResearchPage />) },
      { path: "/project/:id/stories",     element: routeElement(<StoriesPage />) },
      { path: "/project/:id/prd",         element: routeElement(<PrdPage />) },
      { path: "/project/:id/analytics",   element: routeElement(<AnalyticsPage />) },
      { path: "/project/:id/prototype",   element: routeElement(<PrototypePage />) },
      { path: "/project/:id/review",         element: routeElement(<ReviewPage />) },
      { path: "/project/:id/retrospective", element: routeElement(<RetrospectivePage />) },
      { path: "/tools/priority",          element: routeElement(<ToolPriorityPage />) },
      { path: "/tools/weekly",            element: routeElement(<ToolWeeklyPage />) },
      { path: "/tools/knowledge",         element: routeElement(<ToolKnowledgePage />) },
      { path: "/tools/persona",           element: routeElement(<ToolPersonaPage />) },
      { path: "/tools/data",              element: routeElement(<ToolDataPage />) },
      { path: "/tools/interview",         element: routeElement(<ToolInterviewPage />) },
      { path: "/tools/design-spec",       element: routeElement(<ToolDesignSpecPage />) },
      { path: "/tools/illustration",      element: routeElement(<ToolIllustrationPage />) },
      { path: "/tools/doctor",            element: routeElement(<ToolDoctorPage />) },
      { path: "/tools/plaza",             element: routeElement(<ToolPlazaPage />) },
      // Wave 4 — 图像创作
      { path: "/tools/plaza/baoyu-imagine",             element: routeElement(<BaoyuImaginePage />) },
      { path: "/tools/plaza/baoyu-cover-image",         element: routeElement(<BaoyuCoverImagePage />) },
      { path: "/tools/plaza/baoyu-article-illustrator", element: routeElement(<BaoyuArticleIllustratorPage />) },
      { path: "/tools/plaza/baoyu-infographic",         element: routeElement(<BaoyuInfographicPage />) },
      { path: "/tools/plaza/baoyu-xhs-images",          element: routeElement(<BaoyuXhsImagesPage />) },
      { path: "/tools/plaza/baoyu-comic",               element: routeElement(<BaoyuComicPage />) },
      { path: "/tools/plaza/gif-sticker-maker",         element: routeElement(<GifStickerMakerPage />) },
      { path: "/tools/plaza/minimax-multimodal-image",  element: routeElement(<MinimaxImagePage />) },
      // Wave 5 — 文档生成
      { path: "/tools/plaza/pptx-generator",   element: routeElement(<PptxGeneratorPage />) },
      { path: "/tools/plaza/baoyu-slide-deck", element: routeElement(<BaoyuSlideDeckPage />) },
      { path: "/tools/plaza/minimax-pdf",       element: routeElement(<MinimaxPdfPage />) },
      { path: "/tools/plaza/minimax-docx",      element: routeElement(<MinimaxDocxPage />) },
      { path: "/tools/plaza/minimax-xlsx",      element: routeElement(<MinimaxXlsxPage />) },
      // Wave 6 — 内容处理
      { path: "/tools/plaza/baoyu-translate",          element: routeElement(<BaoyuTranslatePage />) },
      { path: "/tools/plaza/baoyu-format-markdown",    element: routeElement(<BaoyuFormatMarkdownPage />) },
      { path: "/tools/plaza/baoyu-markdown-to-html",   element: routeElement(<BaoyuMarkdownToHtmlPage />) },
      { path: "/tools/plaza/baoyu-url-to-markdown",    element: routeElement(<BaoyuUrlToMarkdownPage />) },
      { path: "/tools/plaza/baoyu-youtube-transcript", element: routeElement(<BaoyuYoutubeTranscriptPage />) },
      { path: "/tools/plaza/vision-analysis",          element: routeElement(<VisionAnalysisPage />) },
      { path: "/tools/plaza/baoyu-compress-image",     element: routeElement(<BaoyuCompressImagePage />) },
      // Wave 7 — 视频音频 & 社交发布
      { path: "/tools/plaza/minimax-multimodal-video",  element: routeElement(<MinimaxMultimodalAVPage />) },
      { path: "/tools/plaza/minimax-multimodal-audio",  element: routeElement(<MinimaxMultimodalAVPage />) },
      { path: "/tools/plaza/baoyu-post-to-wechat",      element: routeElement(<BaoyuPostToWechatPage />) },
      { path: "/tools/plaza/baoyu-post-to-weibo",       element: routeElement(<BaoyuPostToWeiboPage />) },
      { path: "/tools/plaza/baoyu-post-to-x",           element: routeElement(<BaoyuPostToXPage />) },
      { path: "/tools/plaza/baoyu-danger-x-to-markdown", element: routeElement(<BaoyuXToMarkdownPage />) },
      { path: "*",                         element: <Navigate to="/" replace /> },
    ],
  },
])
