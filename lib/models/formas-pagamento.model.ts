import mongoose from "mongoose";

const ModelSchema = new mongoose.Schema({
    nome: String,
    avista: Boolean,
    dias_intervalo: Number,

    status: String,

    disponivel_em: [String],

    empresa: {
        _id: String,
        nome: String
    },
    criado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String,
            documento: String,
            username: String
        }
    },
    atualizado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String,
            documento: String,
            username: String
        }
    }
}, {
    timestamps: {
        createdAt: 'createdAt',
        updatedAt: 'updatedAt'
    }
});

export const FormasPagamentoModel = mongoose.model("formas-pagamentos", ModelSchema);

export const FORMA_PAGAMENTO_STATUS = {
    ATIVO: 'ATIVO',
    INATIVO: 'INATIVO'
}

export const FORMA_PAGAMENTO_DISPONIVEL_EM = {
    VENDAS_PDV: 'VENDAS PDV',
    CONTAS_RECEBER: 'CONTAS A RECEBER',
    CONTAS_PAGAR: 'CONTAS A PAGAR',
}