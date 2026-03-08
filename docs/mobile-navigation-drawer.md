# Mobile Navigation Drawer (Dashboard)

## Objetivo
Melhorar a usabilidade em celulares no dashboard do Echo Me, liberando espaço de conteúdo e evitando sidebar fixa ocupando largura útil.

## O que foi implementado

### 1) Top bar mobile
- Exibe branding (`Echo Me`) e botão `Menu/Fechar`.
- Visível apenas em telas mobile (`md:hidden`).

### 2) Drawer off-canvas
- Abre lateralmente no mobile com backdrop escurecido.
- Fecha ao tocar no backdrop.
- Fecha automaticamente ao trocar de rota.

### 3) Sidebar desktop preservada
- Em `md+`, sidebar segue fixa no layout tradicional.

## Arquivos alterados
- `web/components/Sidebar.tsx`
- `web/app/dashboard/layout.tsx`

## Comportamento esperado
- Mobile:
  - Menu inicia fechado.
  - Clique em `Menu` abre o drawer.
  - Clique em qualquer item de navegação fecha o drawer e navega.
  - Clique fora (backdrop) fecha o drawer.
- Desktop:
  - Sidebar visível e estável como antes.

## Acessibilidade
- Botão com `aria-expanded` e `aria-controls`.
- Overlay com `role="dialog"` e `aria-modal="true"`.

## Fora de escopo
- Correções de integração em APIs de chat (`getDb`/`pushToQueue`).
- Ajustes de callback/auth URL.

## Próximos passos sugeridos
1. Adicionar animação de entrada/saída do drawer.
2. Implementar fechamento por tecla `Esc`.
3. Testes E2E mobile para navegação e fechamento automático.
