import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider } from "react-router-dom"
import { router } from "./router"
import { ErrorBoundary } from "./components/error-boundary"
import { ToastProvider } from "./components/ui/toast"
import { TooltipProvider } from "./components/ui/tooltip"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TooltipProvider delay={300} closeDelay={0}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </TooltipProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
