import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useSearchParams } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { Input, Button } from "../../components";
import { resetPasswordSchema, type ResetPasswordFields } from "./Schemas";
import { useResetPasswordMutation } from "./hooks";
import { AuthBackground } from "./AuthBackground";

export const ResetPasswordForm = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const mutation = useResetPasswordMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFields>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = (data: ResetPasswordFields) => {
    if (!token) return;
    mutation.mutate({ token, password: data.password });
  };

  return (
    <div className="w-full h-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-12 py-2">
      {/* Left Column: Hero & Overview */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-start text-left relative">
        <AuthBackground tagline="Built for teams that move fast and never miss what matters." />
      </div>

      {/* Right Column: Sleek Glass Card */}
      <div className="w-full lg:w-1/2 max-w-sm sm:max-w-md flex justify-center">
        <div
          className="relative z-10 w-full border rounded-2xl shadow-xl flex flex-col gap-4 p-5 sm:p-6"
          style={{
            background:           "var(--glass-bg)",
            borderColor:          "var(--glass-border)",
            backdropFilter:       "var(--glass-blur)",
            WebkitBackdropFilter: "var(--glass-blur)",
          }}
        >
          <div className="flex flex-col gap-1 pb-2.5 border-b border-primary-500/30">
            <h2 className="text-lg sm:text-xl font-display font-bold text-text">
              Choose a new password
            </h2>
            <p className="text-xs text-text-secondary font-display">
              Enter a new password for your account.
            </p>
          </div>

          {!token ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-danger text-center">
                This reset link is missing or invalid. Request a new one below.
              </p>
              <Link to="/forgot-password" className="font-display text-xs text-primary-600 hover:text-primary-500 transition-colors text-center">
                Request a new reset link
              </Link>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-3.5"
              noValidate
            >
              <Input
                id="password"
                label="New password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="new-password"
                error={errors.password?.message}
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="text-text-light hover:text-text transition-colors cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                }
                {...register("password")}
              />

              <Input
                id="confirmPassword"
                label="Confirm new password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="text-text-light hover:text-text transition-colors cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                }
                {...register("confirmPassword")}
              />

              {mutation.isError && (
                <p className="text-xs text-danger text-center">
                  {mutation.error instanceof Error ? mutation.error.message : "Failed to reset password."}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={mutation.isPending}
                className="mt-1 w-full font-medium bg-gradient-to-r from-primary-800 via-primary-600 to-primary-700 hover:from-primary-700 hover:via-primary-500 hover:to-primary-600 text-white shadow-md transition-all duration-300 py-2 text-sm"
              >
                Reset password
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
