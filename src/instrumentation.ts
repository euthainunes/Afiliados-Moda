import type { Instrumentation } from "next";

// Erros de servidor capturados pelo Next (páginas, rotas, Server Actions e proxy) vão para o registro
// estruturado. O "digest" é o código que a tela de erro mostra à pessoa, para o suporte localizar o evento.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { reportError } = await import("./lib/observability");
  reportError(error, {
    method: request.method,
    // Só o caminho: a query string pode conter tokens (ex.: links de redefinição de senha).
    path: request.path.split("?")[0],
    route: context.routePath,
    routeType: context.routeType,
  });
};
