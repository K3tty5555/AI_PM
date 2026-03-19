import { Component, type ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--background)] text-[var(--text-primary)]">
          <p className="text-lg font-medium">出了点问题</p>
          <p className="max-w-md text-center text-sm text-[var(--text-secondary)]">
            {this.state.error?.message ?? "未知错误"}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm text-white hover:opacity-90"
          >
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
