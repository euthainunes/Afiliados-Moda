"use client";

// Último recurso: erro no layout raiz. Substitui o documento inteiro, por isso usa estilos próprios.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#faf7f4", color: "#1f1a17", margin: 0 }}>
        <title>Erro inesperado</title>
        <main style={{ maxWidth: 420, margin: "0 auto", padding: "96px 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 28 }}>Não conseguimos carregar a página</h1>
          <p>Tente de novo em instantes. Se continuar, fale com o suporte informando o código abaixo.</p>
          {error.digest && <p style={{ fontFamily: "monospace" }}>Código: {error.digest}</p>}
          <button type="button" onClick={() => retry()} style={{ marginTop: 24, padding: "10px 20px", borderRadius: 8, border: "1px solid #1f1a17", background: "#fff", cursor: "pointer" }}>
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
