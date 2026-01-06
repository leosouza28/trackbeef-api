import mongoose from "mongoose";

const ModelSchema = new mongoose.Schema({
    data_emissao: Date,
    data_vencimento: Date,
    data_liquidacao: Date,
    forma_pagamento: String,
    identificador: String,
    origem: String,
    status: String,
    operacao: String,
    valor_bruto: Number,
    valor_juros: Number, // valor de juros aplicado
    valor_desconto: Number, // valor de desconto aplicado
    valor_total: Number, // valor total da cobrança

    valor_recebido: Number, // valor recebido na cobrança
    valor_pago: Number, // valor pago na cobrança

    parcela: Number,
    total_parcelas: Number,
    
    cliente: {
        _id: String,
        nome: String,
        razao_social: String,
        documento: String
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
        },
        valor_bruto: Number,
        valor_desconto: Number,
        valor_liquido: Number,
    },
    parcela_ref: {
        _id: String,
        forma_pagamento: {
            _id: String,
            nome: String,
            avista: Boolean,
            dias_intervalo: Number,
        },
        data_vencimento: Date,
        valor: Number,
        numero_parcela: Number,
        total_parcelas: Number,
        grupo_id: Number
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
        },
    },
    lancamentos: [
        {
            descricao: String,
            data_pagamento: Date,
            forma_pagamento: String,
            valor: Number,
            observacao: String,
            caixa: {
                _id: String,
                nome: String,
                principal: Boolean
            },
            estornado: Boolean,
            estornado_por: {
                data_hora: Date,
                usuario: {
                    _id: String,
                    nome: String,
                    username: String,
                    documento: String,
                }
            },
            pago_por: {
                data_hora: Date,
                usuario: {
                    _id: String,
                    nome: String,
                    username: String,
                    documento: String,
                }
            },
            recebido_por: {
                data_hora: Date,
                usuario: {
                    _id: String,
                    nome: String,
                    username: String,
                    documento: String,
                }
            }
        }
    ],
    criado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String,
            username: String,
            documento: String,
        }
    },
    atualizado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String,
            username: String,
            documento: String,
        }
    },
    baixado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String,
            username: String,
            documento: String,
        }
    },
    data_baixa: Date,
    empresa: {
        _id: String,
        nome: String
    }
}, {
    timestamps: {
        createdAt: "createdAt",
        updatedAt: "updatedAt"
    }
});
export const CobrancaModel = mongoose.model("cobrancas", ModelSchema);


export const COBRANCA_ORIGEM = {
    NOTA_ENTRADA: "NOTA_ENTRADA",
    VENDA: "VENDA",
    PENDENCIA_FINANCEIRA: "PENDENCIA_FINANCEIRA",
}

export const COBRANCA_STATUS = {
    PENDENTE: "PENDENTE",
    BAIXADA: "BAIXADA",
    PAGA: "PAGA",
}
export const COBRANCA_OPERACAO = {
    CREDITO: "CREDITO",
    DEBITO: "DEBITO",
}