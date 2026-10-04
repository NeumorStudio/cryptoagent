---
name: cryptoagent-cartera
description: Abre la cartera real de la IA de cryptoagent (crear, desbloquear, ver saldos o pararla).
---

# Cryptoagent Cartera

1. Llama a `cryptosim_start_wallet`: arranca el firmante y abre la página en el navegador.
2. Según el estado devuelto:
   - Sin cartera: debe crearla en la página. Verá la frase una sola vez y debe anotarla en papel.
   - Bloqueada: debe introducir su contraseña en la página.
   - Desbloqueada: llama a `cryptosim_wallet_status` y muestra saldos y direcciones.
3. **NUNCA pidas ni admitas en el chat la frase de recuperación ni la contraseña.**
