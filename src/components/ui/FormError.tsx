type FormErrorProps = {
  message: string | null | undefined
  className?: string
}

export function FormError({ message, className = '' }: FormErrorProps) {
  if (!message) {
    return null
  }
  return (
    <p
      className={`rounded-lg border border-red-500/25 bg-red-950/40 px-3 py-2 text-sm text-red-300 ${className}`.trim()}
      role="alert"
    >
      {message}
    </p>
  )
}
