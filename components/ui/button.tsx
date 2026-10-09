import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 rounded-control text-body font-semibold whitespace-nowrap transition-colors duration-100 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-tl-primary text-white shadow-card hover:bg-tl-primary-hover",
        secondary: "border border-tl-line-strong bg-tl-surface text-tl-text hover:bg-tl-raised",
        danger: "border border-tl-danger/40 bg-tl-surface text-tl-danger hover:bg-tl-danger/5",
        ghost: "bg-transparent text-tl-text-2 hover:bg-tl-raised hover:text-tl-text",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-label",
        icon: "size-10 px-0",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, block, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size, block }), className)} {...props} />;
}
