import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

type ButtonVariant = "primary" | "secondary" | "destructive" | "warning" | "link";
type ButtonSize = "sm" | "lg";

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
  children: ReactNode;
}

type ButtonAsButtonProps = ButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

interface ButtonAsLinkProps extends ButtonOwnProps {
  href: string;
  target?: string;
  rel?: string;
}

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

const BASE =
  "inline-flex items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-60";

// Shape (padding/radius/weight) for the four "real button" variants.
// "link" never uses these -- it isn't a pill, it's text.
const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "rounded-full px-3 py-1.5 text-xs font-semibold",
  lg: "rounded-full px-6 py-3 text-sm font-semibold",
};

// "link" only ever varies by text size, matching existing inline-link usage.
const LINK_SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "text-xs font-medium",
  lg: "text-sm font-medium",
};

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-foreground text-background hover:opacity-90",
  secondary: "border border-border text-foreground hover:bg-surface-muted",
  destructive: "border border-error/30 text-error hover:bg-error/10",
  warning: "bg-warning text-white hover:opacity-90",
  link: "text-primary underline-offset-2 hover:underline",
};

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "lg",
    loading = false,
    className,
    children,
    ...rest
  } = props;

  const classes = cn(
    BASE,
    variant === "link" ? LINK_SIZE_STYLES[size] : SIZE_STYLES[size],
    VARIANT_STYLES[variant],
    className
  );

  if ("href" in props && props.href !== undefined) {
    const { href, target, rel } = props;
    return (
      <Link href={href} target={target} rel={rel} className={classes}>
        {children}
      </Link>
    );
  }

  const buttonRest = rest as Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "className" | "children"
  >;

  return (
    <button
      type={buttonRest.type ?? "button"}
      className={classes}
      disabled={buttonRest.disabled || loading}
      aria-busy={loading || undefined}
      {...buttonRest}
    >
      {children}
    </button>
  );
}
