import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router";
import { Input, Button } from "../../components";
import { forgotPasswordSchema, type ForgotPasswordFields } from "./Schemas";
import { useForgotPasswordMutation } from "./hooks";
import { AuthBackground } from "./AuthBackground";

export const ForgotPasswordForm = () => {
  const mutation = useForgotPasswordMutation();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFields>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  return (
    <div className="w-full h-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-12 py-2">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-start text-left relative">
        <AuthBackground tagline="Built for teams that move fast and never miss what matters." />
      </div>

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
            <h2 className="t-section font-display font-bold text-text">
              Reset your password
            </h2>
            <p className="text-xs text-text-secondary font-display">
              Enter your account email. We will send you a 6-digit code.
            </p>
          </div>

          <form
            onSubmit={handleSubmit(d => mutation.mutate(d, { onSuccess: () => navigate(`/reset-password?email=${encodeURIComponent(d.email.trim().toLowerCase())}`) }))}
            className="flex flex-col gap-3.5"
            noValidate
          >
            <Input
              id="email"
              label="Email address"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register("email")}
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={mutation.isPending}
              className="mt-1 w-full font-medium bg-gradient-to-r from-primary-800 via-primary-600 to-primary-700 hover:from-primary-700 hover:via-primary-500 hover:to-primary-600 text-white shadow-md transition-all duration-300 py-2 text-sm"
            >
              Send code
            </Button>

            <Link to="/reset-password" className="font-display text-xs text-primary-600 hover:text-primary-500 transition-colors text-center mt-1">
              I already have a code
            </Link>
            <Link to="/login" className="font-display text-xs text-text-muted hover:text-text transition-colors text-center">
              Back to sign in
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
};
