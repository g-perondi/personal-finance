import { useId } from 'react'

type SettingsSwitchProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  id?: string
}

export function SettingsSwitch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
}: SettingsSwitchProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <label
          htmlFor={inputId}
          className={`block text-sm font-medium ${disabled ? 'text-slate-500' : 'text-white'}`}
        >
          {label}
        </label>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
        ) : null}
      </div>
      <button
        id={inputId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`form-switch shrink-0 ${checked ? 'form-switch-on' : ''}`}
        onClick={() => {
          if (disabled) {
            return
          }
          onChange(!checked)
        }}
      >
        <span className="sr-only">{label}</span>
      </button>
    </div>
  )
}
