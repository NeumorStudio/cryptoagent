---
name: cryptoagent-peticiones
description: Muestra lo que el agente trader ha pedido y no tiene (cuentas, herramientas, mercados) y permite resolverlas.
---

# Cryptoagent Peticiones

1. Llama a `cryptosim_capability_requests`. Si no hay ninguna abierta, infórmalo y termina.
2. Muestra las peticiones de la más solicitada a la menos: qué pide, cuántas veces, por qué y qué haría con ello.
3. Pregunta con ask_question si el usuario desea responder a alguna (Aceptada, Rechazada o Hecha).
4. Registra cada resolución llamando a `cryptosim_resolve_capability_request`.
