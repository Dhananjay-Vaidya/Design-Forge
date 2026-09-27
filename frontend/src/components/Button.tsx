import { LoaderCircle } from "lucide-react";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { Link, type LinkProps } from "react-router-dom";

import { type ButtonSize, type ButtonVariant, buttonClasses } from "./buttonStyles";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading,
      className = "",
      children,
      disabled,
      type,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {isLoading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ButtonLink({ variant, size, className = "", ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
