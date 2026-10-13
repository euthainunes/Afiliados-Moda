import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Perguntas frequentes" };

const FAQ: [string, React.ReactNode][] = [
  ["Como funciona?", "Você monta looks com peças das marcas parceiras, publica e compartilha o link. Quando alguém compra uma peça a partir do seu look, a venda é atribuída a você e gera uma recompensa."],
  ["Quanto eu ganho por venda?", "Um percentual do valor das peças compradas, definido por marca e campanha e informado no regulamento. O percentual vigente no dia do clique é o que vale para aquela venda, mesmo que mude depois."],
  ["Quando posso resgatar?", "A recompensa fica pendente enquanto a loja confirma a venda e corre o prazo de validação. Depois disso ela é liberada para resgate. O prazo e o marco inicial estão no regulamento."],
  ["E se a pessoa cancelar ou devolver?", "A recompensa daquela venda é ajustada ou cancelada. Se você já tiver resgatado o valor, a diferença é compensada em recompensas futuras — nada é cobrado de você."],
  ["Comprar pelo meu próprio look conta?", "Não. Compras originadas de cliques da própria autora não geram recompensa."],
  ["Como recebo?", "Por PIX, depois que a equipe analisa o pedido de resgate. Pedimos CPF e chave PIX apenas no primeiro resgate, e esses dados ficam criptografados."],
  ["Vocês veem os dados de quem compra?", "Não. Recebemos apenas o pedido, as peças e os valores necessários para calcular a recompensa — nenhum nome, e-mail ou endereço de compradora."],
  ["Como peço meus dados ou excluo minha conta?", <>Em <Link href="/app/configuracoes" className="underline">Conta e privacidade</Link> você baixa seus dados e pode excluir a conta. Outros pedidos podem ser feitos pelo <Link href="/contato" className="underline">contato</Link>.</>],
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">Perguntas frequentes</h1>
      <div className="mt-8 flex flex-col gap-3">
        {FAQ.map(([q, a]) => (
          <details key={q} className="rounded-xl border border-line bg-surface p-5">
            <summary className="cursor-pointer font-medium">{q}</summary>
            <div className="mt-3 text-muted">{a}</div>
          </details>
        ))}
      </div>
    </div>
  );
}
