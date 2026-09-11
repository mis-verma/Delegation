import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { authApi, ADMIN_AREA_ROLES } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import type { LoginPayload, ForgotPasswordPayload, ResetPasswordPayload } from '../../api/auth';

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export const useLoginMutation = () => {
  const { login } = useAuth();
  const navigate  = useNavigate();

  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: ({ accessToken, user }) => {
      login(accessToken, {
        id:           user.id,
        name:         user.firstName ?? user.email,
        email:        user.email,
        role:         user.role,
        departmentId: user.departmentId,
        storeId:      user.storeId,
      });
      navigate(ADMIN_AREA_ROLES.includes(user.role) ? '/admin' : '/', { replace: true });
    },
  });
};

export const useForgotPasswordMutation = () => {
  return useMutation({
    mutationFn: (payload: ForgotPasswordPayload) => authApi.forgotPassword(payload),
    onSuccess: () => toast.success('If that email is registered, a reset link has been sent.'),
    onError: (err) => toast.error(errorMessage(err, 'Failed to send reset link.')),
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
