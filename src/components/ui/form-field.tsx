export function FormField({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  placeholder,
  error,
  helpText,
  className = "",
}: {
  label: string;
  name: string;
  type?: "text" | "email" | "number" | "tel" | "date";
  required?: boolean;
  defaultValue?: string | number;
  placeholder?: string;
  error?: string;
  helpText?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-foreground mb-1.5"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors"
      />
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      {helpText && !error && (
        <p className="mt-1.5 text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  name,
  required,
  defaultValue,
  options,
  error,
  className = "",
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  options: { value: string; label: string }[];
  error?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-foreground mb-1.5"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        id={name}
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}
