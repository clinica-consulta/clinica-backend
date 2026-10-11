const mongoose = require("mongoose");

// Bloqueio de horário ou período na agenda de um profissional.
const bloqueioSchema = new mongoose.Schema(
    {
        profissional: { type: mongoose.Schema.Types.ObjectId, ref: "Profissional", required: true },
        dataInicio: { type: String, required: [true, "Informe a data inicial"] },
        dataFim: { type: String, required: [true, "Informe a data final"] },
        horaInicio: { type: String, required: [true, "Informe a hora inicial"] },
        horaFim: { type: String, required: [true, "Informe a hora final"] },
        motivo: { type: String, trim: true, default: "" }
    },
    { timestamps: true }
);

bloqueioSchema.pre("validate", function () {
    if (this.dataFim < this.dataInicio) this.invalidate("dataFim", "A data final deve ser depois da inicial");
    if (this.horaFim <= this.horaInicio) this.invalidate("horaFim", "A hora final deve ser depois da inicial");
});

module.exports = mongoose.model("Bloqueio", bloqueioSchema, "bloqueios");
