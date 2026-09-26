export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary shadow-soft hover:bg-primary-hover focus-visible:outline-primary",
  secondary:
    "border border-border-strong bg-surface text-text hover:border-muted/50 hover:bg-surface-2",
  ghost: "bg-transparent text-muted hover:bg-surface-2 hover:text-text",
  danger: "bg-danger text-white shadow-soft hover:bg-danger/90 focus-visible:outline-danger",
  soft: "bg-primary-soft text-primary hover:bg-primary/15",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 px-3 text-sm",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-5 text-[15px]",
  icon: "h-10 w-10",
};

/** Shared by <Button> and <ButtonLink> so a link never has to wrap a <button>. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className = "",
) {
  return [
    "inline-flex shrink-0 cursor-pointer select-none items-center justify-center rounded-lg font-medium",
    "transition-[background-color,border-color,color,transform,box-shadow] duration-fast ease-out",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    variantClasses[variant],
    sizeClasses[size],
    className,
  ].join(" ");
}
