import type { ProjectDetail } from './tauri-api'

const cache = new Map<string, ProjectDetail>()

export function getCachedProject(id: string): ProjectDetail | undefined {
  return cache.get(id)
}

export function setCachedProject(id: string, data: ProjectDetail): void {
  cache.set(id, data)
}

export function invalidateProject(id: string): void {
  cache.delete(id)
}
