export function FormField({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  value,
  placeholder,
  error,
  helpText,
  className = "",
  onChange,
  step,
  min,
  readOnly,
}: {
  label: string;
  name: string;
  type?: "text" | "email" | "number" | "tel" | "date";
  required?: boolean;
  defaultValue?: string | number;
  value?: string | number;
  placeholder?: string;
  error?: string;
  helpText?: string;
  className?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Number inputs: allowed increment, e.g. "0.01" for dollars and cents. */
  step?: string;
  min?: string;
  /** Shown but not editable (still submitted with the form). */
  readOnly?: boolean;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-ink mb-1.5"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={value !== undefined ? undefined : defaultValue}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        step={step}
        min={min}
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        className={`w-full rounded-[var(--radius-card)] border border-line px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors ${readOnly ? "bg-muted cursor-not-allowed" : "bg-white"}`}
      />
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      {helpText && !error && (
        <p className="mt-1.5 text-xs text-ink-muted">{helpText}</p>
      )}
    </div>
  );
}

export function TextareaField({
  label,
  name,
  required,
  defaultValue,
  placeholder,
  error,
  helpText,
  className = "",
  rows = 3,
  value,
  onChange,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  error?: string;
  helpText?: string;
  className?: string;
  rows?: number;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-ink mb-1.5"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <textarea
        id={name}
        name={name}
        required={required}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
      />
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      {helpText && !error && (
        <p className="mt-1.5 text-xs text-ink-muted">{helpText}</p>
      )}
    </div>
  );
}

export function CheckboxField({
  label,
  name,
  defaultChecked = false,
  helpText,
  className = "",
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  helpText?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name={name}
          value="true"
          defaultChecked={defaultChecked}
          className="mt-0.5 h-4 w-4 rounded border-line text-turquoise focus:ring-turquoise"
        />
        <div>
          <span className="text-sm font-medium text-ink">{label}</span>
          {helpText && (
            <p className="text-xs text-ink-muted mt-0.5">{helpText}</p>
          )}
        </div>
      </label>
    </div>
  );
}

export function SelectField({
  label,
  name,
  required,
  defaultValue,
  value,
  options,
  error,
  className = "",
  onChange,
  helpText,
  readOnly,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  value?: string;
  /** Shown but not editable; the current value is still submitted. */
  readOnly?: boolean;
  options: { value: string; label: string }[];
  error?: string;
  className?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  helpText?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-ink mb-1.5"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {readOnly && <input type="hidden" name={name} value={value ?? defaultValue ?? ""} />}
      <select
        id={name}
        name={readOnly ? undefined : name}
        required={required}
        disabled={readOnly}
        defaultValue={value !== undefined ? undefined : defaultValue}
        value={value}
        onChange={onChange}
        className={`w-full rounded-[var(--radius-card)] border border-line px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors ${readOnly ? "bg-muted cursor-not-allowed" : "bg-white"}`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      {helpText && !error && (
        <p className="mt-1.5 text-xs text-ink-muted">{helpText}</p>
      )}
    </div>
  );
}
