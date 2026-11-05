import axios from "axios";
import config from "../config/indexMpesa.js";
import { getToken } from "./auth.js";
import { timestamp, formatPhone } from "../utils/format.js";

export async function stkPush({ phone, amount, accountRef = "Payment", description = "Payment" }) {
  const token = await getToken();
  const ts = timestamp();
  const msisdn = formatPhone(phone);

  const password = Buffer.from(
    `${config.shortcode}${config.passkey}${ts}`
  ).toString("base64");

  const payload = {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: ts,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(amount),
    PartyA: msisdn,
    PartyB: config.shortcode,
    PhoneNumber: msisdn,
    CallBackURL: config.callbackUrl,
    AccountReference: accountRef.slice(0, 12),
    TransactionDesc: description.slice(0, 13),
  };

  const { data } = await axios.post(
    `${config.baseUrl}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return data;
}