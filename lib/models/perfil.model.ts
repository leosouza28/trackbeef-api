import mongoose from "mongoose";

const ModelSchema = new mongoose.Schema({
    nome: String,
    scopes: [String],
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

export const PerfilModel = mongoose.model("perfis", ModelSchema);
