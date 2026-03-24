const ERROR_MAP: Array<{ match: (msg: string) => boolean; text: string }> = [
  { match: (m) => m.includes("API") && m.includes("配置"), text: "API 未配置，请前往设置页面配置" },
  { match: (m) => m.includes("ECONNREFUSED") || m.includes("connection"), text: "网络连接失败，请检查网络" },
  { match: (m) => m.includes("timeout") || m.includes("timed out"), text: "请求超时，请稍后重试" },
  { match: (m) => m.includes("not found") || m.includes("No such file"), text: "文件未找到" },
  { match: (m) => m.includes("permission") || m.includes("Permission denied"), text: "权限不足，请检查文件权限" },
]

export function translateError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  for (const entry of ERROR_MAP) {
    if (entry.match(msg)) return entry.text
  }
  return "操作失败，请重试"
}
