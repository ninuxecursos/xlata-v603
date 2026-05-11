## Objetivo

Garantir que cada **usuário** (dono ou funcionário) só consiga ter o PDV aberto em **1 dispositivo por vez**. Se um segundo dispositivo logado com o mesmo email tentar abrir o PDV enquanto o primeiro está ativo, ele é **bloqueado** com mensagem clara, e só libera quando o primeiro fechar a página.

A regra do plano (slots por funcionário) continua valendo no nível da assinatura: dono = 1 PDV, cada funcionário contratado = 1 PDV. A nova regra adiciona que **o mesmo usuário não pode duplicar o PDV em dois dispositivos**.

## Como vai funcionar

1. **Identificador de dispositivo (device_id)**: cada navegador gera um UUID estável e o guarda em `localStorage` (`pdv_device_id`). Isso identifica o dispositivo de forma confiável.
2. **Sessão considerada "viva"**: a sessão atual no banco é considerada ativa enquanto o `last_heartbeat` for recente (≤ 90 segundos). Heartbeat continua de 2 em 2 min, mas reduzimos para **45 segundos** para detectar fechamento mais rápido.
3. **Ao abrir o PDV no dispositivo B**:
   - Se já existe sessão ativa do mesmo `employee_user_id` com `device_id` diferente e heartbeat fresco → **bloqueia** com mensagem específica ("PDV já aberto em outro dispositivo. Feche o PDV no outro dispositivo para continuar aqui.").
   - Se a sessão existente é do mesmo `device_id` → reutiliza (comportamento atual).
   - Se a sessão existente está obsoleta (heartbeat > 90s) ou foi liberada → assume normalmente.
4. **Fechamento confiável**: mantemos `beforeunload` com `sendBeacon` + heartbeat curto, garantindo que o segundo dispositivo consiga entrar logo após o primeiro fechar (no máximo ~90s de espera no pior caso).

## Mudanças no banco (migration)

1. Adicionar coluna `device_id text` em `pdv_sessions` (nullable, retrocompatível).
2. Atualizar RPC `register_pdv_session(p_owner_user_id, p_session_token, p_device_info, p_device_id)`:
   - Considerar "ativa" apenas quando `is_active = true AND last_heartbeat > now() - interval '90 seconds'`.
   - Se existe sessão ativa do mesmo `employee_user_id` com `device_id` diferente → retornar `{allowed:false, reason:'device_conflict', message:'PDV já aberto em outro dispositivo...'}`.
   - Se mesmo `device_id` → reutilizar.
   - Se obsoleta (heartbeat antigo) → marcar `is_active=false` e criar nova.
3. Atualizar `check_pdv_access` (se necessário) para considerar apenas sessões com heartbeat fresco no contador de slots ocupados.
4. Manter `release_pdv_session` e `heartbeat_pdv_session` como estão.

## Mudanças no frontend

**`src/hooks/usePdvAccessControl.ts`**
- Gerar/recuperar `pdv_device_id` do `localStorage` no mount.
- Passar `p_device_id` na chamada `register_pdv_session`.
- Reduzir intervalo do heartbeat para 45s.
- Tratar novo retorno `reason: 'device_conflict'` setando `errorMessage` específico (sem contar como "limite de slots atingido").
- Adicionar polling leve (a cada 10s) quando bloqueado por `device_conflict` para auto-liberar quando o outro dispositivo fechar — ou usar Realtime no `pdv_sessions` filtrado pelo `employee_user_id`.

**`src/components/PdvAccessBlocked.tsx`**
- Novo estado visual quando `reason === 'device_conflict'`: ícone de monitor/dispositivo, título "PDV já aberto em outro dispositivo", instrução clara para fechar lá ou clicar em "Tentar novamente".
- Mantém os outros estados (limite de slots, fora de expediente).

## Detalhes técnicos

```text
pdv_sessions
├── id
├── owner_user_id        (dono da assinatura)
├── employee_user_id     (quem está usando = auth.uid())
├── device_id            (NOVO — UUID por navegador)
├── session_token
├── device_info
├── last_heartbeat
└── is_active

Regra de unicidade lógica (não constraint):
  para cada employee_user_id, no máx 1 sessão com
  is_active=true AND last_heartbeat > now()-90s
```

- `device_id` em `localStorage` sobrevive a recargas, mas é único por navegador/perfil — exatamente o comportamento desejado (mesmo PC com 2 navegadores diferentes contam como 2 dispositivos, o que é coerente).
- A janela de 90s é o pior caso para o segundo dispositivo entrar após o primeiro travar/cair sem disparar `beforeunload`. Combinada com `sendBeacon` no fechamento normal, a transição é praticamente imediata.

## Fora do escopo

- Não alterar a quantidade de slots por plano (continua: dono + funcionários contratados).
- Não mexer em login/sessão de auth do Supabase — só na sessão lógica do PDV.