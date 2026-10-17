import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useSearchParams } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { Input, Button } from "../../components";
import { resetPasswordCodeSchema, resetPasswordSchema, type ResetPasswordCodeFields, type ResetPasswordFields } from "./Schemas";
import { useForgotPasswordMutation, useResetPasswordMutation, useResetPasswordWithCodeMutation } from "./hooks";
import { AuthBackground } from "./AuthBackground";

const SUBMIT_CLASS = "mt-1 w-full font-medium bg-gradient-to-r from-primary-800 via-primary-600 to-primary-700 hover:from-primary-700 hover:via-primary-500 hover:to-primary-600 text-white shadow-md transition-all duration-300 py-2 text-sm";
const RESEND_SECONDS = 30;

const EyeToggle = ({ shown, onToggle }: { shown: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    className="text-text-light hover:text-text transition-colors cursor-pointer"
    aria-label={shown ? "Hide password" : "Show password"}
  >
    {shown ? <EyeOff size={15} /> : <Eye size={15} />}
  </button>
);

const CodeForm = ({ initialEmail }: { initialEmail: string }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [cooldown, setCooldown] = useState(initialEmail ? RESEND_SECONDS : 0);
  const mutation = useResetPasswordWithCodeMutation();
  const resend = useForgotPasswordMutation();

  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<ResetPasswordCodeFields>({
    resolver: zodResolver(resetPasswordCodeSchema),
    defaultValues: { email: initialEmail },
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const sendAgain = async () => {
    if (!(await trigger("email"))) return;
    resend.mutate({ email: getValues("email").trim().toLowerCase() }, { onSuccess: () => setCooldown(RESEND_SECONDS) });
  };

  return (
    <form
      onSubmit={handleSubmit((d) => mutation.mutate({ email: d.email.trim().toLowerCase(), code: d.code.trim(), password: d.password }))}
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
          id="code"
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          className="tracking-[0.4em] font-semibold tabular-nums"
          error={errors.code?.message}
          {...register("code")}
        />
        <button
          type="button"
          onClick={() => void sendAgain()}
          disabled={cooldown > 0 || resend.isPending}
          className="self-end min-h-9 px-1 font-display t-meta font-semibold text-primary-600 hover:text-primary-500 disabled:text-text-light disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {resend.isPending ? "Sending..." : cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
        </button>
      </div>

      <Input
        id="password"
        label="New password"
        type={showPassword ? "text" : "password"}
        placeholder="••••••••"
        autoComplete="new-password"
        error={errors.password?.message}
        suffix={<EyeToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
        {...register("password")}
      />

      <Input
        id="confirmPassword"
        label="Confirm new password"
        type={showPassword ? "text" : "password"}
        placeholder="••••••••"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        suffix={<EyeToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
        {...register("confirmPassword")}
      />

      {mutation.isError && (
        <p role="alert" className="t-meta text-danger text-center">
          {mutation.error instanceof Error ? mutation.error.message : "Couldn't set the password. Try again."}
        </p>
      )}

      <Button type="submit" variant="primary" size="md" isLoading={mutation.isPending} className={SUBMIT_CLASS}>
        Set password
      </Button>

      <Link to="/login" className="font-display text-xs text-text-muted hover:text-text transition-colors text-center">
        Back to sign in
      </Link>
    </form>
  );
};

const LinkForm = ({ token }: { token: string }) => {
  const [showPassword, setShowPassword] = useState(false);
  const mutation = useResetPasswordMutation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFields>({
    resolver: zodResolver(resetPasswordSchema),
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate({ token, password: d.password }))} className="flex flex-col gap-3.5" noValidate>
      <Input
        id="password"
        label="New password"
        type={showPassword ? "text" : "password"}
        placeholder="••••••••"
        autoComplete="new-password"
        error={errors.password?.message}
        suffix={<EyeToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
        {...register("password")}
      />
      <Input
        id="confirmPassword"
        label="Confirm new password"
        type={showPassword ? "text" : "password"}
        placeholder="••••••••"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        suffix={<EyeToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
        {...register("confirmPassword")}
      />
      {mutation.isError && (
        <p role="alert" className="t-meta text-danger text-center">
          {mutation.error instanceof Error ? mutation.error.message : "Failed to reset password."}
        </p>
      )}
      <Button type="submit" variant="primary" size="md" isLoading={mutation.isPending} className={SUBMIT_CLASS}>
        Reset password
      </Button>
    </form>
  );
};

export const ResetPasswordForm = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email") ?? "";

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
              {token ? "Choose a new password" : "Set your password"}
            </h2>
            <p className="text-xs text-text-secondary font-display">
              {token
                ? "Enter a new password for your account."
                : email
                  ? `We sent a 6-digit code to ${email}. Enter it with your new password.`
                  : "Enter your email, the 6-digit code we emailed you, and your new password."}
            </p>
          </div>

          {token ? <LinkForm token={token} /> : <CodeForm initialEmail={email} />}
        </div>
      </div>
    </div>
  );
};
