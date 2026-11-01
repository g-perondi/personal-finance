export function focusFormField(fieldId: string): void {
  requestAnimationFrame(() => {
    const el = document.getElementById(fieldId)
    if (!el) {
      return
    }
    el.focus()
    if (el instanceof HTMLInputElement && el.type === 'file') {
      return
    }
  })
}

export function formFieldClass(
  baseClass: string,
  fieldId: string,
  invalidFieldId: string | null,
): string {
  if (invalidFieldId !== fieldId) {
    return baseClass
  }
  return `${baseClass} form-field--invalid`.trim()
}

export function wrapInvalidRing(
  fieldId: string,
  invalidFieldId: string | null,
  wrapperClass = '',
): string {
  if (invalidFieldId !== fieldId) {
    return wrapperClass
  }
  return `rounded-lg ring-1 ring-red-400/80 ring-inset ${wrapperClass}`.trim()
}
