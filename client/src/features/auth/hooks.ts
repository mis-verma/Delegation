import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { authApi, ADMIN_AREA_ROLES } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import type { AuthResponse, LoginPayload, ForgotPasswordPayload, ResetPasswordPayload, ResetPasswordCodePayload } from '../../api/auth';
import { saveDeviceToken } from '../../lib/adminDevice';

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

const useCompleteLogin = () => {
  const { login } = useAuth();
  const navigate  = useNavigate();

  return ({ accessToken, user }: AuthResponse) => {
    login(accessToken, {
      id:           user.id,
      name:         user.firstName ?? user.email,
      email:        user.email,
      role:         user.role,
      departmentId: user.departmentId,
      storeId:      user.storeId,
      mustChangePassword: user.mustChangePassword === true,
    });
    navigate(ADMIN_AREA_ROLES.includes(user.role) ? '/admin' : '/', { replace: true });
  };
};

export const useLoginMutation = () => {
  const complete = useCompleteLogin();

  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: (result) => {
      if ('codeRequired' in result) return;
      complete(result);
    },
  });
};

export const useVerifyLoginCodeMutation = () => {
  const complete = useCompleteLogin();

  return useMutation({
    mutationFn: (payload: { challenge: string; code: string; rememberDevice: boolean }) => authApi.verifyLoginCode(payload),
    onSuccess: (result) => {
      if (result.deviceToken) saveDeviceToken(result.deviceToken);
      complete(result);
    },
  });
};

export const useResendLoginCodeMutation = () =>
  useMutation({
    mutationFn: (challenge: string) => authApi.resendLoginCode({ challenge }),
    onSuccess: () => toast.success('A new code is on its way.'),
    onError: (err) => toast.error(errorMessage(err, "Couldn't send a new code. Try again.")),
  });

export const useForgotPasswordMutation = () => {
  return useMutation({
    mutationFn: (payload: ForgotPasswordPayload) => authApi.forgotPassword(payload),
    onSuccess: () => toast.success('If that email is registered, a code is on its way.'),
    onError: (err) => toast.error(errorMessage(err, "Couldn't send the code. Try again.")),
  });
};

export const useResetPasswordWithCodeMutation = () => {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (payload: ResetPasswordCodePayload) => authApi.resetPasswordWithCode(payload),
    onSuccess: () => {
      toast.success('Password set. Sign in with your new password.');
      navigate('/login', { replace: true });
    },
  });
};

export const useResetPasswordMutation = () => {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (payload: ResetPasswordPayload) => authApi.resetPassword(payload),
    onSuccess: () => {
      toast.success('Password reset — please sign in with your new password.');
      navigate('/login', { replace: true });
    },
    onError: (err) => toast.error(errorMessage(err, 'Invalid or expired reset link.')),
  });
};
