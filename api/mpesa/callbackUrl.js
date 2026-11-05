import Transaction from "../models/Transaction.js";
import { stkQuery } from "./stkPush.js";
import config from "../config/indexMpesa.js";

export function maskPhone(phone) {
  if (!phone) return "";
  const s = String(phone);
  return s.length > 3 ? "*".repeat(s.length - 3) + s.slice(-3) : s;
}

export async function savePending(checkoutRequestId, data) {
  return Transaction.create({ checkoutRequestId, status: "PENDING", ...data });
}

export async function handleCallback(body, configArg) {
  const cb = body?.Body?.stkCallback;
  if (!cb) throw new Error("Malformed callback");

  const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = cb;
  const config = configArg || globalThis.__mpesaConfig || {};

  // Only update transactions that already exist from savePending. No upsert.
  const existing = await Transaction.findOne({
    checkoutRequestId: CheckoutRequestID,
  }).lean();

  if (!existing) {
    console.log(
      `Callback for unknown CheckoutRequestID, ignoring: ${CheckoutRequestID}`
    );
    return null;
  }

  // Never downgrade: once SUCCESS, later callbacks must not change it.
  if (existing.status === "SUCCESS") {
    console.log(
      `Duplicate callback for already SUCCESS transaction: ${CheckoutRequestID}`
    );
    return existing;
  }

  // Parse CallbackMetadata
  const items = CallbackMetadata?.Item || [];
  const get = (name) => items.find((i) => i.Name === name)?.Value;
  const callbackAmountRaw = get("Amount");
  const callbackAmount =
    callbackAmountRaw !== undefined ? Number(callbackAmountRaw) : undefined;
  const receipt = get("MpesaReceiptNumber");
  const phone = String(get("PhoneNumber"));

  // Amount check: compare callback Amount with saved amount.
  const savedAmount = Number(existing.amount);
  if (
    callbackAmount !== undefined &&
    callbackAmount !== savedAmount
  ) {
    console.log(
      `Amount mismatch for ${CheckoutRequestID}: saved=${savedAmount} callback=${callbackAmountRaw} maskPhone=${maskPhone(existing.phone)}`
    );
    return Transaction.findOneAndUpdate(
      { checkoutRequestId: CheckoutRequestID },
      {
        $set: {
          merchantRequestId: cb.MerchantRequestID,
          resultCode: ResultCode,
          resultDesc: "Amount mismatch",
          status: "FAILED",
        },
      },
      { new: true }
    );
  }

  // Determine if we should skip verification (sandbox only)
  const skipVerify =
    process.env.MPESA_SKIP_VERIFY === "true" &&
    process.env.MPESA_ENV === "sandbox";

  if (
    process.env.MPESA_SKIP_VERIFY === "true" &&
    process.env.MPESA_ENV === "production"
  ) {
    console.warn(
      "MPESA_SKIP_VERIFY is set in production, ignoring it"
    );
  }

  let newStatus = "FAILED";
  let newResultDesc = ResultDesc || "";

  if (ResultCode === 0) {
    if (skipVerify) {
      newStatus = "SUCCESS";
      newResultDesc = "Success (verification skipped)";
    } else {
      // Verify before trusting: call stkQuery
      try {
        const queryResult = await stkQuery(CheckoutRequestID);
        const queryCode = queryResult.ResultCode;
        if (queryCode === "0" || queryCode === 0) {
          newStatus = "SUCCESS";
          newResultDesc = "Success";
        } else {
          console.warn(
            `Verification disagreed for ${CheckoutRequestID}: query ResultCode=${queryCode}, keeping PENDING`
          );
          return existing;
        }
      } catch (err) {
        console.warn(
          `Verification query failed for ${CheckoutRequestID}: ${err.message}, keeping PENDING`
        );
        return existing;
      }
    }
  } else {
    newStatus = "FAILED";
    newResultDesc = ResultDesc || "Failed";
  }

  const update = {
    merchantRequestId: cb.MerchantRequestID,
    resultCode: ResultCode,
    resultDesc: newResultDesc,
    status: newStatus,
  };
  if (receipt) update.receipt = receipt;
  if (phone) update.phone = phone;
  if (callbackAmount !== undefined) update.amount = callbackAmount;

  return Transaction.findOneAndUpdate(
    { checkoutRequestId: CheckoutRequestID },
    { $set: update },
    { new: true }
  );
}

export async function getTransaction(checkoutRequestId) {
  return Transaction.findOne({ checkoutRequestId }).lean();
}
