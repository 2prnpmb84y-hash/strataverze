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
        defaultValue={value !== undefined ? undefined : defaultValue}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors"
      />
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      {helpText && !error && (
        <p className="mt-1.5 text-xs text-muted-foreground">{helpText}</p>
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
      <textarea
        id={name}
        name={name}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors resize-y"
      />
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      {helpText && !error && (
        <p className="mt-1.5 text-xs text-muted-foreground">{helpText}</p>
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
          className="mt-0.5 h-4 w-4 rounded border-border text-primary-400 focus:ring-primary-400"
        />
        <div>
          <span className="text-sm font-medium text-foreground">{label}</span>
          {helpText && (
            <p className="text-xs text-muted-foreground mt-0.5">{helpText}</p>
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
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  value?: string;
  options: { value: string; label: string }[];
  error?: string;
  className?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
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
        defaultValue={value !== undefined ? undefined : defaultValue}
        value={value}
        onChange={onChange}
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
