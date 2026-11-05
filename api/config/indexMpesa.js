import "dotenv/config";

const isProd = process.env.MPESA_ENV === "production";

const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  baseUrl: isProd
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke",
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  shortcode: process.env.MPESA_SHORTCODE,
  passkey: process.env.MPESA_PASSKEY,
  callbackUrl: process.env.MPESA_CALLBACK_URL,
};

export default config;