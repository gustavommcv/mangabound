/** The line under a form field: its error when it has one, otherwise what it is for. */
export function FieldMessage({
  description,
  error,
  id,
}: {
  readonly description?: string;
  readonly error?: string;
  readonly id?: string;
}): React.JSX.Element | null {
  if (error !== undefined) {
    return (
      <p className="text-status-failed text-xs" id={id}>
        {error}
      </p>
    );
  }
  return description === undefined ? null : (
    <p className="text-muted-foreground text-xs leading-relaxed" id={id}>
      {description}
    </p>
  );
}
