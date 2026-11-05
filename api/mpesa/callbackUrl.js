const transactions = new Map();

export function savePending(checkoutRequestId, data) {
  transactions.set(checkoutRequestId, { status: "PENDING", ...data });
}

export function handleCallback(body) {
  const cb = body?.Body?.stkCallback;
  if (!cb) throw new Error("Malformed callback");

  const result = {
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: cb.ResultCode,
    resultDesc: cb.ResultDesc,
    status: cb.ResultCode === 0 ? "SUCCESS" : "FAILED",
  };

  if (cb.ResultCode === 0) {
    const items = cb.CallbackMetadata?.Item || [];
    const get = (name) => items.find((i) => i.Name === name)?.Value;
    result.amount = get("Amount");
    result.receipt = get("MpesaReceiptNumber");
    result.phone = get("PhoneNumber");
  }

  const existing = transactions.get(result.checkoutRequestId) || {};
  transactions.set(result.checkoutRequestId, { ...existing, ...result });
  return result;
}

export function getTransaction(id) {
  return transactions.get(id);
}