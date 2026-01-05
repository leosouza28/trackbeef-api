import mongoose from "mongoose";

const ModelSchema = new mongoose.Schema({
    data: Date,
    caixa: {
        _id: String,
        nome: String,
        principal: Boolean
    },
    nota: {
        _id: String,
        numero_nota: String,
        data_nota: Date,
        fornecedor: {
            _id: String,
            nome: String,
            razao_social: String,
            documento: String
        }
    },
    venda: {
        _id: String,
        data: Date,
        codigo: String,
        cliente: {
            _id: String,
            nome: String,
            razao_social: String,
            documento: String
        }
    },
    descricao: String,
    tipo_operacao: String,
    saldo_antes: Number,
    valor: Number,
    saldo_depois: Number,
    criado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String,
            documento: String,
            username: String
        }
    },
    empresa: {
        _id: String,
        nome: String
    }
}, {
    timestamps: {
        createdAt: 'createdAt',
        updatedAt: 'updatedAt'
    }
});

export const CaixaMovimentoModel = mongoose.model("caixas-movimentos", ModelSchema);

export const CAIXA_TIPO_OPERACAO = {
    CREDITO: "ENTRADA",
    DEBITO: "SAIDA"
}

export const CAIXA_TIPO_DESCRICAO_OPERACAO = {
    CREDITO: {
        INVESTIMENTO_SOCIO: "INVESTIMENTO DE SOCIO",
        RECEBIMENTO: "RECEBIMENTO",
        VENDA_RECEBIMENTO: "RECEBIMENTO DE VENDA",
        AJUSTE_ENTRADA: "AJUSTE DE ENTRADA",
        // ESTORNO - CREDITO
        ESTORNO_PAGAMENTO_FORNECEDOR: "ESTORNO DE PAGAMENTO DE FORNECEDOR",
        ESTORNO_PAGAMENTO_DESPESA: "ESTORNO DE PAGAMENTO DE DESPESA",
        ESTORNO_PAGAMENTO: "ESTORNO DE PAGAMENTO",
    },
    DEBITO: {
        RETIRADA_SOCIO: "RETIRADA DE SOCIO",
        // ESTORNO - DEBITO
        ESTORNO_RECEBIMENTO_VENDA: "ESTORNO DE RECEBIMENTO DE VENDA",
        PAGAMENTO_FORNECEDOR: "PAGAMENTO DE FORNECEDOR",
        PAGAMENTO_DESPESA: "PAGAMENTO DE DESPESA",
        PAGAMENTO: "PAGAMENTO",
        AJUSTE_SAIDA: "AJUSTE DE SAIDA"
    }
}