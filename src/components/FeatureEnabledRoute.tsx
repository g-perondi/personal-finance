import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppSettings } from '../context/AppSettingsProvider'

type FeatureEnabledRouteProps = {
  feature: 'investments' | 'documents'
  children: ReactNode
}

export function FeatureEnabledRoute({ feature, children }: FeatureEnabledRouteProps) {
  const { settings } = useAppSettings()
  const enabled =
    feature === 'investments' ? settings.investmentsEnabled : settings.documentsEnabled
  if (!enabled) {
    return <Navigate to="/" replace />
  }
  return children
}
