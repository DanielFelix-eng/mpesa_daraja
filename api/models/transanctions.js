import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    checkoutRequestId: { type: String, required: true, unique: true, index: true },
    merchantRequestId: String,
    phone: String,
    amount: Number,
    status: { type: String, enum: ["PENDING", "SUCCESS", "FAILED"], default: "PENDING" },
    resultCode: Number,
    resultDesc: String,
    receipt: String,
  },
  { timestamps: true }
);

export default mongoose.model("Transaction", transactionSchema);