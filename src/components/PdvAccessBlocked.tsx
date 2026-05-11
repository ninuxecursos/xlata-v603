import React from 'react';
import { ShieldAlert, Users, Clock, ArrowLeft, RefreshCw, MonitorSmartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface PdvAccessBlockedProps {
  errorMessage: string | null;
  activeSessionCount: number;
  maxSlots: number;
  workHoursBlocked: boolean;
  deviceConflict?: boolean;
  onRetry: () => void;
}

const PdvAccessBlocked: React.FC<PdvAccessBlockedProps> = ({
  errorMessage,
  activeSessionCount,
  maxSlots,
  workHoursBlocked,
  deviceConflict = false,
  onRetry,
}) => {
  const navigate = useNavigate();

  const renderIcon = () => {
    if (workHoursBlocked) {
      return (
        <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8 text-amber-500" />
        </div>
      );
    }
    if (deviceConflict) {
      return (
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
          <MonitorSmartphone className="w-8 h-8 text-emerald-500" />
        </div>
      );
    }
    return (
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
        <ShieldAlert className="w-8 h-8 text-destructive" />
      </div>
    );
  };

  const title = workHoursBlocked
    ? 'Fora do Horário de Expediente'
    : deviceConflict
      ? 'PDV já aberto em outro dispositivo'
      : 'Limite de Acessos Atingido';

  const fallbackMessage = deviceConflict
    ? 'Este usuário já está com o PDV aberto em outro dispositivo. Feche o PDV no outro dispositivo para continuar aqui.'
    : 'Não foi possível acessar o PDV no momento.';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center space-y-6">
        {renderIcon()}

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {errorMessage || fallbackMessage}
          </p>
          {deviceConflict && (
            <p className="text-xs text-muted-foreground/80 pt-1">
              A liberação é automática em até ~90 segundos após o outro dispositivo fechar a página do PDV.
            </p>
          )}
        </div>

        {!workHoursBlocked && !deviceConflict && (
          <div className="bg-muted/50 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>
                {activeSessionCount} de {maxSlots} acessos em uso
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-destructive rounded-full h-2 transition-all"
                style={{ width: `${Math.min((activeSessionCount / maxSlots) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground/70">
              Para liberar mais acessos simultâneos, adquira uma vaga de funcionário extra no menu Funcionários.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Voltar
          </Button>
          <Button
            className="flex-1"
            onClick={onRetry}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Tentar novamente
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PdvAccessBlocked;
