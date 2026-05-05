import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEmployee } from '@/contexts/EmployeeContext';

interface PdvAccessState {
  allowed: boolean;
  loading: boolean;
  activeSessionCount: number;
  maxSlots: number;
  sessionId: string | null;
  errorMessage: string | null;
  workHoursBlocked: boolean;
  workHoursMessage: string | null;
}

export function usePdvAccessControl() {
  const { user } = useAuth();
  const { isEmployee, ownerUserId, isOwner, effectiveUserId } = useEmployee();
  const [state, setState] = useState<PdvAccessState>({
    allowed: false,
    loading: true,
    activeSessionCount: 0,
    maxSlots: 3,
    sessionId: null,
    errorMessage: null,
    workHoursBlocked: false,
    workHoursMessage: null,
  });

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const ownerIdForAccess = isEmployee ? ownerUserId : user?.id;

  // Check work hours for employees
  const checkWorkHours = useCallback(async () => {
    if (!user?.id || !isEmployee) return { allowed: true, message: null };

    try {
      const { data, error } = await supabase.rpc('check_employee_work_hours', {
        p_employee_user_id: user.id,
      });

      if (error) {
        console.error('Error checking work hours:', error);
        return { allowed: true, message: null };
      }

      const result = data as any;
      return {
        allowed: result.allowed as boolean,
        message: result.message as string | null,
      };
    } catch {
      return { allowed: true, message: null };
    }
  }, [user?.id, isEmployee]);

  // Register PDV session
  const registerSession = useCallback(async () => {
    if (!user?.id || !ownerIdForAccess) {
      setState(prev => ({ ...prev, loading: false, allowed: false, errorMessage: 'Usuário não autenticado' }));
      return;
    }

    setState(prev => ({ ...prev, loading: true }));

    // First check work hours
    const workHoursResult = await checkWorkHours();
    if (!workHoursResult.allowed) {
      setState(prev => ({
        ...prev,
        loading: false,
        allowed: false,
        workHoursBlocked: true,
        workHoursMessage: workHoursResult.message,
        errorMessage: workHoursResult.message,
      }));
      return;
    }

    try {
      const sessionToken = `pdv-${user.id}-${Date.now()}`;
      const { data, error } = await supabase.rpc('register_pdv_session', {
        p_owner_user_id: ownerIdForAccess,
        p_session_token: sessionToken,
        p_device_info: navigator.userAgent,
      });

      if (error) {
        console.error('Error registering PDV session:', error);
        setState(prev => ({
          ...prev,
          loading: false,
          allowed: false,
          errorMessage: 'Erro ao registrar sessão do PDV',
        }));
        return;
      }

      const result = data as any;

      if (result.allowed) {
        sessionIdRef.current = result.session_id;
        setState(prev => ({
          ...prev,
          loading: false,
          allowed: true,
          sessionId: result.session_id,
          activeSessionCount: result.active_sessions,
          maxSlots: result.max_slots,
          errorMessage: null,
        }));
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          allowed: false,
          activeSessionCount: result.active_sessions,
          maxSlots: result.max_slots,
          errorMessage: result.message,
        }));
      }
    } catch (err) {
      console.error('Error in PDV access control:', err);
      setState(prev => ({
        ...prev,
        loading: false,
        allowed: false,
        errorMessage: 'Erro inesperado ao verificar acesso ao PDV',
      }));
    }
  }, [user?.id, ownerIdForAccess, checkWorkHours]);

  // Release session on unmount
  const releaseSession = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (sid) {
      try {
        await supabase.rpc('release_pdv_session', { p_session_id: sid });
      } catch {
        // Silent fail on cleanup
      }
      sessionIdRef.current = null;
    }
  }, []);

  // Heartbeat to keep session alive
  useEffect(() => {
    if (state.sessionId) {
      heartbeatRef.current = setInterval(async () => {
        try {
          await supabase.rpc('heartbeat_pdv_session', { p_session_id: state.sessionId! });
        } catch {
          // Silent
        }
      }, 2 * 60 * 1000); // Every 2 minutes
    }

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [state.sessionId]);

  // Register on mount, release on unmount
  useEffect(() => {
    if (user?.id && ownerIdForAccess) {
      registerSession();
    }

    return () => {
      releaseSession();
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [user?.id, ownerIdForAccess]);

  // Also release on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      const sid = sessionIdRef.current;
      if (sid) {
        // Use sendBeacon for reliability
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/release_pdv_session`;
        navigator.sendBeacon(
          url,
          JSON.stringify({ p_session_id: sid })
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return {
    ...state,
    retryAccess: registerSession,
    releaseSession,
  };
}
