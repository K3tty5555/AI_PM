import { useState, useCallback, useRef } from "react"
import { api } from "@/lib/tauri-api"

export interface RenameableProject {
  id: string
  name: string
}

export interface RenameState {
  editingId: string | null
  input: string
  loadingId: string | null
  error: string
}

export function useProjectActions<T extends RenameableProject>(
  setProjects: React.Dispatch<React.SetStateAction<T[]>>,
) {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renameError, setRenameError] = useState<string>("")
  const isConfirmingRef = useRef(false)

  const startRename = useCallback(
    (project: RenameableProject, e: React.MouseEvent) => {
      if (renamingProjectId !== null) return
      e.stopPropagation()
      setEditingProjectId(project.id)
      setRenameInput(project.name)
      setRenameError("")
      isConfirmingRef.current = false
    },
    [renamingProjectId],
  )

  const cancelRename = useCallback(() => {
    setEditingProjectId(null)
    setRenameInput("")
    setRenameError("")
    isConfirmingRef.current = false
  }, [])

  const confirmRename = useCallback(
    async (project: RenameableProject) => {
      if (isConfirmingRef.current) return
      const newName = renameInput.trim()
      if (!newName) {
        setRenameError("名称不能为空")
        return
      }
      if (newName === project.name) {
        cancelRename()
        return
      }
      isConfirmingRef.current = true
      setRenamingProjectId(project.id)
      setRenameError("")
      try {
        await api.renameProject(project.id, newName)
        setProjects((prev) =>
          prev.map((p) =>
            p.id === project.id ? { ...p, name: newName } : p,
          ),
        )
        setEditingProjectId(null)
        setRenameInput("")
        isConfirmingRef.current = false
      } catch (err) {
        setRenameError(String(err))
        isConfirmingRef.current = false
      } finally {
        setRenamingProjectId(null)
      }
    },
    [renameInput, cancelRename, setProjects],
  )

  /** Programmatic start (used by context menu where there is no MouseEvent) */
  const startRenameById = useCallback(
    (project: RenameableProject) => {
      if (renamingProjectId !== null) return
      setEditingProjectId(project.id)
      setRenameInput(project.name)
      setRenameError("")
      isConfirmingRef.current = false
    },
    [renamingProjectId],
  )

  const renameState: RenameState = {
    editingId: editingProjectId,
    input: renameInput,
    loadingId: renamingProjectId,
    error: renameError,
  }

  return {
    renameState,
    setRenameInput,
    setRenameError,
    startRename,
    startRenameById,
    cancelRename,
    confirmRename,
  }
}
