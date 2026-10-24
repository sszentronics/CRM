import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Enter your work email address.").transform((v) => v.toLowerCase()),
  password: z.string("Enter your password.").min(1, "Enter your password."),
  next: z.string().optional(),
});

export const emailSchema = z.object({
  email: z.email("Enter your work email address.").transform((v) => v.toLowerCase()),
});

export const newPasswordSchema = z
  .object({
    password: z.string("Choose a password.").min(10, "Use at least 10 characters."),
    confirm: z.string("Type the password again."),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "The two passwords do not match. Type them again.",
  });

export const totpCodeSchema = z.object({
  code: z
    .string("Enter the 6-digit code from your authenticator app.")
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."),
  factorId: z.string().min(1),
});

export const signUpSchema = z.object({
  company: z.string("Enter your company name.").trim().min(2, "Enter your company name.").max(60, "Keep the name under 60 characters."),
  fullName: z.string("Enter your name.").trim().min(2, "Enter your name.").max(80, "Keep the name under 80 characters."),
  email: z.email("Enter your work email address.").transform((v) => v.toLowerCase()),
  password: z.string("Choose a password.").min(10, "Use at least 10 characters."),
});
