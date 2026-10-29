import React from 'react'
import { createFileRoute, Navigate, useParams } from '@tanstack/react-router'

export const Route = createFileRoute('/protection-extension/$caseNo')({
  component: ProtectionExtensionPage,
})

/** Keep existing extension links compatible with the shared dossier workspace. */
function ProtectionExtensionPage() {
  const { caseNo } = useParams({ from: '/protection-extension/$caseNo' })
  return <Navigate to="/dossier/$caseNo" params={{ caseNo }} replace />
}
