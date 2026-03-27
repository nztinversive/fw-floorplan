"use client"

import { useEffect } from "react"

type UnsavedChangesGuardProps = {
  hasUnsavedChanges: boolean
  message?: string
}

export default function UnsavedChangesGuard({
  hasUnsavedChanges,
  message = "You have unsaved changes. Are you sure you want to leave?"
}: UnsavedChangesGuardProps) {
  useEffect(() => {
    if (!hasUnsavedChanges) return

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = message
      return message
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [hasUnsavedChanges, message])

  return null
}
