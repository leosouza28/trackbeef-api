interface ScopeKeys {
    [key: string]: string;
}

export interface Scope {
    key: string;
    description: string;
}

const scopes = {
    "pagina_inicial.dashboard_admin_geral": "Pagina inicial do dashboard (admin geral)",

    "usuarios.leitura": "Ler usuários",
    "usuarios.editar": "Editar usuários",

    "clientes.leitura": "Ler pessoas (clientes e fornecedores)",
    "clientes.editar": "Editar pessoas (clientes e fornecedores)",

    "perfis.leitura": "Ler perfis",
    "perfis.editar": "Editar perfis",

    "produtos.leitura": "Ler produtos",
    "produtos.editar": "Editar produtos",

    "estoque.notas_entradas_leitura": "Ler notas de entrada de estoque",
    "estoque.nota_entrada_editar": "Permite editar notas de entrada de estoque",

    "estoque.leitura": "Ler estoque",
    "estoque.editar": "Editar itens do estoque",

    "almoxarifados.leitura": "Ler almoxarifados",
    "almoxarifados.editar": "Editar almoxarifados",

    "vendas.leitura": "Ler vendas",
    "vendas.pdv": "Permite utilizar o PDV para geração de pedidos",
    "vendas.pdv_descontos": "Permite aplicar descontos no PDV",
    "vendas.editar": "Editar pedidos de venda pendentes",

    "financeiro.caixa_leitura": "Ler caixa",
    "financeiro.contas_receber_leitura": "Ler contas a receber",
    "financeiro.contas_pagar_leitura": "Ler contas a pagar",

    "configuracoes.empresa_editar": "Editar configurações da empresa",
    "configuracoes.formas_pagamento_leitura": "Ler formas de pagamento",
    "configuracoes.formas_pagamento_editar": "Editar formas de pagamento",
    "configuracoes.juros_multas_leitura": "Ler juros e multas para pagamentos atrasados",

    "configuracoes.juros_multas_editar": "Permite editar juros e multas para pagamentos atrasados",
}

function getAllAvailableScopes(): Scope[] {
    return Object.keys(scopes).map((key) => {
        return {
            key: key,
            // @ts-ignore
            description: scopes[key]
        }
    })
}

function isScopeAuthorized(scope: string, userScopes: string[]): boolean {
    if (userScopes.includes('*')) {
        return true;
    }
    return userScopes.includes(scope);
}

export {
    scopes,
    isScopeAuthorized,
    getAllAvailableScopes
};