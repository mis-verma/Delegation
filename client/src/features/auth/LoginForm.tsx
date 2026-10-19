import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { Link } from "react-router";
import { Input, Button } from "../../components";
import { loginSchema, type LoginFields } from "./Schemas";
import { useLoginMutation } from "./hooks";
import { AuthBackground } from "./AuthBackground";

export const LoginForm = () => {
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useLoginMutation();

  
  const {
    register,    
    handleSubmit, 
    formState: { errors },
  } = useForm<LoginFields>({
    resolver: zodResolver(loginSchema), 
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
              Welcome back
            </h2>
            <p className="text-xs text-text-secondary font-display">
              Sign in to your account to continue.
            </p>
          </div>

          <form
            onSubmit={handleSubmit(d => mutation.mutate(d))}
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

            <div className="flex flex-col gap-1">
              <Input
                id="password"
                label="Password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
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
              <div className="flex items-center justify-between gap-2">
                <Link
                  to="/reset-password"
                  className="font-display t-meta text-text-muted hover:text-text transition-colors"
                >
                  Have a code? Set password
                </Link>
                <Link
                  to="/forgot-password"
                  className="font-display t-meta text-primary-600 hover:text-primary-500 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {mutation.isError && (
              <p className="text-xs text-danger text-center">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : "Login failed. Please try again."}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={mutation.isPending}
              className="mt-1 w-full font-medium bg-gradient-to-r from-primary-800 via-primary-600 to-primary-700 hover:from-primary-700 hover:via-primary-500 hover:to-primary-600 text-white shadow-md transition-all duration-300 py-2 text-sm"
            >
              Sign in
            </Button>
          </form>
        </div>
      </div>

    </div>
  );
};
