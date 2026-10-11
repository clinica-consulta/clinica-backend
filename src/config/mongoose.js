const mongoose = require("mongoose");

// Todas as respostas da API usam "id" no lugar de "_id" e escondem "__v".
mongoose.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
    }
});

mongoose.set("strictQuery", true);
