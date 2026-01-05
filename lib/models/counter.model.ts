import mongoose from "mongoose";

const ModelSchema = new mongoose.Schema({
    nome: String,
    seq: Number,
    empresa: {
        _id: String,
        nome: String
    }
});

export const CounterModel = mongoose.model("counters", ModelSchema);
